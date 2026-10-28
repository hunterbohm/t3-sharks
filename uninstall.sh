#!/bin/bash
# Removes t3-sharks. T3 itself is never changed, so nothing else needs undoing.
set -euo pipefail
label=com.t3sharks.helper
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$label.plist"
rm -rf "$HOME/Library/Application Support/t3-sharks"
echo "t3-sharks removed. The sharks are gone after T3's next start."
