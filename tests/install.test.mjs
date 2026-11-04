import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, test } from "node:test";
import { fakeApp, mainProcess, repo, run, sandbox } from "./helpers.mjs";

const skip = process.platform === "darwin" ? false : "needs macOS plutil and defaults";
const install = (env) => run("/bin/bash", [join(repo, "install.sh")], env);
const select = (env) => run(process.execPath, [join(repo, "scripts/select-app.mjs")], env);

describe("choosing the T3 app", { skip }, () => {
  let box;
  beforeEach(() => { box = sandbox(); });
  afterEach(() => box.cleanup());

  test("the running app wins over one found earlier on disk", async () => {
    fakeApp(box.apps, "T3 Code (Beta)");
    const nightly = fakeApp(box.apps, "T3 Code (Nightly)");
    box.setRunning([mainProcess(nightly)]);
    const { code, stdout } = await select(box.env);
    assert.equal(code, 0);
    assert.equal(stdout.trim(), nightly);
  });

  test("the running app wins even when it lives outside the search folders", async () => {
    const away = fakeApp(box.root, "T3 Code");
    fakeApp(box.apps, "T3 Code (Nightly)");
    box.setRunning([mainProcess(away)]);
    assert.equal((await select(box.env)).stdout.trim(), away);
  });

  test("T3_APP wins over a running app", async () => {
    const beta = fakeApp(box.apps, "T3 Code (Beta)");
    const nightly = fakeApp(box.apps, "T3 Code (Nightly)");
    box.setRunning([mainProcess(nightly)]);
    assert.equal((await select({ ...box.env, T3_APP: beta })).stdout.trim(), beta);
  });

  test("T3_APP rejects an app that is not T3, because the helper would close it", async () => {
    const other = fakeApp(box.apps, "Other", { bundleId: "com.example.other" });
    const { code, stdout, stderr } = await select({ ...box.env, T3_APP: other });
    assert.equal(code, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /com\.example\.other/);
  });

  test("the only installed app is used when none runs", async () => {
    const beta = fakeApp(box.apps, "T3 Code (Beta)");
    fakeApp(box.apps, "Other", { bundleId: "com.example.other" });
    assert.equal((await select(box.env)).stdout.trim(), beta);
  });

  test("processes that only mention an app, helpers, and other apps do not count as running", async () => {
    const beta = fakeApp(box.apps, "T3 Code (Beta)");
    const nightly = fakeApp(box.apps, "T3 Code (Nightly)");
    const helper = fakeApp(join(nightly, "Contents/Frameworks"), "T3 Code (Nightly) Helper", { bundleId: "com.t3tools.t3code.helper" });
    const other = fakeApp(box.root, "Other", { bundleId: "com.example.other" });
    box.setRunning([{ command: `tail -f ${nightly}/Contents/MacOS/log` }, mainProcess(helper), mainProcess(other)]);
    const { code, stderr } = await select(box.env);
    assert.equal(code, 1);
    assert.match(stderr, /more than one/);
    assert.ok(stderr.includes(beta) && stderr.includes(nightly));
  });

  test("an app with the right name but another bundle ID is not T3", async () => {
    const beta = fakeApp(box.apps, "T3 Code (Beta)");
    const lookalike = fakeApp(box.apps, "T3 Code Lookalike", { bundleId: "com.example.lookalike" });
    box.setRunning([mainProcess(lookalike)]);
    assert.equal((await select(box.env)).stdout.trim(), beta);
  });

  test("two running apps with no earlier choice are refused", async () => {
    const beta = fakeApp(box.apps, "T3 Code (Beta)");
    const nightly = fakeApp(box.apps, "T3 Code (Nightly)");
    box.setRunning([mainProcess(beta), mainProcess(nightly)]);
    assert.equal((await select(box.env)).code, 1);
  });

  test("no app gives instructions instead of a guess", async () => {
    const { code, stderr } = await select(box.env);
    assert.equal(code, 1);
    assert.match(stderr, /Could not find T3 Code/);
    assert.match(stderr, /T3_APP=/);
  });
});

describe("install.sh", { skip }, () => {
  let box;
  beforeEach(() => { box = sandbox(); });
  afterEach(() => box.cleanup());
  const plist = () => join(box.home, "Library/LaunchAgents/com.t3sharks.helper.plist");
  const helperHome = () => join(box.home, "Library/Application Support/t3-sharks");

  test("points the helper at the chosen app and installs only what it runs", async () => {
    fakeApp(box.apps, "T3 Code (Beta)");
    const nightly = fakeApp(box.apps, "T3 Code (Nightly)");
    box.setRunning([mainProcess(nightly)]);
    const { code, stdout, stderr } = await install(box.env);
    assert.equal(code, 0, stderr);
    assert.ok(readFileSync(plist(), "utf8").includes(`<key>T3_SHARKS_APP</key>\n\t\t<string>${nightly}</string>`));
    const agent = JSON.parse((await run("/usr/bin/plutil", ["-convert", "json", "-o", "-", plist()], box.env)).stdout);
    assert.deepEqual(agent.KeepAlive, { SuccessfulExit: false });
    assert.equal(agent.EnvironmentVariables.T3_SHARKS_APP, nightly);
    assert.match(stdout, /Quit T3 Code \(Nightly\)/);
    assert.deepEqual(readdirSync(helperHome()).sort(), ["assets", "bin", "package.json"]);
    assert.match(readFileSync(box.launchctlLog, "utf8"), /^bootstrap gui\/\d+ .*com\.t3sharks\.helper\.plist$/m);
  });

  test("an update with nothing running keeps the app chosen before", async () => {
    const beta = fakeApp(box.apps, "T3 Code (Beta)");
    fakeApp(box.apps, "T3 Code (Nightly)");
    assert.equal((await install({ ...box.env, T3_APP: beta })).code, 0);
    assert.equal((await install(box.env)).code, 0);
    assert.ok(readFileSync(plist(), "utf8").includes(`<string>${beta}</string>`));
  });

  test("an unclear choice changes nothing", async () => {
    fakeApp(box.apps, "T3 Code (Beta)");
    const nightly = fakeApp(box.apps, "T3 Code (Nightly)");
    const { code, stderr } = await install(box.env);
    assert.equal(code, 1);
    assert.ok(stderr.includes(`${nightly}`) && stderr.includes("T3_APP="));
    assert.equal(existsSync(plist()), false);
    assert.equal(existsSync(helperHome()), false);
    assert.equal(existsSync(box.launchctlLog), false);
  });
});

describe("the helper", { skip }, () => {
  let box;
  beforeEach(() => { box = sandbox(); });
  afterEach(() => box.cleanup());

  test("exits successfully with instructions when its app is missing or unset", async () => {
    for (const T3_SHARKS_APP of [undefined, join(box.apps, "Gone.app")]) {
      const { T3_SHARKS_APP: _, ...env } = box.env;
      const { code, stdout } = await run(process.execPath, [join(repo, "bin/t3-sharks")], T3_SHARKS_APP ? { ...env, T3_SHARKS_APP } : env);
      assert.equal(code, 0);
      assert.match(stdout, /Run install\.sh again/);
    }
  });

  test("reopens the chosen app and leaves the other channel running", async () => {
    const chosen = fakeApp(box.apps, "T3 Code (Nightly)");
    const other = fakeApp(box.apps, "T3 Code (Beta)");
    const nightly = spawn("/bin/sleep", ["60"]);
    const beta = spawn("/bin/sleep", ["60"]);
    const marker = join(box.root, "relaunched");
    let nightlySignal = null;
    nightly.on("exit", (_, signal) => { nightlySignal = signal; });
    box.setRunning([{ pid: nightly.pid, ...mainProcess(chosen) }, { pid: beta.pid, ...mainProcess(other) }]);
    const helper = spawn(process.execPath, [join(repo, "bin/t3-sharks")], {
      env: { ...box.env, T3_SHARKS_APP: chosen, T3_SHARKS_PORT: "1", T3_SHARKS_RELAUNCH: `touch "${marker}"` },
      stdio: "ignore",
    });
    try {
      for (let i = 0; i < 80 && !existsSync(marker); i++) await sleep(100);
      assert.ok(existsSync(marker), "the chosen app was reopened");
      assert.equal(nightlySignal, "SIGTERM");
      assert.equal(beta.exitCode, null);
      assert.equal(beta.signalCode, null);
    } finally {
      helper.kill();
      nightly.kill();
      beta.kill();
    }
  });
});
