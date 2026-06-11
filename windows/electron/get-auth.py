#!/usr/bin/env python3
"""Read Chrome claude.ai cookies on Windows using DPAPI + AES-GCM.
Prints JSON: {"sk": "...", "org": "..."}. Exits with empty values on failure.

Note: Chrome 127+ uses App-Bound Encryption (v20 prefix) which cannot be
decrypted outside of Chrome. Older cookies (v10 prefix) are fully supported.
"""
import sys, json, os, shutil, tempfile, sqlite3, re, base64, ctypes, ctypes.wintypes

COOKIE_PATHS = [
    # Chrome 96+
    os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Google', 'Chrome', 'User Data', 'Default', 'Network', 'Cookies'),
    # Older Chrome
    os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Google', 'Chrome', 'User Data', 'Default', 'Cookies'),
]

LOCAL_STATE = os.path.join(
    os.environ.get('LOCALAPPDATA', ''),
    'Google', 'Chrome', 'User Data', 'Local State'
)

class DATA_BLOB(ctypes.Structure):
    _fields_ = [('cbData', ctypes.wintypes.DWORD),
                ('pbData', ctypes.POINTER(ctypes.c_char))]


def dpapi_decrypt(data: bytes) -> bytes | None:
    buf     = ctypes.create_string_buffer(data)
    blob_in = DATA_BLOB(len(data), buf)
    blob_out = DATA_BLOB()
    ok = ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)
    )
    if not ok:
        return None
    result = ctypes.string_at(blob_out.pbData, blob_out.cbData)
    ctypes.windll.kernel32.LocalFree(blob_out.pbData)
    return result


def get_aes_key() -> bytes | None:
    """Extract the AES key from Chrome's Local State file via DPAPI."""
    try:
        with open(LOCAL_STATE, 'r', encoding='utf-8') as f:
            state = json.load(f)
        enc_key_b64 = state.get('os_crypt', {}).get('encrypted_key', '')
        if not enc_key_b64:
            return None
        enc_key = base64.b64decode(enc_key_b64)
        # First 5 bytes are the literal "DPAPI" prefix
        return dpapi_decrypt(enc_key[5:])
    except Exception:
        return None


def decrypt_value(enc_value: bytes, aes_key: bytes) -> str:
    """Decrypt a Chrome cookie value (v10 AES-GCM or legacy DPAPI)."""
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


def find_cookie_db() -> str | None:
    for p in COOKIE_PATHS:
        if os.path.exists(p):
            return p
    return None


def read_rows(db_path: str) -> list:
    q = ("SELECT name, encrypted_value, value FROM cookies"
         " WHERE host_key LIKE '%claude.ai%'"
         " AND name IN ('sessionKey','lastActiveOrg')")
    # Try read-only URI first (file not locked)
    try:
        uri  = 'file:' + db_path + '?immutable=1&mode=ro'
        conn = sqlite3.connect(uri, uri=True, timeout=2)
        rows = conn.execute(q).fetchall()
        conn.close()
        return rows
    except Exception:
        pass
    # Fall back to temp-file copy
    tmp = tempfile.mktemp(suffix='.sqlite')
    try:
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


def main():
    result = {'sk': '', 'org': ''}
    try:
        aes_key = get_aes_key()
        if not aes_key:
            print(json.dumps(result)); return

        db = find_cookie_db()
        if not db:
            print(json.dumps(result)); return

        rows = read_rows(db)
        vals = {}
        for name, enc, plain in rows:
            if plain:
                vals[name] = plain
            elif enc:
                vals[name] = decrypt_value(bytes(enc), aes_key)

        sk  = vals.get('sessionKey', '')
        m   = re.search(
            r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
            vals.get('lastActiveOrg', '')
        )
        org = m.group(0) if m else ''

        if sk and org:
            result = {'sk': sk, 'org': org}
    except Exception:
        pass
    print(json.dumps(result))


if __name__ == '__main__':
    main()
