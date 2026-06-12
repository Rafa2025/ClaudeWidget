# Distributing the Widget (no source code)

This guide is for handing the widget to someone who should **not** get the repo —
just one file they run. Packaged builds **self-register their Claude Code hooks
on first launch**, so the recipient does not run any installer.

## What the recipient does

| Platform | File they get | How they run it |
|----------|---------------|-----------------|
| Linux | `Claude Code Widget-1.0.0.AppImage` | `chmod +x` it, then double-click or `./Claude*.AppImage` |
| Windows | `Claude Code Widget Setup 1.0.0.exe` | Double-click → it installs and launches |
| macOS | `Claude Code Widget-1.0.0.dmg` | Open, drag to Applications, then see the Gatekeeper note below |

On first launch the app:
1. Writes its hook scripts to `~/.claude/hooks/` and registers them in
   `~/.claude/settings.json` (existing hooks are preserved).
2. (macOS) prompts for Accessibility permission so it can type replies.

Then the recipient just opens Claude Code — the widget reacts automatically.

### Recipient prerequisites

- **Core status (thinking / done) needs nothing** beyond the OS — uses `curl`
  (Linux/macOS) or built-in PowerShell (Windows), both always present.
- **"Needs input" messages** (Notification hook) need `python3` on Linux/macOS.
  Pre-installed on most Linux and on macOS via `xcode-select --install`.
- **Usage bars** need `python3` + the `cryptography` package and Chrome signed in
  to claude.ai. Without them the bars just stay at 0% — everything else works.

---

## How to build each platform

Builds are produced with `electron-builder`. **You can only build a platform on
that platform** (or via CI): a Linux box builds the AppImage, a Mac builds the
dmg, a Windows box builds the exe. There is no reliable cross-compile.

### Linux (AppImage)

```bash
cd linux/electron
npm install
npx electron-builder --linux AppImage
# → linux/electron/dist/Claude Code Widget-1.0.0.AppImage
```

### Windows (installer exe)

```powershell
cd windows\electron
npm install
npx electron-builder --win nsis
# → windows\electron\dist\Claude Code Widget Setup 1.0.0.exe
```

For a no-install single exe instead, use `--win portable`.

### macOS (dmg) — two ways

**You cannot build the Mac dmg on Linux or Windows.** Pick one:

**A. GitHub Actions (no Mac required) — recommended**

This repo has `.github/workflows/build-macos.yml`. On GitHub → **Actions** tab →
**Build macOS app** → **Run workflow**. When it finishes, download the
`claude-code-widget-macos` artifact (the `.dmg` is inside). Or push a tag:

```bash
git tag v1.0.0 && git push origin v1.0.0
```

**B. On a Mac directly**

```bash
cd mac/electron
npm install
npx electron-builder --mac dmg          # CSC_IDENTITY_AUTO_DISCOVERY=false if it tries to sign
# → mac/electron/dist/Claude Code Widget-1.0.0.dmg
```

The frontend (`app/dist`) is bundled automatically via `build:frontend`; if you
haven't built it, run `npm run build` in `app/` first.

### macOS Gatekeeper — what the recipient must do

The build is **unsigned**, and on recent macOS (Ventura/Sonoma/Sequoia) the
right-click → Open trick often no longer works for apps downloaded through a
browser, because the file carries a quarantine flag. The reliable fix is for the
recipient to clear it once in Terminal after dragging the app to Applications:

```bash
xattr -cr "/Applications/Claude Code Widget.app"
```

Then it opens normally. (Signing with an Apple Developer ID removes this step
entirely — worth it if you'll distribute widely.)

### macOS recipient prerequisites

- **Core status works out of the box** (bash + curl, both built into macOS).
- **Usage bars and "needs input" messages** need `python3`. macOS only provides
  it once Command Line Tools are installed: `xcode-select --install`. Usage bars
  additionally need `pip3 install cryptography` and Chrome signed in to claude.ai.
- On first launch the app asks for **Accessibility** permission (so it can type
  replies) — approve it under System Settings → Privacy & Security → Accessibility.

---

## Notes & caveats

- **Code signing**: these builds are unsigned. macOS shows a Gatekeeper warning
  (the right-click→Open step bypasses it); Windows SmartScreen may warn ("More
  info → Run anyway"). For a polished hand-off, sign with an Apple Developer ID /
  Windows code-signing cert.
- **Self-setup is idempotent**: re-running a newer build refreshes the hook
  scripts and re-points `settings.json` without duplicating entries.
- **To undo on the recipient's machine**: delete the `widget-*` files from
  `~/.claude/hooks/` and remove their entries from `~/.claude/settings.json`.
