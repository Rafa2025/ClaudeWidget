#!/usr/bin/env python3
"""Read Chrome claude.ai cookies and print JSON: {"sk": "...", "org": "..."}.
Invoked as a subprocess by usage.js. Exits with empty JSON on any failure."""
import sys, json, os, shutil, tempfile, sqlite3, re, platform

def main():
    result = {'sk': '', 'org': ''}
    try:
        key  = get_key()
        if not key:
            print(json.dumps(result)); return
        db   = get_db_path()
        if not db or not os.path.exists(db):
            print(json.dumps(result)); return
        rows = read_rows(db)
        vals = decrypt_rows(rows, key)
        sk   = vals.get('sessionKey', '')
        m    = re.search(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
                         vals.get('lastActiveOrg', ''))
        org  = m.group(0) if m else ''
        if sk and org:
            result = {'sk': sk, 'org': org}
    except Exception as e:
        pass
    print(json.dumps(result))

def get_key():
    p = platform.system()
    if p == 'Linux':
        import subprocess
        try:
            pw = subprocess.check_output(
                ['secret-tool', 'lookup', 'application', 'chrome'],
                timeout=3, stderr=subprocess.DEVNULL
            ).decode().strip()
            if pw:
                return _derive(pw, 1)
        except Exception:
            pass
        # Try gnome-keyring via gi
        try:
            import gi
            gi.require_version('Secret', '1')
            from gi.repository import Secret
            schema = Secret.Schema.new('chrome_libsecret_os_crypt_password_v2',
                                       Secret.SchemaFlags.NONE,
                                       {'application': Secret.SchemaAttributeType.STRING})
            pw = Secret.password_lookup_sync(schema, {'application': 'chrome'}, None)
            if pw:
                return _derive(pw, 1)
        except Exception:
            pass
    elif p == 'Darwin':
        import subprocess
        try:
            pw = subprocess.check_output(
                ['security', 'find-generic-password', '-a', 'Chrome',
                 '-s', 'Chrome Safe Storage', '-w'],
                timeout=3, stderr=subprocess.DEVNULL
            ).decode().strip()
            if pw:
                return _derive(pw, 1003)
        except Exception:
            pass
    elif p == 'Windows':
        # DPAPI — the master key itself isn't password-derived; skip for now
        pass
    return None

def _derive(password, iterations):
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.backends import default_backend
    kdf = PBKDF2HMAC(algorithm=hashes.SHA1(), length=16,
                     salt=b'saltysalt', iterations=iterations,
                     backend=default_backend())
    return kdf.derive(password.encode('utf-8'))

def get_db_path():
    p = platform.system()
    h = os.path.expanduser('~')
    if p == 'Linux':
        return os.path.join(h, '.config/google-chrome/Default/Cookies')
    if p == 'Darwin':
        return os.path.join(h, 'Library/Application Support/Google/Chrome/Default/Cookies')
    if p == 'Windows':
        return os.path.join(os.environ.get('LOCALAPPDATA', ''),
                            'Google', 'Chrome', 'User Data', 'Default', 'Cookies')
    return None

def read_rows(db_path):
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

def decrypt_rows(rows, key):
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.backends import default_backend
    vals = {}
    for name, enc, plain in rows:
        if plain:
            vals[name] = plain
        elif enc and enc[:3] in (b'v10', b'v11'):
            try:
                d   = Cipher(algorithms.AES(key), modes.CBC(b' ' * 16),
                             backend=default_backend()).decryptor()
                dec = d.update(enc[3:]) + d.finalize()
                pad = dec[-1]
                raw = dec[:-pad]
                idx = raw.find(b'sk-ant')
                vals[name] = (raw[idx:] if idx >= 0 else raw).decode('ascii', errors='ignore').rstrip('\x00')
            except Exception:
                pass
    return vals

if __name__ == '__main__':
    main()
