import { load, save } from './store.js';

let enabled = load('chit:sound', true);
let ctx = null;
let noiseBuf = null;

export const soundOn = () => enabled;

export function setSound(on) {
  enabled = on;
  save('chit:sound', on);
}

function audio() {
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
    return null;
  }
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
    ctx = new AC();
  }
  if (ctx.state === 'suspended') {
    ctx.resume();
    return null;
  }
  return ctx;
}

function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function tone({ freq, to, dur, type = 'sine', gain = 0.05, delay = 0 }) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

function hiss({ dur, freq, to, q = 1, gain = 0.05, delay = 0, pulse = 0, attack = 0.005 }) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(freq, t);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  filter.Q.value = q;
  const amp = c.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + attack);
  if (pulse) {
    const steps = Math.floor(dur / pulse);
    for (let i = 1; i < steps; i++) {
      amp.gain.setValueAtTime(i % 2 ? gain * 0.35 : gain, t + i * pulse);
    }
  }
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(amp).connect(c.destination);
  src.start(t, Math.random() * 0.2);
  src.stop(t + dur + 0.02);
}

const play =
  (fn) =>
  (...args) => {
    if (!enabled || document.hidden) return;
    try {
      fn(...args);
    } catch {}
  };

export const sfx = {
  tap: play(() => tone({ freq: 1100, to: 700, dur: 0.04, gain: 0.025 })),
  print: play((soft = false) => {
    const k = soft ? 0.4 : 1;
    hiss({ dur: 0.22, freq: 3200, q: 2.5, gain: 0.07 * k, pulse: 0.012 });
    tone({ freq: 190, dur: 0.2, type: 'square', gain: 0.012 * k });
  }),
  tick: play((on) => {
    if (on) {
      hiss({ dur: 0.24, freq: 3600, to: 5600, q: 1.1, gain: 0.05, attack: 0.03 });
      hiss({ dur: 0.07, freq: 6200, to: 4200, q: 1.4, gain: 0.05, delay: 0.22 });
    } else {
      hiss({ dur: 0.16, freq: 1500, to: 1100, q: 0.7, gain: 0.03, pulse: 0.04, attack: 0.02 });
    }
  }),
  stamp: play(() => {
    tone({ freq: 150, to: 55, dur: 0.18, type: 'sine', gain: 0.18 });
    hiss({ dur: 0.06, freq: 900, q: 0.7, gain: 0.06 });
  }),
  remove: play(() => hiss({ dur: 0.12, freq: 1800, q: 0.8, gain: 0.04 })),
  tear: play((dur = 0.28) =>
    hiss({ dur, freq: 2800, to: 700, q: 0.9, gain: 0.06, pulse: 0.009, attack: 0.01 }),
  ),
  copy: play(() => {
    tone({ freq: 880, dur: 0.07, type: 'triangle', gain: 0.045 });
    tone({ freq: 1320, dur: 0.12, type: 'triangle', gain: 0.045, delay: 0.06 });
  }),
  error: play(() =>
    tone({ freq: 240, to: 160, dur: 0.22, type: 'square', gain: 0.02 }),
  ),
};
