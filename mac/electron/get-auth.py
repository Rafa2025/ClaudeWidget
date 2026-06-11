#!/usr/bin/env python3
"""Read Chrome claude.ai cookies on macOS via the login Keychain.
Prints JSON: {"sk": "...", "org": "..."}. Exits with empty values on failure.

The first run triggers a Keychain dialog for "Chrome Safe Storage" —
click "Always Allow" and subsequent runs are silent.
"""
import sys, json, os, shutil, tempfile, sqlite3, re, subprocess

COOKIE_DB = os.path.join(
    os.path.expanduser('~'),
    'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Cookies'
)


def get_aes_key() -> bytes | None:
    """Derive the AES key from the Chrome password stored in the Keychain."""
    password = _read_keychain_password()
    if password is None:
        return None
    # macOS Chrome uses 1003 PBKDF2 iterations (Linux uses 1)
    return _derive(password, iterations=1003)


def _read_keychain_password() -> str | None:
    try:
        pw = subprocess.check_output(
            ['security', 'find-generic-password', '-w', '-s', 'Chrome Safe Storage'],
            timeout=10, stderr=subprocess.DEVNULL
        ).decode().strip()
        if pw:
            return pw
    except Exception:
        pass
    return None


def _derive(password: str, iterations: int) -> bytes:
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.backends import default_backend
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA1(), length=16,
        salt=b'saltysalt', iterations=iterations,
        backend=default_backend()
    )
    return kdf.derive(password.encode('utf-8'))


def decrypt_value(enc: bytes, key: bytes) -> str:
    """Decrypt a v10 AES-CBC cookie value (macOS Chrome format).

    Newer Chrome versions prepend a 32-byte SHA256(host_key) to the
    plaintext; scanning for the value (sk-ant / UUID regex downstream)
    makes that prefix harmless.
    """
    if not enc or enc[:3] != b'v10':
        return ''
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.backends import default_backend
        d   = Cipher(algorithms.AES(key), modes.CBC(b' ' * 16),
                     backend=default_backend()).decryptor()
        dec = d.update(enc[3:]) + d.finalize()
        pad = dec[-1]
        raw = dec[:-pad]
        idx = raw.find(b'sk-ant')
        return (raw[idx:] if idx >= 0 else raw).decode('ascii', errors='ignore').rstrip('\x00')
    except Exception:
        return ''


def read_rows(db_path: str) -> list:
    q = ("SELECT name, encrypted_value, value FROM cookies"
         " WHERE host_key LIKE '%claude.ai%'"
         " AND name IN ('sessionKey','lastActiveOrg')")
    try:
        uri  = 'file:' + db_path + '?immutable=1&mode=ro'
        conn = sqlite3.connect(uri, uri=True, timeout=2)
        rows = conn.execute(q).fetchall()
        conn.close()
        return rows
    except Exception:
        pass
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
        if not os.path.exists(COOKIE_DB):
            print(json.dumps(result)); return

        key = get_aes_key()
        if not key:
            print(json.dumps(result)); return

        rows = read_rows(COOKIE_DB)
        vals = {}
        for name, enc, plain in rows:
            if plain:
                vals[name] = plain
            elif enc:
                vals[name] = decrypt_value(bytes(enc), key)

        sk = vals.get('sessionKey', '')
        m  = re.search(
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
