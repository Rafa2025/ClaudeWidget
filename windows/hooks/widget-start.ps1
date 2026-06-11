# Claude Code Widget hook — fires on SessionStart
# Captures the terminal window handle and launches the widget if not running.
"[$(Get-Date -Format 'HH:mm:ss')] SessionStart hook fired" | Out-File "$env:TEMP\widget-hook.log" -Append

# ── Save Claude Code PID for inject.py (WriteConsoleInput) ────────────────────
# The parent of this hook script is the node.exe running Claude Code.
# inject.py uses AttachConsole(that_pid) to write directly to its console buffer.
try {
    $q = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
    $claudePid = $q.ParentProcessId
    [System.IO.File]::WriteAllText("$env:TEMP\claude-console-pid.txt", $claudePid.ToString())
} catch {}

# ── Capture terminal HWND (fallback for SendInput) ────────────────────────────
try {
    Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
public class WinUtil2 {
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    public static IntPtr FindTerminalHwnd() {
        int pid = Process.GetCurrentProcess().Id;
        for (int i = 0; i < 8; i++) {
            try {
                var q = new System.Management.ManagementObjectSearcher(
                    "SELECT ParentProcessId FROM Win32_Process WHERE ProcessId=" + pid);
                foreach (var o in q.Get()) { pid = Convert.ToInt32(o["ParentProcessId"]); break; }
                var p = Process.GetProcessById(pid);
                if (p.MainWindowHandle != IntPtr.Zero && IsWindowVisible(p.MainWindowHandle))
                    return p.MainWindowHandle;
            } catch { break; }
        }
        return IntPtr.Zero;
    }
}
"@ -ReferencedAssemblies System.Management
    $hwnd = [WinUtil2]::FindTerminalHwnd()
    if ($hwnd -ne [IntPtr]::Zero) {
        [System.IO.File]::WriteAllText("$env:TEMP\claude-terminal-hwnd.txt", $hwnd.ToString())
    }
} catch {}

# ── Launch widget if not running ───────────────────────────────────────────────
$f = "$env:TEMP\claude-widget-port.txt"

if (Test-Path $f) {
    $port = (Get-Content $f -Raw -ErrorAction SilentlyContinue).Trim()
    if ($port) {
        try {
            Invoke-RestMethod `
                -Uri "http://127.0.0.1:$port/api/state" `
                -Method POST `
                -Body '{"state":"idle"}' `
                -ContentType 'application/json' `
                -TimeoutSec 1 | Out-Null
            exit 0
        } catch {}
    }
}

$dirFile = Join-Path $PSScriptRoot "electron-dir.txt"
if (-not (Test-Path $dirFile)) { exit 0 }
$electronDir = (Get-Content $dirFile -Raw).Trim()

$electronExe = Join-Path $electronDir "node_modules\electron\dist\electron.exe"
if (Test-Path $electronExe) {
    Start-Process -FilePath $electronExe -ArgumentList $electronDir -WindowStyle Normal
    exit 0
}

$npm = "C:\Program Files\nodejs\npm.cmd"
if (Test-Path $npm) {
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c `"$npm`" start --prefix `"$electronDir`"" `
        -WindowStyle Hidden
}
