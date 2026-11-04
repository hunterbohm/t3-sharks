# t3-sharks

ASCII sharks swimming in [T3 Code](https://github.com/pingdotgg/t3code), behind new chats and in the margins of open chats. The sharks are [stackedlol's ascii-sharks](https://github.com/stackedlol/ascii-sharks), drawn grey, with a soft blur behind the heading and message box on new chats.

T3 itself is never changed, so its normal updates, nightly included, keep working.

macOS only. Needs the T3 Code desktop app and Node.js 22 or newer.

## Setup

Paste this into Claude Code (or any coding agent with a terminal):

```
Install t3-sharks for me: clone https://github.com/hunterbohm/t3-sharks to a temp folder, read install.sh so you know what it does, run it, then tell me to quit and reopen T3 Code.
```

Or run it yourself:

```sh
git clone https://github.com/hunterbohm/t3-sharks && ./t3-sharks/install.sh
```

Then quit T3 and open it again.

The installer follows the T3 app that is running. If none is, it keeps the app from your last install, or uses the only one installed. If it still can't tell, it lists the apps and changes nothing. To choose yourself:

```sh
T3_APP="/Applications/T3 Code (Beta).app" ./t3-sharks/install.sh
```

The helper follows one app at a time. Use the same command to switch between Nightly and Beta, then quit and reopen the new one.

## Update

```sh
git -C t3-sharks pull && ./t3-sharks/install.sh
```

A T3 already running with the sharks picks up the update within a few seconds. Otherwise, quit T3 and open it again.

## How it works

T3 only lets outside scripts into its window when it starts with a debugging port. A small background helper (a launchd agent) watches for T3 to start:

- When T3 starts without the port, whether from the Dock, at login, or after an update, the helper quits it within its first 30 seconds and opens it again with the port. You see one quick close and reopen.
- With the port open, the helper adds the shark script to every T3 window. T3 keeps it across reloads, so the helper doesn't need to check again.
- A T3 that has been open longer than 30 seconds is left alone until its next start.

On the empty new chat screen, nothing changes and the sharks swim behind everything. In an open chat, each side margin gets its own ocean with the same physics, and only the sharks are drawn. Nothing swims behind the messages or the message box. If either margin is too narrow, or T3 uses full-width chats, open chats show no sharks. With reduced motion on, they hold still.

## Good to know

- The debugging port listens only on your own Mac (127.0.0.1), but while T3 is open, any program on your Mac could use it to control T3.
- If T3 is installed somewhere unusual, run `T3_APP="/path/to/T3 Code.app" ./install.sh`. It must be a real T3 Code app, because the helper closes and reopens that app.
- The helper logs to `~/Library/Logs/t3-sharks.log`.
- Tested with T3 Code (Nightly) 0.1.7.

## Test

```sh
npm test
```

The tests need Node.js 22 or newer on macOS and don't touch your T3 install. The browser tests use Google Chrome or Chromium, and skip with a message if neither is found. Set `CHROME_PATH` to use another copy.

## Remove

```sh
./t3-sharks/uninstall.sh
```

## Credits

Sharks by [stackedlol](https://github.com/stackedlol/ascii-sharks), MIT. `scripts/build-ocean.sh` rebuilds `assets/ocean.js` from their repo at a pinned commit.
