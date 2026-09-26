const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const EASE_DRAWER = 'cubic-bezier(0.32, 0.72, 0, 1)';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isPhone = () => matchMedia('(max-width: 639px)').matches;

export function createSheet(dialog, { onOpen, onClose } = {}) {
  const panel = dialog.querySelector('.panel');
  const scrim = dialog.querySelector('.scrim');
  let closing = false;

  const enterFrom = () =>
    reduced()
      ? { opacity: 0 }
      : isPhone()
        ? { transform: 'translateY(100%)' }
        : { transform: 'translateY(12px) scale(0.97)', opacity: 0 };

  function open() {
    if (dialog.open) return;
    closing = false;
    dialog.showModal();
    panel.animate([enterFrom(), { transform: 'none', opacity: 1 }], {
      duration: isPhone() ? 380 : 240,
      easing: isPhone() ? EASE_DRAWER : EASE_OUT,
    });
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 240,
      easing: EASE_OUT,
    });
    onOpen?.();
  }

  async function close() {
    if (!dialog.open || closing) return;
    closing = true;
    const from = getComputedStyle(panel).transform;
    const to = reduced()
      ? { opacity: 0 }
      : isPhone()
        ? { transform: 'translateY(100%)' }
        : { transform: 'translateY(8px) scale(0.98)', opacity: 0 };
    const a = panel.animate(
      [{ transform: from === 'none' ? 'none' : from, opacity: 1 }, to],
      { duration: 200, easing: EASE_OUT, fill: 'forwards' },
    );
    scrim.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 200,
      easing: EASE_OUT,
      fill: 'forwards',
    });
    await a.finished.catch(() => {});
    panel.style.transform = '';
    dialog.close();
    for (const anim of dialog.getAnimations({ subtree: true })) anim.cancel();
    closing = false;
    onClose?.();
  }

  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });

  const handle = dialog.querySelector('.panel-head');
  let start = null;
  handle.addEventListener('pointerdown', (e) => {
    if (!isPhone() || e.target.closest('button')) return;
    start = { y: e.clientY, t: performance.now() };
    handle.setPointerCapture(e.pointerId);
    panel.style.transition = 'none';
  });
  handle.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dy = e.clientY - start.y;
    const y = dy > 0 ? dy : -Math.sqrt(-dy) * 2;
    panel.style.transform = `translateY(${y}px)`;
  });
  const release = (e) => {
    if (!start) return;
    const dy = e.clientY - start.y;
    const v = dy / (performance.now() - start.t);
    start = null;
    panel.style.transition = '';
    if (dy > panel.offsetHeight * 0.3 || (dy > 24 && v > 0.5)) {
      close();
      return;
    }
    const from = panel.style.transform;
    panel.style.transform = '';
    panel.animate([{ transform: from }, { transform: 'none' }], {
      duration: 320,
      easing: EASE_DRAWER,
    });
  };
  handle.addEventListener('pointerup', release);
  handle.addEventListener('pointercancel', release);

  return {
    open,
    close,
    get isOpen() {
      return dialog.open;
    },
  };
}
