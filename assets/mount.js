(function mountSharks() {
  if (window.__t3Sharks) return;
  if (document.readyState === 'loading') return document.addEventListener('DOMContentLoaded', mountSharks);
  const Ocean = window.__T3SharksOcean;
  let engine = null, canvas = null, veil = null;
  const style = document.createElement('style');
  style.textContent = '[data-t3-sharks]{isolation:isolate}[data-t3-sharks] .bg-background{background-color:transparent!important}[data-t3-sharks] [class~="group/composer-surface"]::before{backdrop-filter:blur(14px)}[data-t3-sharks] [data-chat-composer-stack] h1{text-shadow:0 0 24px var(--background)}';
  document.head.append(style);
  const sync = () => {
    const host = location.hash.startsWith('#/draft/') && document.querySelector('[data-chat-canvas=true]');
    if (host && canvas?.parentElement === host) return placeVeil(host);
    engine?.destroy(); canvas?.parentElement?.removeAttribute('data-t3-sharks'); canvas?.remove(); veil?.remove(); engine = canvas = veil = null;
    if (!host) return;
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;opacity:.7;filter:grayscale(1);font-family:"Geist Mono",ui-monospace,Menlo,monospace';
    host.setAttribute('data-t3-sharks', '');
    veil = document.createElement('div');
    veil.setAttribute('aria-hidden', 'true');
    veil.style.cssText = 'position:absolute;z-index:-1;pointer-events:none;backdrop-filter:blur(10px);background:radial-gradient(closest-side,color-mix(in srgb,var(--background) 55%,transparent),transparent);mask-image:radial-gradient(closest-side,#000 55%,transparent);';
    host.prepend(canvas, veil);
    engine = new Ocean(canvas);
    placeVeil(host);
  };
  // The veil follows the heading and message box, which move as the window resizes.
  const placeVeil = (host) => {
    const parts = [...host.querySelectorAll('[data-chat-composer-stack], [data-chat-composer-stack] h1')].map((el) => el.getBoundingClientRect());
    if (!parts.length) return;
    const box = host.getBoundingClientRect();
    const left = Math.min(...parts.map((r) => r.left)), right = Math.max(...parts.map((r) => r.right));
    const top = Math.min(...parts.map((r) => r.top)), bottom = Math.max(...parts.map((r) => r.bottom));
    const padX = 160, padY = 120;
    Object.assign(veil.style, { left: `${left - box.left - padX}px`, top: `${top - box.top - padY}px`, width: `${right - left + padX * 2}px`, height: `${bottom - top + padY * 2}px` });
  };
  window.__t3Sharks = setInterval(sync, 400);
  sync();
})();
