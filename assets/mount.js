(function mountSharks() {
  if (document.readyState === 'loading') return document.addEventListener('DOMContentLoaded', mountSharks, { once: true });
  const prior = window.__t3Sharks;
  if (typeof prior === 'number') {
    // A window still running the previous mount has no destroy(). Its engine stops once its canvas leaves the DOM.
    clearInterval(prior);
    document.querySelectorAll('[data-t3-sharks]').forEach((host) => {
      host.querySelectorAll(':scope > canvas, :scope > div[aria-hidden][style*="backdrop-filter"]').forEach((el) => el.remove());
      host.removeAttribute('data-t3-sharks');
    });
    [...document.head.querySelectorAll('style')].find((el) => el.textContent.startsWith('[data-t3-sharks]{isolation'))?.remove();
  } else prior?.destroy();

  const Ocean = window.__T3SharksOcean;
  const CANVAS = 'position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;font-family:"Geist Mono",ui-monospace,Menlo,monospace;';
  const COLUMN_GAP = 16, COLUMN_FEATHER = 72;
  // Keeping a shorter margin than the one needed to start stops the canvas flickering at the threshold during a resize.
  const MARGIN_TO_START = 120, MARGIN_TO_KEEP = 96;
  // Each margin is a complete stock ocean with the engine's default sharks, so they hunt, turn and wander by its rules. One world across the pane would send them under the column and leave a margin empty.

  // Sharks beside open chats are a Labs setting, off until turned on. T3 itself has no room for outside settings, so the row is drawn by this script and saved in the window's storage.
  const CHAT_SETTING = 't3-sharks.chat';
  const chatOn = () => {
    try { return localStorage.getItem(CHAT_SETTING) === '1'; } catch { return false; }
  };
  const setSwitch = (control, on) => {
    control.setAttribute('aria-checked', String(on));
    for (const el of [control, ...control.querySelectorAll('[data-slot=switch-thumb]')]) {
      el.toggleAttribute('data-checked', on);
      el.toggleAttribute('data-unchecked', !on);
      el.removeAttribute('data-mixed');
    }
  };
  // The row copies a stock Labs row, so it matches T3's look without depending on its class names.
  const labsRow = () => {
    const group = document.querySelector('section#beta [data-slot=settings-group]');
    if (!group) return;
    let row = group.querySelector(':scope > [data-t3-sharks-setting]');
    if (!row) {
      const model = [...group.querySelectorAll(':scope > [data-slot=settings-row]')].find((r) => r.querySelector('[role=switch]'));
      if (!model) return;
      row = model.cloneNode(true);
      row.id = 't3-sharks-chat';
      row.setAttribute('data-t3-sharks-setting', '');
      row.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      row.querySelector('h3').textContent = 'Sharks beside open chats';
      row.querySelectorAll('h3 ~ span').forEach((el) => el.remove());
      row.querySelector('p').textContent = 'Let the sharks swim in the empty margins of open chats, not only behind new chats. Nothing swims behind messages. Added by t3-sharks.';
      const control = row.querySelector('[role=switch]');
      [...control.parentElement.children].forEach((el) => el === control || el.remove());
      control.setAttribute('aria-label', 'Sharks beside open chats');
      control.removeAttribute('aria-disabled');
      control.removeAttribute('data-disabled');
      const flip = () => {
        try { localStorage.setItem(CHAT_SETTING, chatOn() ? '0' : '1'); } catch {}
        setSwitch(control, chatOn());
        sync();
      };
      control.addEventListener('click', flip);
      control.addEventListener('keydown', (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        flip();
      });
    }
    if (row.parentElement !== group || row !== group.lastElementChild) group.append(row);
    setSwitch(row.querySelector('[role=switch]'), chatOn());
  };

  const readingColumn = (host) => {
    const rects = ['[data-chat-composer-stack]', '[data-timeline-root]'].flatMap((selector) => {
      const rect = host.querySelector(selector)?.getBoundingClientRect();
      return rect?.width ? [rect] : [];
    });
    return rects.length ? { left: Math.min(...rects.map((r) => r.left)), right: Math.max(...rects.map((r) => r.right)) } : null;
  };

  const MODES = {
    landing: {
      canvas: 'opacity:.7;filter:grayscale(1)',
      oceans: [{}],
      attach(scene) {
        scene.veil = document.createElement('div');
        scene.veil.setAttribute('aria-hidden', 'true');
        scene.veil.style.cssText = 'position:absolute;z-index:-1;pointer-events:none;backdrop-filter:blur(10px);background:radial-gradient(closest-side,color-mix(in srgb,var(--background) 55%,transparent),transparent);mask-image:radial-gradient(closest-side,#000 55%,transparent);';
        scene.host.prepend(scene.oceans[0].canvas, scene.veil);
      },
      // The veil follows the heading and message box, which move as the window resizes.
      place({ host, veil }) {
        const parts = [...host.querySelectorAll('[data-chat-composer-stack], [data-chat-composer-stack] h1')].map((el) => el.getBoundingClientRect());
        if (!parts.length) return;
        const box = host.getBoundingClientRect();
        const left = Math.min(...parts.map((r) => r.left)), right = Math.max(...parts.map((r) => r.right));
        const top = Math.min(...parts.map((r) => r.top)), bottom = Math.max(...parts.map((r) => r.bottom));
        const padX = 160, padY = 120;
        Object.assign(veil.style, { left: `${left - box.left - padX}px`, top: `${top - box.top - padY}px`, width: `${right - left + padX * 2}px`, height: `${bottom - top + padY * 2}px` });
      },
    },
    chat: {
      canvas: '',
      oceans: [{ side: 'left' }, { side: 'right' }],
      // The margins need their real widths before the engines start, because a world sizes its sharks once, when it seeds.
      attach(scene) {
        MODES.chat.place(scene);
      },
      // The fish stay in the world for the sharks to hunt. Sharks are the only thing this frame can draw, so fish, wake, sparks and the grid have no way onto the screen.
      start({ engine }) {
        const { renderer } = engine;
        renderer.render = (world) => {
          const { ctx, dpr, width, height, ch, fontFamily } = renderer;
          world.events.length = 0;
          renderer.rasterizeSharks(world.sharks, world.time);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, width, height);
          ctx.font = `600 ${Math.round(ch * 0.74)}px ${fontFamily}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          renderer.drawSharks(world.time);
        };
      },
      // The canvases stop at the column, so no shark can be drawn behind text, and each fades out at its inner edge.
      place(scene) {
        const column = readingColumn(scene.host);
        if (!column) return;
        const box = scene.host.getBoundingClientRect();
        const left = Math.round(column.left - box.left - COLUMN_GAP), right = Math.round(column.right - box.left + COLUMN_GAP);
        const feather = Math.min(COLUMN_FEATHER, Math.min(left, box.width - right) * 0.3);
        const layout = `${left} ${right} ${box.width}`;
        if (layout === scene.layout) return;
        scene.layout = layout;
        for (const { side, canvas } of scene.oceans) {
          canvas.style.left = `${side === 'left' ? 0 : right}px`;
          canvas.style.width = `${side === 'left' ? left : box.width - right}px`;
          canvas.style.maskImage = `linear-gradient(${side === 'left' ? 90 : 270}deg,#000 calc(100% - ${feather}px),transparent)`;
        }
      },
    },
  };

  const style = document.createElement('style');
  style.textContent = [
    '[data-t3-sharks=landing]{isolation:isolate}[data-t3-sharks=landing] .bg-background{background-color:transparent!important}[data-t3-sharks=landing] [class~="group/composer-surface"]::before{backdrop-filter:blur(14px)}[data-t3-sharks=landing] [data-chat-composer-stack] h1{text-shadow:0 0 24px var(--background)}',
    // Only the full-pane wrappers go transparent. Cards and code blocks inside the column keep their own backgrounds.
    '[data-t3-sharks=chat]{isolation:isolate;background-color:var(--background)}[data-t3-sharks=chat]>.bg-background,[data-t3-sharks=chat] [data-timeline-loading]{background-color:transparent!important}',
    // The blend drops the canvas's flat fill, so a margin differs from the app's background only where a shark is.
    '[data-t3-sharks=chat]>canvas{opacity:.5;filter:grayscale(1);mix-blend-mode:screen}:root:not(.dark) [data-t3-sharks=chat]>canvas{opacity:.28;filter:grayscale(1) invert(1);mix-blend-mode:multiply}',
  ].join('');
  document.head.append(style);

  let scene = null;

  const teardown = () => {
    if (!scene) return;
    scene.host?.removeAttribute('data-t3-sharks');
    for (const { engine, canvas } of scene.oceans) {
      engine?.destroy();
      canvas.remove();
    }
    scene.veil?.remove();
    scene = null;
  };

  const modeFor = (host) => {
    if (!host) return null;
    if (location.hash.startsWith('#/draft/')) return 'landing';
    if (!chatOn()) return null;
    const column = readingColumn(host);
    if (!column) return scene?.mode === 'chat' ? 'chat' : null;
    const box = host.getBoundingClientRect();
    const margin = Math.min(column.left - box.left, box.right - column.right);
    return margin >= (scene?.mode === 'chat' ? MARGIN_TO_KEEP : MARGIN_TO_START) ? 'chat' : null;
  };

  // The canvases move with the host, so opening another chat keeps the same sharks swimming instead of adding or restarting any.
  const adopt = (host) => {
    if (scene.oceans[0].canvas.parentElement === host) return;
    if (scene.host !== host) scene.host?.removeAttribute('data-t3-sharks');
    scene.host = host;
    host.setAttribute('data-t3-sharks', scene.mode);
    host.prepend(...scene.oceans.map((ocean) => ocean.canvas), ...(scene.veil ? [scene.veil] : []));
  };

  const sync = () => {
    labsRow();
    const host = document.querySelector('[data-chat-canvas=true]');
    const mode = modeFor(host);
    if (mode !== scene?.mode) {
      teardown();
      if (!mode) return;
      const oceans = MODES[mode].oceans.map((spec) => {
        const canvas = document.createElement('canvas');
        canvas.setAttribute('aria-hidden', 'true');
        canvas.style.cssText = CANVAS + MODES[mode].canvas;
        return { ...spec, canvas, engine: null };
      });
      scene = { mode, oceans, host: null, veil: null, layout: null };
      adopt(host);
      MODES[mode].attach(scene);
      for (const ocean of oceans) {
        ocean.engine = new Ocean(ocean.canvas);
        MODES[mode].start?.(ocean);
      }
    }
    if (!scene) return;
    adopt(host);
    MODES[scene.mode].place(scene);
  };

  const interval = setInterval(sync, 400);
  window.__t3Sharks = { destroy() { clearInterval(interval); teardown(); style.remove(); document.querySelector('[data-t3-sharks-setting]')?.remove(); } };
  sync();
})();
