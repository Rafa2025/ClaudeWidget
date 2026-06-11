#!/usr/bin/env python3
"""Read claude.ai cookies on Windows using DPAPI + AES-GCM.
Tries Chrome first, then Edge as fallback (Edge rarely uses App-Bound Encryption).
Prints JSON: {"sk": "...", "org": "..."}. Exits with empty values on failure.

Note: Chrome 127+ uses App-Bound Encryption (v20 prefix) which cannot be
decrypted outside of Chrome. Edge is tried as a fallback in that case.
"""
import sys, json, os, shutil, tempfile, sqlite3, re, base64, ctypes, ctypes.wintypes

_LOCAL = os.environ.get('LOCALAPPDATA', '')

_APPDATA = os.environ.get('APPDATA', '')

BROWSERS = [
    {
        'name': 'Chrome',
        'local_state': os.path.join(_LOCAL, 'Google', 'Chrome', 'User Data', 'Local State'),
        'cookie_paths': [
            os.path.join(_LOCAL, 'Google', 'Chrome', 'User Data', 'Default', 'Network', 'Cookies'),
            os.path.join(_LOCAL, 'Google', 'Chrome', 'User Data', 'Default', 'Cookies'),
        ],
    },
    {
        'name': 'Edge',
        'local_state': os.path.join(_LOCAL, 'Microsoft', 'Edge', 'User Data', 'Local State'),
        'cookie_paths': [
            os.path.join(_LOCAL, 'Microsoft', 'Edge', 'User Data', 'Default', 'Network', 'Cookies'),
            os.path.join(_LOCAL, 'Microsoft', 'Edge', 'User Data', 'Default', 'Cookies'),
        ],
    },
    {
        'name': 'Brave',
        'local_state': os.path.join(_LOCAL, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Local State'),
        'cookie_paths': [
            os.path.join(_LOCAL, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Network', 'Cookies'),
            os.path.join(_LOCAL, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Cookies'),
        ],
    },
]


class DATA_BLOB(ctypes.Structure):
    _fields_ = [('cbData', ctypes.wintypes.DWORD),
                ('pbData', ctypes.POINTER(ctypes.c_char))]


def dpapi_decrypt(data: bytes) -> bytes | None:
    buf      = ctypes.create_string_buffer(data)
    blob_in  = DATA_BLOB(len(data), buf)
    blob_out = DATA_BLOB()
    ok = ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)
    )
    if not ok:
        return None
    result = ctypes.string_at(blob_out.pbData, blob_out.cbData)
    ctypes.windll.kernel32.LocalFree(blob_out.pbData)
    return result


def get_aes_key(local_state_path: str) -> bytes | None:
    """Extract the AES-256 key from a browser Local State file via DPAPI."""
    try:
        with open(local_state_path, 'r', encoding='utf-8') as f:
            state = json.load(f)
        enc_key_b64 = state.get('os_crypt', {}).get('encrypted_key', '')
        if not enc_key_b64:
            return None
        enc_key = base64.b64decode(enc_key_b64)
        return dpapi_decrypt(enc_key[5:])  # strip 5-byte "DPAPI" prefix
    except Exception:
        return None


def decrypt_value(enc_value: bytes, aes_key: bytes) -> str:
    """Decrypt a Chromium cookie value (v10 AES-GCM or legacy DPAPI)."""
    if not enc_value:
        return ''
    prefix = enc_value[:3]
    if prefix == b'v20':
        # App-Bound Encryption (Chrome 127+) — cannot decrypt outside Chrome
        return ''
    if prefix == b'v10':
        # AES-256-GCM: 3-byte prefix + 12-byte nonce + ciphertext+tag
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            nonce      = enc_value[3:15]
            ciphertext = enc_value[15:]
            return AESGCM(aes_key).decrypt(nonce, ciphertext, None).decode('utf-8', errors='ignore')
        except Exception:
            return ''
    # Legacy: raw DPAPI blob
    try:
        result = dpapi_decrypt(enc_value)
        return result.decode('utf-8', errors='ignore') if result else ''
    except Exception:
        return ''


def _copy_locked(src: str, dst: str) -> bool:
    """Copy a file that may be exclusively locked by another process (e.g. Chrome).
    Uses CreateFile with FILE_SHARE_READ|WRITE|DELETE so we can open it regardless."""
    GENERIC_READ              = 0x80000000
    FILE_SHARE_READ           = 0x00000001
    FILE_SHARE_WRITE          = 0x00000002
    FILE_SHARE_DELETE         = 0x00000004
    OPEN_EXISTING             = 3
    INVALID_HANDLE_VALUE      = ctypes.wintypes.HANDLE(-1).value
    h = ctypes.windll.kernel32.CreateFileW(
        src, GENERIC_READ,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        None, OPEN_EXISTING, 0, None,
    )
    if h == INVALID_HANDLE_VALUE:
        return False
    try:
        buf  = ctypes.create_string_buffer(65536)
        read = ctypes.c_ulong(0)
        with open(dst, 'wb') as out:
            while True:
                ok = ctypes.windll.kernel32.ReadFile(h, buf, 65536, ctypes.byref(read), None)
                if not ok or read.value == 0:
                    break
                out.write(buf.raw[:read.value])
        return True
    finally:
        ctypes.windll.kernel32.CloseHandle(h)


def read_rows(db_path: str) -> list:
    q = ("SELECT name, encrypted_value, value FROM cookies"
         " WHERE host_key LIKE '%claude.ai%'"
         " AND name IN ('sessionKey','lastActiveOrg')")
    tmp = tempfile.mktemp(suffix='.sqlite')
    try:
        copied = _copy_locked(db_path, tmp)
        if not copied:
            shutil.copy2(db_path, tmp)
        conn = sqlite3.connect(tmp, timeout=2)
        rows = conn.execute(q).fetchall()
        conn.close()
        return rows
    except Exception:
        return []
    finally:
        try: os.unlink(tmp)
        except: pass


def try_browser(browser: dict):
    """Attempt auth extraction from one browser. Returns {'sk':..,'org':..} or None."""
    aes_key = get_aes_key(browser['local_state'])
    if not aes_key:
        return None
    db = next((p for p in browser['cookie_paths'] if os.path.exists(p)), None)
    if not db:
        return None
    rows = read_rows(db)
    vals = {}
    for name, enc, plain in rows:
        if plain:
            vals[name] = plain
        elif enc:
            v = decrypt_value(bytes(enc), aes_key)
            if v:
                vals[name] = v
    sk = vals.get('sessionKey', '')
    m  = re.search(
        r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
        vals.get('lastActiveOrg', '')
    )
    org = m.group(0) if m else ''
    return {'sk': sk, 'org': org} if (sk and org) else None


CACHE_FILE = os.path.join(os.environ.get('TEMP', ''), 'claude-auth-cache.json')


def load_cache() -> dict | None:
    try:
        with open(CACHE_FILE, 'r') as f:
            d = json.load(f)
        if d.get('sk') and d.get('org'):
            return d
    except Exception:
        pass
    return None


def save_cache(result: dict) -> None:
    try:
        with open(CACHE_FILE, 'w') as f:
            json.dump(result, f)
    except Exception:
        pass


def main():
    result = {'sk': '', 'org': ''}
    try:
        for browser in BROWSERS:
            r = try_browser(browser)
            if r:
                result = r
                save_cache(result)
                break
    except Exception:
        pass
    # Fall back to cached credentials when browser file is locked
    if not result['sk']:
        cached = load_cache()
        if cached:
            result = cached
    print(json.dumps(result))


if __name__ == '__main__':
    main()
