import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repo = dirname(dirname(fileURLToPath(import.meta.url)));

export function fakeApp(dir, name, { bundleId = "com.t3tools.t3code" } = {}) {
  const app = join(dir, `${name}.app`);
  mkdirSync(join(app, "Contents/MacOS"), { recursive: true });
  writeFileSync(join(app, `Contents/MacOS/${name}`), "");
  writeFileSync(join(app, "Contents/Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${bundleId}</string>
<key>CFBundleExecutable</key><string>${name}</string>
</dict></plist>`);
  return app;
}

// A temp HOME and a PATH whose ps and launchctl are fakes, so nothing here can see or change the real T3 or launchd.
export function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "t3-sharks-test-"));
  const home = join(root, "home");
  const apps = join(root, "apps");
  const bin = join(root, "bin");
  const launchctlLog = join(root, "launchctl.log");
  const psRows = join(root, "ps.txt");
  for (const dir of [home, apps, bin]) mkdirSync(dir);
  writeFileSync(psRows, "");
  const script = (name, body) => {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`);
    chmodSync(join(bin, name), 0o755);
  };
  script("launchctl", `echo "$*" >> "${launchctlLog}"`);
  script("ps", `case "$*" in *pid=*) cat "${psRows}";; *) cut -d' ' -f3- "${psRows}";; esac`);
  return {
    root, home, apps, launchctlLog,
    env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, T3_SHARKS_APP_DIRS: apps, T3_APP: "" },
    setRunning(rows) {
      writeFileSync(psRows, rows.map(({ pid = 99999, age = "00:03", command }) => `${pid} ${age} ${command}\n`).join(""));
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function mainProcess(app) {
  const name = app.split("/").pop().replace(/\.app$/, "");
  return { command: `${app}/Contents/MacOS/${name}` };
}

export function run(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
