# Codenotch → Glance

Your AI usage limits from [Codenotch](https://github.com/vinzdg/codenotch) as iPhone Home Screen widgets, via [Glance](https://glance.cool). Your computer pushes your numbers to your own widget every hour; nothing is shared with anyone else.

Pick any of four widgets. Each style comes in a **Free** version (any Glance plan) and a **Pro** version (needs Glance Pro for charts and grids):

| Widget | Layout file | Glance plan | Looks like |
| --- | --- | --- | --- |
| **Codenotch Rings (Free)** | `layouts/free-rings.json` | Free | 5 logo circles; the ring turns green, amber (50%+) or red (80%+); % underneath |
| **Codenotch Rings (Pro)** | `layouts/pro-rings.json` | Pro | 5 logo rings that fill to the exact %, like the notch |
| **Codenotch Bars (Free)** | `layouts/free-bars.json` | Free | 5 rows: logo, name, `▰▰▰▰▱▱▱▱▱▱` bar, %, reset countdown and date ("in 2d · Mon 9/28") |
| **Codenotch Bars (Pro)** | `layouts/pro-bars.json` | Pro | 5 rows: logo, name, %, reset countdown and date, thin bar that fills to the exact % |
| **Codenotch Combo (Pro)** | `layouts/pro-combo.json` | Pro | Pro Bars and Pro Rings in one widget (tap to switch); bars and % turn green, amber (70%+) or red (90%+) |

The free Glance plan allows 3 widgets, so free users can run both free versions.

It shows whichever AI tools Codenotch tracks for you (Claude, Codex, Cursor, Grok, Antigravity, and others), up to five.

## Setup (about 10 minutes)

1. **Codenotch** installed and showing your usage (macOS or Windows).
2. **Node.js** LTS from https://nodejs.org.
3. **Glance** from the App Store; create a free account.
4. **Download this repo** (green **Code** button → **Download ZIP**, then unzip) and copy `config.example.json` to `config.json`. Check it can read Codenotch: `node push.mjs --print` in a terminal in the folder should list your AI tools.
5. **Create the widget(s):** follow [SETUP-PROMPT.md](SETUP-PROMPT.md) (your AI assistant does it with the Glance MCP), then paste the keys it gives you into `config.json`.
6. **First push:** in a terminal in this folder, `node push.mjs --force`. Then add a **medium** Glance widget to your Home Screen and pick your Codenotch widget.
7. **Every hour, automatically:**
   - macOS: `zsh schedule/install-mac.sh`
   - Windows (PowerShell): `powershell -ExecutionPolicy Bypass -File schedule\install-windows.ps1`

`node push.mjs --print` shows what would be sent without sending (it works before any widget exists). Each run adds a line to `push.log`; problems show as `ERR` lines there.

## Options (`config.json`)

- `providers`: only these, in Codenotch's names or ids, e.g. `["Claude", "Codex"]`. Empty = everything Codenotch tracks.
- `hideProviders`: never show these, e.g. `["Grok"]`.
- `quietHours`: no pushes from `start` to `end` (local 24h clock; `22` to `6` wraps past midnight). Default midnight–6 AM. The free Glance plan allows 24 updates a day per widget; hourly with quiet hours uses 18.

## Notes

- **macOS** reads Codenotch's last good reading per provider from its preferences (`defaults export com.vinz.codenotch`). The numbers are as fresh as Codenotch's own last update.
- **Windows** reads Codenotch's per-provider files in `%APPDATA%\codenotch`.
- Keep `config.json` private: the write keys let anyone update your widget.
- Remove the schedule: macOS `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/cool.glance.codenotch.plist`; Windows Task Scheduler → delete "Codenotch to Glance".
- `npm test` (or `node --test`) runs the unit tests; `node tools/build-layouts.mjs` regenerates the layouts.
