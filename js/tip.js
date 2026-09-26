const DELAY = 450;
const WARM = 400;
const fine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

export function initTips(tip) {
  let target = null;
  let timer = 0;
  let lastHide = 0;

  function place(el) {
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const gap = 8;
    let top = r.top - t.height - gap;
    let below = false;
    if (top < 6) {
      top = r.bottom + gap;
      below = true;
    }
    const left = Math.min(
      Math.max(6, r.left + r.width / 2 - t.width / 2),
      innerWidth - t.width - 6,
    );
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    tip.classList.toggle('below', below);
  }

  function show(el, instant) {
    const text = el.dataset.tip;
    if (!text) return;
    target = el;
    tip.textContent = text;
    tip.classList.toggle('instant', instant);
    tip.classList.add('on');
    place(el);
  }

  function hide() {
    clearTimeout(timer);
    if (tip.classList.contains('on')) lastHide = performance.now();
    tip.classList.remove('on');
    target = null;
  }

  document.addEventListener('pointerover', (e) => {
    if (!fine()) return;
    const el = e.target.closest?.('[data-tip]');
    if (el === target) return;
    if (!el) {
      if (target) hide();
      return;
    }
    clearTimeout(timer);
    const warm =
      tip.classList.contains('on') || performance.now() - lastHide < WARM;
    if (warm) show(el, true);
    else timer = setTimeout(() => show(el, false), DELAY);
  });

  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el && !el.contains(e.relatedTarget)) hide();
  });

  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('scroll', hide, true);
  addEventListener('blur', hide);

  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el?.matches(':focus-visible')) show(el, false);
  });
  document.addEventListener('focusout', (e) => {
    if (e.target.closest?.('[data-tip]')) hide();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });

  return {
    refresh(el) {
      if (target === el && el.dataset.tip) {
        tip.textContent = el.dataset.tip;
        place(el);
      }
    },
  };
}
