// Prints the T3 Code app the helper should follow. Run by install.sh, before it changes anything.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const T3_BUNDLE_ID = "com.t3tools.t3code";
const home = homedir();
const launchAgent = join(home, "Library/LaunchAgents/com.t3sharks.helper.plist");
const searchDirs = process.env.T3_SHARKS_APP_DIRS?.split(":") ?? ["/Applications", join(home, "Applications")];

function readPlist(path) {
  try {
    return JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", path], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return null;
  }
}

const bundleId = (app) => readPlist(join(app, "Contents/Info.plist"))?.CFBundleIdentifier;
const isT3App = (app) => bundleId(app) === T3_BUNDLE_ID;

function installedApps() {
  return searchDirs.flatMap((dir) => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((name) => name.startsWith("T3 Code") && name.endsWith(".app")).map((name) => join(dir, name));
  }).filter(isT3App);
}

function runningApps() {
  const rows = execFileSync("ps", ["-axww", "-o", "command="], { encoding: "utf8" }).split("\n");
  const apps = new Set(rows.flatMap((row) => row.trim().match(/^(\/.*?\.app)\/Contents\/MacOS\//)?.[1] ?? []));
  return [...apps].filter(isT3App);
}

function configuredApp() {
  const app = readPlist(launchAgent)?.EnvironmentVariables?.T3_SHARKS_APP;
  return app && isT3App(app) ? app : null;
}

function choose({ running, configured, installed }) {
  if (running.length === 1) return { app: running[0], why: "it is running" };
  if (configured) return { app: configured, why: "the last install chose it" };
  if (installed.length === 1) return { app: installed[0], why: "it is the only one installed" };
  return { candidates: [...new Set([...running, ...installed])].sort() };
}

function fail(lines) {
  console.error(lines.join("\n"));
  process.exit(1);
}

const explicit = process.env.T3_APP;
if (explicit) {
  const app = resolve(explicit);
  const id = bundleId(app);
  if (id !== T3_BUNDLE_ID) fail([`T3_APP is not a T3 Code app: ${app}`, `Expected bundle ID ${T3_BUNDLE_ID}, found ${id ?? "no readable Info.plist"}.`]);
  console.error(`Using ${app} because T3_APP chose it.`);
  console.log(app);
  process.exit(0);
}

const { app, why, candidates } = choose({ running: runningApps(), configured: configuredApp(), installed: installedApps() });
if (app) {
  console.error(`Using ${app} because ${why}. To choose another, run: T3_APP="/path/to/T3 Code.app" ./install.sh`);
  console.log(app);
  process.exit(0);
}
if (!candidates.length) fail(["Could not find T3 Code. Install it, or run:", '  T3_APP="/path/to/T3 Code.app" ./install.sh']);
fail([
  "Found more than one T3 Code app, so t3-sharks needs you to choose:",
  ...candidates.map((candidate) => `  ${candidate}`),
  "Open the one you use and run install.sh again, or run:",
  `  T3_APP="${candidates[0]}" ./install.sh`,
]);
