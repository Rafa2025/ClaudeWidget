#!/usr/bin/env python3
"""Type text into the Claude Code terminal window on Windows.
Usage: inject.py <text>
Uses SendInput (Unicode) for reliable character delivery.
"""
import sys, os, ctypes, ctypes.wintypes, time, subprocess

text = sys.argv[1] if len(sys.argv) > 1 else ''
if not text:
    sys.exit(0)

user32   = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

# ── Window focus ───────────────────────────────────────────────────────────────

def _hwnd_visible(hwnd):
    return bool(user32.IsWindow(hwnd) and user32.IsWindowVisible(hwnd))

def _hwnd_from_pid(pid):
    results = []
    EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)
    found_pid = ctypes.wintypes.DWORD()
    def cb(hwnd, _):
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(found_pid))
        if found_pid.value == pid and user32.IsWindowVisible(hwnd):
            buf = ctypes.create_unicode_buffer(256)
            user32.GetWindowTextW(hwnd, buf, 256)
            if buf.value:
                results.append((hwnd, buf.value))
        return True
    user32.EnumWindows(EnumWindowsProc(cb), 0)
    return results[0][0] if results else 0

def _ps(cmd):
    r = subprocess.run(['powershell', '-NoProfile', '-Command', cmd],
                       capture_output=True, text=True, timeout=5)
    return r.stdout.strip()

def find_terminal_hwnd():
    # 1. Check saved HWND from SessionStart hook
    hwnd_file = os.path.join(os.environ.get('TEMP', ''), 'claude-terminal-hwnd.txt')
    try:
        if os.path.exists(hwnd_file):
            hwnd = int(open(hwnd_file).read().strip())
            if _hwnd_visible(hwnd):
                return hwnd
    except Exception:
        pass

    # 2. Walk process tree: powershell → conhost/WindowsTerminal
    try:
        pid = os.getpid()
        for _ in range(6):
            q = f'(Get-CimInstance Win32_Process -Filter "ProcessId={pid}").ParentProcessId'
            val = _ps(q)
            if not val or not val.isdigit():
                break
            pid = int(val)
            hwnd_val = _ps(f'(Get-Process -Id {pid} -ErrorAction SilentlyContinue).MainWindowHandle')
            if hwnd_val and hwnd_val not in ('0', ''):
                hwnd = int(hwnd_val)
                if _hwnd_visible(hwnd):
                    return hwnd
    except Exception:
        pass

    # 3. Fall back: search well-known terminal process names
    for name in ['WindowsTerminal', 'powershell', 'cmd', 'pwsh', 'alacritty', 'wezterm-gui']:
        val = _ps(
            f'(Get-Process -Name "{name}" -ErrorAction SilentlyContinue'
            f' | Where-Object MainWindowHandle | Select-Object -First 1).MainWindowHandle'
        )
        if val and val not in ('0', ''):
            try:
                hwnd = int(val)
                if _hwnd_visible(hwnd):
                    return hwnd
            except Exception:
                pass
    return 0

hwnd = find_terminal_hwnd()
if hwnd:
    user32.ShowWindow(hwnd, 9)          # SW_RESTORE
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.45)

# ── SendInput (Unicode) ────────────────────────────────────────────────────────

INPUT_KEYBOARD    = 1
KEYEVENTF_UNICODE = 0x0004
KEYEVENTF_KEYUP   = 0x0002

class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ('wVk',         ctypes.wintypes.WORD),
        ('wScan',       ctypes.wintypes.WORD),
        ('dwFlags',     ctypes.wintypes.DWORD),
        ('time',        ctypes.wintypes.DWORD),
        ('dwExtraInfo', ctypes.POINTER(ctypes.c_ulong)),
    ]

class _INPUT_UNION(ctypes.Union):
    _fields_ = [('ki', KEYBDINPUT), ('_pad', ctypes.c_byte * 24)]

class INPUT(ctypes.Structure):
    _fields_ = [('type', ctypes.wintypes.DWORD), ('_u', _INPUT_UNION)]

SZ = ctypes.sizeof(INPUT)

def _send(inputs):
    arr = (INPUT * len(inputs))(*inputs)
    user32.SendInput(len(inputs), arr, SZ)

def send_char(ch):
    code = ord(ch)
    down = INPUT(type=INPUT_KEYBOARD)
    down._u.ki.wScan   = code
    down._u.ki.dwFlags = KEYEVENTF_UNICODE
    up   = INPUT(type=INPUT_KEYBOARD)
    up._u.ki.wScan     = code
    up._u.ki.dwFlags   = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
    _send([down, up])
    time.sleep(0.015)

def send_enter():
    VK_RETURN = 0x0D
    down = INPUT(type=INPUT_KEYBOARD)
    down._u.ki.wVk = VK_RETURN
    up   = INPUT(type=INPUT_KEYBOARD)
    up._u.ki.wVk     = VK_RETURN
    up._u.ki.dwFlags = KEYEVENTF_KEYUP
    _send([down, up])

for ch in text:
    send_char(ch)
send_enter()
