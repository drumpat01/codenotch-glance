#!/bin/zsh
# Runs push.mjs every hour in the background (macOS LaunchAgent, your user only). Re-run to update; see README to remove.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then echo "Node.js not found. Install it from https://nodejs.org (LTS) and run this again."; exit 1; fi
PLIST="$HOME/Library/LaunchAgents/cool.glance.codenotch.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>cool.glance.codenotch</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/push.mjs</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>$DIR/push-error.log</string>
</dict></plist>
EOF
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Scheduled: pushes every hour (quiet hours in config.json). Log: $DIR/push.log"
