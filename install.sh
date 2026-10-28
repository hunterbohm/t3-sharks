#!/bin/bash
# Installs t3-sharks for the current macOS user. Safe to run again to update.
set -euo pipefail
label=com.t3sharks.helper
home="$HOME/Library/Application Support/t3-sharks"
plist="$HOME/Library/LaunchAgents/$label.plist"
src=$(cd "$(dirname "$0")" && pwd)

[[ "$(uname -s)" == Darwin ]] || { echo "t3-sharks needs macOS." >&2; exit 1; }
node=$(command -v node || true)
[[ -n "$node" ]] || { echo "t3-sharks needs Node.js 22 or newer: https://nodejs.org" >&2; exit 1; }
(( $("$node" -p 'process.versions.node.split(".")[0]') >= 22 )) || { echo "t3-sharks needs Node.js 22 or newer; found $("$node" --version)." >&2; exit 1; }

app=${T3_APP:-}
if [[ -z "$app" ]]; then
  for candidate in "/Applications/T3 Code (Nightly).app" "/Applications/T3 Code.app" "$HOME/Applications/T3 Code (Nightly).app" "$HOME/Applications/T3 Code.app"; do
    [[ -d "$candidate" ]] && { app=$candidate; break; }
  done
fi
[[ -d "$app" ]] || { echo "Could not find T3 Code. Set T3_APP=/path/to/T3 Code.app and run again." >&2; exit 1; }

mkdir -p "$home" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
rm -rf "$home/bin" "$home/assets"
cp -R "$src/bin" "$src/assets" "$src/package.json" "$home/"

cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>$label</string>
	<key>ProgramArguments</key>
	<array>
		<string>$node</string>
		<string>$home/bin/t3-sharks</string>
	</array>
	<key>EnvironmentVariables</key>
	<dict>
		<key>T3_SHARKS_APP</key>
		<string>$app</string>
	</dict>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>ProcessType</key>
	<string>Background</string>
	<key>StandardOutPath</key>
	<string>$HOME/Library/Logs/t3-sharks.log</string>
	<key>StandardErrorPath</key>
	<string>$HOME/Library/Logs/t3-sharks.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"
echo "t3-sharks installed for $(basename "$app")."
echo "Quit T3 and open it again. It closes and reopens once on start, then the sharks swim behind new chats."
