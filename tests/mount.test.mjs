import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { after, before, beforeEach, describe, test } from "node:test";
import { repo } from "./helpers.mjs";

const chrome = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((path) => path && existsSync(path));

const mountOnly = readFileSync(join(repo, "assets/mount.js"), "utf8");
const withChat = (on) => `localStorage.setItem('t3-sharks.chat', '${on ? 1 : 0}');\n${mountOnly}`;
const mount = withChat(true);
const legacyMount = readFileSync(join(repo, "tests/fixture/legacy-mount.js"), "utf8");
const SYNC_MS = 500;
const HOST_LEFT = 240;
const SHARK_GLYPHS = new Set(":;t%SX8#@tS.',`o");

async function openBrowser() {
  const server = createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://x");
    const file = pathname === "/ocean.js" ? join(repo, "assets/ocean.js") : join(repo, "tests/fixture/index.html");
    res.writeHead(200, { "content-type": extname(file) === ".js" ? "text/javascript" : "text/html" });
    res.end(readFileSync(file));
  }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const profile = mkdtempSync(join(tmpdir(), "t3-sharks-chrome-"));
  const browser = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--window-size=1500,950", "about:blank"], { stdio: "ignore" });
  let port;
  for (let i = 0; i < 80 && !port; i++) {
    await sleep(250);
    try { port = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]); } catch {}
  }
  assert.ok(port, "Chrome opened a debugging port");
  const target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve));
  let id = 0;
  const pending = new Map();
  const pageErrors = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) { pending.get(message.id)(message); pending.delete(message.id); }
    if (message.method === "Runtime.exceptionThrown") pageErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  });
  const cdp = (method, params = {}) => new Promise((resolve) => {
    id += 1;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const { result } = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  return {
    cdp, evaluate, pageErrors,
    async open(script, hash) {
      await cdp("Page.navigate", { url: "about:blank" });
      await sleep(100);
      await cdp("Page.navigate", { url: `${url}${hash}` });
      await sleep(400);
      await cdp("Runtime.evaluate", { expression: script });
      await sleep(SYNC_MS);
    },
    async close() {
      socket.close();
      browser.kill();
      server.close();
      await sleep(300);
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    },
  };
}

describe("sharks in the page", { skip: chrome ? false : "no Chrome or Chromium found; set CHROME_PATH" }, () => {
  let page;
  const go = async (hash) => { await page.evaluate(`location.hash=${JSON.stringify(hash)}`); await sleep(SYNC_MS); };
  const resize = async (width, height = 950) => {
    await page.cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(SYNC_MS);
  };
  const state = () => page.evaluate(`(() => {
    const host = document.querySelector('[data-chat-canvas=true]');
    const own = host ? [...host.querySelectorAll(':scope > canvas')] : [];
    const style = own[0] && getComputedStyle(own[0]);
    return {
      mode: host && host.getAttribute('data-t3-sharks'),
      canvases: document.querySelectorAll('canvas').length,
      veils: document.querySelectorAll('[style*="backdrop-filter"]').length,
      styles: [...document.head.querySelectorAll('style')].filter((s) => s.textContent.includes('t3-sharks')).length,
      live: __fix.engines.length,
      opacity: style?.opacity,
      filter: style?.filter,
      pointers: own.map((c) => getComputedStyle(c).pointerEvents),
      masks: own.map((c) => c.style.maskImage),
      rects: own.map((c) => { const r = c.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right) }; }),
      wrapBg: document.getElementById('timeline-wrap') && getComputedStyle(document.getElementById('timeline-wrap')).backgroundColor,
      codeBg: document.getElementById('code') && getComputedStyle(document.getElementById('code')).backgroundColor,
    };
  })()`);
  const column = () => page.evaluate(`(() => { const r = document.querySelector('[data-chat-composer-stack]').getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right) }; })()`);
  const screenshot = async () => (await page.cdp("Page.captureScreenshot", { format: "png" })).result.data;
  const region = (png, x0, x1) => page.evaluate(`(async () => {
    const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,${png}')).blob());
    const c = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
    c.drawImage(bitmap, 0, 0);
    const { data } = c.getImageData(${x0}, 60, ${x1 - x0}, 700);
    const counts = new Map();
    for (let i = 0; i < data.length; i += 4) { const k = data[i] + ',' + data[i + 1] + ',' + data[i + 2]; counts.set(k, (counts.get(k) ?? 0) + 1); }
    const sorted = [...counts].sort((a, b) => b[1] - a[1]);
    return { colors: counts.size, common: sorted[0][0], signature: sorted.slice(0, 20).join(';') };
  })()`);
  const hideContent = () => page.evaluate(`document.head.insertAdjacentHTML('beforeend','<style id=hide>[data-timeline-root],[data-chat-composer-stack]{visibility:hidden}</style>')`);
  const showContent = () => page.evaluate(`document.getElementById('hide')?.remove()`);
  const center = (selector) => page.evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const click = async (point) => {
    for (const type of ["mousePressed", "mouseReleased"]) await page.cdp("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 });
  };

  before(async () => { page = await openBrowser(); });
  after(() => page.close());
  beforeEach(async () => {
    await page.cdp("Emulation.setEmulatedMedia", { features: [] });
    await resize(1500);
  });

  test("a new chat keeps the original look, physics and fish", async () => {
    await page.open(mount, "#/draft/one");
    const s = await state();
    assert.deepEqual([s.mode, s.canvases, s.veils, s.live], ["landing", 1, 1, 1]);
    assert.equal(s.opacity, "0.7");
    assert.equal(s.filter, "grayscale(1)");
    assert.equal(s.masks[0], "");
    assert.deepEqual(s.rects, [{ left: HOST_LEFT, right: 1500 }]);
    assert.equal(s.wrapBg, "rgba(0, 0, 0, 0)");
    const drawn = await page.evaluate(`(async () => {
      const e = __fix.engines[0], ctx = e.canvas.getContext('2d'), text = ctx.fillText, glyphs = new Set();
      ctx.fillText = function (g, ...rest) { glyphs.add(g); return text.call(this, g, ...rest); };
      await new Promise((r) => setTimeout(r, 500));
      delete ctx.fillText;
      return { fishGlyph: glyphs.has('-'), ownRender: Object.hasOwn(e.renderer, 'render') };
    })()`);
    assert.deepEqual(drawn, { fishGlyph: true, ownRender: false });
  });

  test("an open chat runs a stock ocean in each margin, clear of the reading column", async () => {
    await page.open(mount, "#/env/thread-a");
    const s = await state();
    const col = await column();
    assert.deepEqual([s.mode, s.canvases, s.veils, s.live], ["chat", 2, 0, 2]);
    assert.deepEqual(s.rects, [{ left: HOST_LEFT, right: col.left - 16 }, { left: col.right + 16, right: 1500 }]);
    assert.ok(s.masks[0].includes("90deg") && s.masks[1].includes("270deg"));
    assert.deepEqual(s.pointers, ["none", "none"]);
    assert.notEqual(s.codeBg, "rgba(0, 0, 0, 0)", "cards in the column keep their background");
    const clock = await page.evaluate(`(async () => {
      const t0 = __fix.engines.map((e) => e.world.time);
      await new Promise((r) => setTimeout(r, 1000));
      return __fix.engines.map((e, i) => e.world.time - t0[i]);
    })()`);
    for (const seconds of clock) assert.ok(seconds > 0.5 && seconds < 1.3, `simulation runs at wall-clock speed, got ${seconds}`);
    const fish = await page.evaluate(`__fix.engines.map(({ world: w, renderer: r }) => {
      const pristine = new w.constructor();
      pristine.resize(r.width, r.height, r.cellWidth, r.cellHeight);
      return [w.fish.length, pristine.fish.length];
    })`);
    for (const [live, stock] of fish) assert.ok(live >= stock / 2, `the sharks keep their unseen fish, got ${live} of ${stock}`);
  });

  test("chat sharks are off until the Labs switch turns them on, and new chats keep theirs", async () => {
    await page.open(withChat(false), "#/env/thread-a");
    let s = await state();
    assert.deepEqual([s.mode, s.canvases, s.live], [null, 0, 0]);
    await go("#/draft/four");
    s = await state();
    assert.deepEqual([s.mode, s.canvases, s.veils], ["landing", 1, 1]);
    await go("#/env/thread-a");
    const row = () => page.evaluate(`(() => {
      const rows = document.querySelectorAll('#beta [data-t3-sharks-setting]');
      const r = rows[0], sw = r?.querySelector('[role=switch]');
      return { rows: rows.length, last: r === r?.parentElement.lastElementChild, title: r?.querySelector('h3').textContent, extras: r?.querySelectorAll('h3 ~ span, .reset').length,
        checked: sw?.getAttribute('aria-checked'), on: sw?.hasAttribute('data-checked'), thumbOn: sw?.firstElementChild.hasAttribute('data-checked'), stored: localStorage.getItem('t3-sharks.chat'),
        dupIds: [...document.querySelectorAll('[id]')].filter((el, _, all) => all.filter((o) => o.id === el.id).length > 1).length };
    })()`);
    assert.deepEqual(await row(), { rows: 1, last: true, title: "Sharks beside open chats", extras: 0, checked: "false", on: false, thumbOn: false, stored: "0", dupIds: 0 });
    await click(await center("#beta [data-t3-sharks-setting] [role=switch]"));
    await sleep(SYNC_MS);
    assert.deepEqual(await row(), { rows: 1, last: true, title: "Sharks beside open chats", extras: 0, checked: "true", on: true, thumbOn: true, stored: "1", dupIds: 0 });
    s = await state();
    assert.deepEqual([s.mode, s.canvases, s.live], ["chat", 2, 2], "turning the switch on starts chat sharks without a reload");
    await page.evaluate(`document.querySelector('#beta [data-t3-sharks-setting] [role=switch]').focus()`);
    await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await sleep(SYNC_MS);
    assert.equal((await row()).checked, "false");
    s = await state();
    assert.deepEqual([s.mode, s.canvases, s.live], [null, 0, 0], "turning it off removes them");
    await page.evaluate(`document.querySelector('#beta [data-slot=settings-group]').append(document.querySelector('#boring-sidebar'))`);
    await sleep(SYNC_MS);
    assert.equal((await row()).last, true, "the row stays last when T3 rerenders its own rows");
    await page.evaluate(`window.__t3Sharks.destroy()`);
    assert.equal((await row()).rows, 0, "removing the script removes the row");
  });

  test("margin sharks follow the same paths as an untouched engine world", async () => {
    await page.open(mount, "#/env/thread-a");
    const results = await page.evaluate(`(() => {
      const seed = (s) => { let a = s >>> 0; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
      return __fix.engines.map((engine, index) => {
        cancelAnimationFrame(engine.raf);
        engine.disposed = true;
        const live = engine.world, World = live.constructor, r = engine.renderer;
        const trace = (world) => {
          const samples = [];
          for (let i = 0; i < 600; i++) { world.step(1 / 60); if (i % 30 === 0) samples.push(world.sharks.map((s) => [...s.nodes.slice(0, 4), s.heading, s.speed])); }
          return JSON.stringify(samples);
        };
        seed(1000 + index);
        Object.assign(live, { width: 0, time: 0, lastSpawn: 0 });
        live.pointer.active = false;
        live.events.length = 0;
        live.resize(r.width, r.height, r.cellWidth, r.cellHeight);
        const a = trace(live);
        seed(1000 + index);
        const pristine = new World();
        pristine.resize(r.width, r.height, r.cellWidth, r.cellHeight);
        return { same: a === trace(pristine), sharks: live.sharks.length, fish: live.fish.length, defaults: pristine.sharks.length };
      });
    })()`);
    assert.equal(results.length, 2);
    for (const r of results) {
      assert.ok(r.same, "paths match the stock world");
      assert.equal(r.sharks, r.defaults);
      assert.ok(r.fish > 0, "unseen fish remain for the sharks to hunt");
    }
  });

  test("open chats draw only sharks, even after pointer movement and clicks", async () => {
    await page.open(mount, "#/env/thread-a");
    const point = { x: HOST_LEFT + 60, y: 300 };
    await page.cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
    await click(point);
    await sleep(200);
    const census = await page.evaluate(`(() => {
      const glyphs = new Set();
      const sides = __fix.engines.map(({ world, renderer: r, canvas }) => {
        const ctx = canvas.getContext('2d'), text = ctx.fillText;
        ctx.fillText = function (g, ...rest) { glyphs.add(g); return text.call(this, g, ...rest); };
        const out = { samples: 0, occupied: 0, stray: 0, events: 0 };
        for (let i = 0; i < 3000; i++) {
          world.step(1 / 60);
          if (i % 100) continue;
          r.render(world, 1 / 60);
          out.events = Math.max(out.events, world.events.length);
          out.samples++;
          if (r.sharkFlag.reduce((n, flag) => n + (flag ? 1 : 0), 0) >= 8) out.occupied++;
          const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const scale = canvas.width / r.width;
          for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            const cell = Math.floor(y / scale / r.ch) * r.cols + Math.floor(x / scale / r.cw), p = (y * width + x) * 4;
            if (!r.sharkFlag[cell] && (data[p] || data[p + 1] || data[p + 2])) out.stray++;
          }
        }
        delete ctx.fillText;
        return out;
      });
      return { sides, glyphs: [...glyphs] };
    })()`);
    assert.equal(census.sides.length, 2);
    for (const side of census.sides) {
      assert.equal(side.stray, 0, "nothing is drawn outside shark cells");
      assert.equal(side.events, 0, "feeding events do not pile up");
      assert.ok(side.occupied / side.samples >= 0.8, `a shark is usually on screen, got ${side.occupied}/${side.samples}`);
    }
    assert.deepEqual(census.glyphs.filter((g) => !SHARK_GLYPHS.has(g)), []);
  });

  test("real pixels show moving sharks on both sides and none in the column", async () => {
    await page.open(mount, "#/env/thread-a");
    const col = await column();
    await hideContent();
    await sleep(100);
    const frames = [];
    for (let i = 0; i < 4; i++) { frames.push(await screenshot()); await sleep(800); }
    await showContent();
    const inColumn = await Promise.all(frames.map((frame) => region(frame, col.left, col.right)));
    for (const r of inColumn) assert.equal(r.colors, 1, "the reading column stays one flat color");
    for (const [x0, x1] of [[HOST_LEFT, col.left - 16], [col.right + 16, 1500]]) {
      const regions = await Promise.all(frames.map((frame) => region(frame, x0, x1)));
      assert.ok(regions.some((r) => r.colors > 1), "sharks appear in the margin");
      assert.ok(new Set(regions.map((r) => r.signature)).size > 1, "the margin changes over time");
      for (const r of regions) assert.equal(r.common, inColumn[0].common, "the rest of the margin is the app background");
    }
  });

  test("messages, buttons, the composer and scrolling keep working", async () => {
    await page.open(mount, "#/env/thread-a");
    const hits = await page.evaluate(`['msg', 'code', 'copy', 'composer'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2).id; })`);
    assert.deepEqual(hits, ["msg", "code", "copy", "composer"]);
    await click(await center("#copy"));
    assert.equal(await page.evaluate("__fix.clicks"), 1);
    await click(await center("#composer"));
    await page.cdp("Input.insertText", { text: " typed" });
    assert.equal(await page.evaluate(`document.getElementById('composer').value`), "Draft typed");
    await page.cdp("Input.dispatchMouseEvent", { type: "mouseWheel", x: HOST_LEFT + 60, y: 300, deltaX: 0, deltaY: 300 });
    await sleep(200);
    assert.ok((await page.evaluate(`document.getElementById('scroll').scrollTop`)) > 0, "the wheel over a margin scrolls the timeline");
  });

  test("navigation keeps swimming sharks, and cleans up when leaving", async () => {
    await page.open(mount, "#/env/thread-a");
    await page.evaluate(`window.__kept = [...document.querySelectorAll('canvas')]; true`);
    const sameCanvases = `(() => { const now = [...document.querySelectorAll('[data-chat-canvas=true] > canvas')]; return now.length === 2 && now.every((c, i) => c === window.__kept[i]); })()`;
    for (let i = 0; i < 12; i++) await page.evaluate(`location.hash='#/env/thread-${i}'`);
    await sleep(SYNC_MS);
    assert.ok(await page.evaluate(sameCanvases), "switching threads does not restart the sharks");
    await page.evaluate("__fix.mountHost()");
    await sleep(SYNC_MS);
    assert.ok(await page.evaluate(sameCanvases), "a remounted chat adopts the same sharks");
    assert.equal((await state()).mode, "chat");

    await go("#/settings/general");
    await page.evaluate(`document.getElementById('slot').replaceChildren()`);
    await sleep(SYNC_MS);
    let s = await state();
    assert.deepEqual([s.canvases, s.live], [0, 0]);

    await page.evaluate("__fix.mountHost()");
    await go("#/env/thread-z");
    s = await state();
    assert.deepEqual([s.mode, s.canvases, s.live], ["chat", 2, 2]);

    await go("#/draft/two");
    s = await state();
    assert.deepEqual([s.mode, s.canvases, s.veils, s.live, s.opacity], ["landing", 1, 1, 1, "0.7"]);
  });

  test("sharks leave when either margin is too narrow and return with room", async () => {
    await page.open(mount, "#/env/thread-a");
    await resize(1000);
    let s = await state();
    assert.deepEqual([s.mode, s.canvases, s.live], [null, 0, 0]);
    assert.notEqual(s.wrapBg, "rgba(0, 0, 0, 0)", "the page is opaque again");

    await resize(1500);
    assert.equal((await state()).canvases, 2);
    await resize(1900);
    s = await state();
    const col = await column();
    assert.deepEqual(s.rects, [{ left: HOST_LEFT, right: col.left - 16 }, { left: col.right + 16, right: 1900 }]);
    const sizes = await page.evaluate(`__fix.engines.map((e) => [Math.round(e.canvas.getBoundingClientRect().width), Math.round(e.world.width)])`);
    for (const [canvas, world] of sizes) assert.equal(canvas, world, "worlds follow their canvases");
    await resize(1500);

    await page.evaluate(`document.querySelector('[data-chat-composer-stack]').style.transform = 'translateX(-200px)'`);
    await sleep(SYNC_MS);
    assert.equal((await state()).canvases, 0, "one side without room removes both");
    await page.evaluate(`document.querySelector('[data-chat-composer-stack]').style.transform = ''`);
    await sleep(SYNC_MS);
    assert.equal((await state()).canvases, 2);

    await page.evaluate(`document.documentElement.dataset.chatWidth = 'full'`);
    await sleep(SYNC_MS);
    assert.equal((await state()).canvases, 0, "full-width chats have no margins");
  });

  test("reduced motion holds a still frame of sharks only", async () => {
    await page.cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await page.open(mount, "#/env/thread-a");
    await hideContent();
    await sleep(100);
    const first = await region(await screenshot(), HOST_LEFT, 1500);
    await sleep(1000);
    const second = await region(await screenshot(), HOST_LEFT, 1500);
    await showContent();
    assert.equal((await state()).mode, "chat");
    assert.equal(first.signature, second.signature, "nothing moves");
    const stray = await page.evaluate(`__fix.engines.reduce((sum, { renderer: r, canvas }) => {
      const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const scale = canvas.width / r.width;
      let n = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const cell = Math.floor(y / scale / r.ch) * r.cols + Math.floor(x / scale / r.cw), p = (y * width + x) * 4;
        if (!r.sharkFlag[cell] && (data[p] || data[p + 1] || data[p + 2])) n++;
      }
      return sum + n;
    }, 0)`);
    assert.equal(stray, 0);
  });

  test("light mode keeps margins the app background wherever no shark is", async () => {
    await page.open(mount, "#/env/thread-a");
    await page.evaluate(`document.documentElement.classList.remove('dark')`);
    await sleep(200);
    const s = await state();
    assert.ok(s.filter.includes("invert"));
    const col = await column();
    await hideContent();
    await sleep(100);
    const png = await screenshot();
    await showContent();
    assert.equal((await region(png, HOST_LEFT, col.left - 16)).common, "252,252,252");
    assert.equal((await region(png, col.right + 16, 1500)).common, "252,252,252");
    await page.evaluate(`document.documentElement.classList.add('dark')`);
  });

  test("running the script again converges to one mount", async () => {
    await page.open(mount, "#/env/thread-a");
    for (let i = 0; i < 3; i++) await page.cdp("Runtime.evaluate", { expression: mount });
    await sleep(SYNC_MS);
    const s = await state();
    assert.deepEqual([s.canvases, s.styles, s.live], [2, 1, 2]);
  });

  test("an update replaces the previous release's mount in a running window", async () => {
    await page.open(`localStorage.setItem('t3-sharks.chat', '1');\n${legacyMount}`, "#/draft/three");
    assert.equal(await page.evaluate("typeof window.__t3Sharks"), "number");
    await page.cdp("Runtime.evaluate", { expression: mount });
    await sleep(SYNC_MS);
    let s = await state();
    assert.deepEqual([s.mode, s.canvases, s.veils, s.styles], ["landing", 1, 1, 1]);
    await go("#/env/thread-a");
    s = await state();
    assert.deepEqual([s.mode, s.canvases, s.veils], ["chat", 2, 0], "no leftover from the old mount's interval");
  });

  test("no page exceptions across the whole run", () => {
    assert.deepEqual(page.pageErrors, []);
  });
});
