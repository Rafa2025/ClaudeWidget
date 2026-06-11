#!/usr/bin/env python3
"""Type text into the Claude Code terminal on Windows.
Usage: inject.py <text>

Primary:  WriteConsoleInput — attaches to Claude Code's console and writes
          directly to its input buffer.  No window focus needed.
Fallback: SendInput (Unicode) via SetForegroundWindow.
"""
import sys, os, ctypes, ctypes.wintypes, time, subprocess

text = sys.argv[1] if len(sys.argv) > 1 else ''
if not text:
    sys.exit(0)

k32   = ctypes.windll.kernel32
user32 = ctypes.windll.user32

# ── Console PID (saved by widget-start.ps1 hook) ──────────────────────────────

def _read_pid_file(name):
    p = os.path.join(os.environ.get('TEMP', ''), name)
    try:
        v = open(p).read().strip()
        if v.isdigit():
            return int(v)
    except Exception:
        pass
    return 0


def _alive(pid):
    """True if a process with this id currently exists."""
    if not pid:
        return False
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    h = k32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
    if h:
        k32.CloseHandle(h)
        return True
    return False


def _hwnd_owner_pid(hwnd):
    """The process that owns a window (for a terminal window, the console host)."""
    pid = ctypes.wintypes.DWORD(0)
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    return pid.value


def console_candidate_pids():
    """Ordered, de-duplicated list of live PIDs whose console we might inject into.
    1. The Claude Code PID saved by the SessionStart hook (preferred - works for
       both classic conhost and ConPTY terminals).
    2. The process owning the saved terminal window (covers a stale PID file)."""
    out = []
    p = _read_pid_file('claude-console-pid.txt')
    if _alive(p):
        out.append(p)
    hwnd = _read_pid_file('claude-terminal-hwnd.txt')
    if hwnd:
        owner = _hwnd_owner_pid(hwnd)
        if _alive(owner) and owner not in out:
            out.append(owner)
    return out


# ── WriteConsoleInput ──────────────────────────────────────────────────────────

KEY_EVENT = 0x0001
VK_RETURN = 0x0D


class _uChar(ctypes.Union):
    _fields_ = [('UnicodeChar', ctypes.c_wchar), ('AsciiChar', ctypes.c_char)]


class KEY_EVENT_RECORD(ctypes.Structure):
    _fields_ = [
        ('bKeyDown',          ctypes.wintypes.BOOL),
        ('wRepeatCount',      ctypes.wintypes.WORD),
        ('wVirtualKeyCode',   ctypes.wintypes.WORD),
        ('wVirtualScanCode',  ctypes.wintypes.WORD),
        ('uChar',             _uChar),
        ('dwControlKeyState', ctypes.wintypes.DWORD),
    ]


class _Event(ctypes.Union):
    _fields_ = [('KeyEvent', KEY_EVENT_RECORD), ('_pad', ctypes.c_byte * 16)]


class INPUT_RECORD(ctypes.Structure):
    _fields_ = [('EventType', ctypes.wintypes.WORD), ('Event', _Event)]


def _make_key(ch, down):
    r = INPUT_RECORD()
    r.EventType = KEY_EVENT
    r.Event.KeyEvent.bKeyDown    = down
    r.Event.KeyEvent.wRepeatCount = 1
    r.Event.KeyEvent.uChar.UnicodeChar = ch
    return r


def write_console_input(pid, text):
    """Attach to pid's console and push text + Enter into the input buffer."""
    GENERIC_RW        = 0xC0000000
    FILE_SHARE_RW     = 0x3
    OPEN_EXISTING     = 3
    ATTACH_PARENT     = 0xFFFFFFFF
    INVALID           = ctypes.wintypes.HANDLE(-1).value

    k32.FreeConsole()
    if not k32.AttachConsole(pid):
        return False

    k32.CreateFileW.restype = ctypes.wintypes.HANDLE
    h = k32.CreateFileW('CONIN$', GENERIC_RW, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
    if h == INVALID:
        k32.FreeConsole()
        return False

    records = []
    for ch in text + '\r':
        records.append(_make_key(ch, True))
        records.append(_make_key(ch, False))

    arr     = (INPUT_RECORD * len(records))(*records)
    written = ctypes.wintypes.DWORD(0)
    ok      = k32.WriteConsoleInputW(h, arr, len(records), ctypes.byref(written))
    k32.CloseHandle(h)
    k32.FreeConsole()
    return bool(ok) and written.value > 0


# ── SendInput fallback ─────────────────────────────────────────────────────────

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


def _send_input(inputs):
    arr = (INPUT * len(inputs))(*inputs)
    user32.SendInput(len(inputs), arr, SZ)


def _send_char(ch):
    code = ord(ch)
    down = INPUT(type=INPUT_KEYBOARD)
    down._u.ki.wScan   = code
    down._u.ki.dwFlags = KEYEVENTF_UNICODE
    up   = INPUT(type=INPUT_KEYBOARD)
    up._u.ki.wScan     = code
    up._u.ki.dwFlags   = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP
    _send_input([down, up])
    time.sleep(0.015)


def _send_enter():
    down = INPUT(type=INPUT_KEYBOARD)
    down._u.ki.wVk = VK_RETURN
    up   = INPUT(type=INPUT_KEYBOARD)
    up._u.ki.wVk     = VK_RETURN
    up._u.ki.dwFlags = KEYEVENTF_KEYUP
    _send_input([down, up])


def _hwnd_visible(hwnd):
    return bool(user32.IsWindow(hwnd) and user32.IsWindowVisible(hwnd))


def _ps(cmd):
    r = subprocess.run(['powershell', '-NoProfile', '-Command', cmd],
                       capture_output=True, text=True, timeout=5)
    return r.stdout.strip()


def find_terminal_hwnd():
    hwnd_file = os.path.join(os.environ.get('TEMP', ''), 'claude-terminal-hwnd.txt')
    try:
        if os.path.exists(hwnd_file):
            hwnd = int(open(hwnd_file).read().strip())
            if _hwnd_visible(hwnd):
                return hwnd
    except Exception:
        pass
    for name in ['WindowsTerminal', 'powershell', 'cmd', 'pwsh']:
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


def sendinput_inject(text):
    hwnd = find_terminal_hwnd()
    if hwnd:
        user32.ShowWindow(hwnd, 9)
        user32.SetForegroundWindow(hwnd)
        time.sleep(0.5)
    for ch in text:
        _send_char(ch)
    _send_enter()


# ── Main ───────────────────────────────────────────────────────────────────────

# Try WriteConsoleInput first using the saved Claude Code PID
for pid in console_candidate_pids():
    if write_console_input(pid, text):
        sys.exit(0)

# Fallback: SendInput with window focus
sendinput_inject(text)
