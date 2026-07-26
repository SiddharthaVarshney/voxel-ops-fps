let ctx = null;
let master = null;
let masterVolume = 1;

function getCtx() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = masterVolume;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

// All SFX route through this instead of ac.destination directly, so a single
// setMasterVolume() call controls every sound (used by the settings panel).
function out(ac) {
  return master || ac.destination;
}

export function setMasterVolume(v) {
  masterVolume = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = masterVolume;
}

function envGain(ac, startVal, endVal, duration) {
  const g = ac.createGain();
  g.gain.setValueAtTime(startVal, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(Math.max(endVal, 0.0001), ac.currentTime + duration);
  return g;
}

export function playShot(kind = "pistol") {
  const ac = getCtx();

  if (kind === "knife") {
    const noise = ac.createBufferSource();
    const bufferSize = ac.sampleRate * 0.12;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    noise.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 2000;
    const gain = envGain(ac, 0.3, 0.001, 0.1);
    noise.connect(filter).connect(gain).connect(out(ac));
    noise.start();
    noise.stop(ac.currentTime + 0.1);
    return;
  }

  const noise = ac.createBufferSource();
  const bufferSize = ac.sampleRate * 0.15;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  noise.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = kind === "shotgun" ? 1800 : kind === "rifle" ? 2600 : 3200;

  const gainVal = kind === "shotgun" ? 0.55 : kind === "rifle" ? 0.32 : 0.28;
  const dur = kind === "shotgun" ? 0.22 : 0.12;
  const gain = envGain(ac, gainVal, 0.001, dur);

  noise.connect(filter).connect(gain).connect(out(ac));
  noise.start();
  noise.stop(ac.currentTime + dur);

  const osc = ac.createOscillator();
  osc.type = "square";
  osc.frequency.setValueAtTime(kind === "shotgun" ? 90 : 140, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 0.08);
  const oscGain = envGain(ac, 0.25, 0.001, 0.09);
  osc.connect(oscGain).connect(out(ac));
  osc.start();
  osc.stop(ac.currentTime + 0.09);
}

export function playReload() {
  const ac = getCtx();
  [0, 0.12].forEach((delay) => {
    const osc = ac.createOscillator();
    osc.type = "square";
    osc.frequency.value = 320;
    const gain = envGain(ac, 0.12, 0.001, 0.06);
    osc.connect(gain).connect(out(ac));
    osc.start(ac.currentTime + delay);
    osc.stop(ac.currentTime + delay + 0.06);
  });
}

export function playHit() {
  const ac = getCtx();
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(700, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(180, ac.currentTime + 0.08);
  const gain = envGain(ac, 0.2, 0.001, 0.09);
  osc.connect(gain).connect(out(ac));
  osc.start();
  osc.stop(ac.currentTime + 0.09);
}

export function playEnemyDeath() {
  const ac = getCtx();
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, ac.currentTime + 0.35);
  const gain = envGain(ac, 0.22, 0.001, 0.35);
  osc.connect(gain).connect(out(ac));
  osc.start();
  osc.stop(ac.currentTime + 0.35);
}

export function playPlayerHurt() {
  const ac = getCtx();
  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(140, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(60, ac.currentTime + 0.2);
  const gain = envGain(ac, 0.25, 0.001, 0.2);
  osc.connect(gain).connect(out(ac));
  osc.start();
  osc.stop(ac.currentTime + 0.2);
}

export function playWaveStart() {
  const ac = getCtx();
  [440, 554, 659].forEach((freq, i) => {
    const osc = ac.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const gain = envGain(ac, 0.12, 0.001, 0.15);
    osc.connect(gain).connect(out(ac));
    osc.start(ac.currentTime + i * 0.09);
    osc.stop(ac.currentTime + i * 0.09 + 0.15);
  });
}

export function playEmptyClick() {
  const ac = getCtx();
  const osc = ac.createOscillator();
  osc.type = "square";
  osc.frequency.value = 200;
  const gain = envGain(ac, 0.08, 0.001, 0.03);
  osc.connect(gain).connect(out(ac));
  osc.start();
  osc.stop(ac.currentTime + 0.03);
}

export function playNukeBoom() {
  const ac = getCtx();

  const noise = ac.createBufferSource();
  const bufferSize = ac.sampleRate * 1.4;
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.5);
  noise.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(120, ac.currentTime);
  filter.frequency.linearRampToValueAtTime(600, ac.currentTime + 0.3);

  const gain = envGain(ac, 0.9, 0.001, 1.4);
  noise.connect(filter).connect(gain).connect(out(ac));
  noise.start();
  noise.stop(ac.currentTime + 1.4);

  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(55, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(28, ac.currentTime + 1.0);
  const oscGain = envGain(ac, 0.7, 0.001, 1.0);
  osc.connect(oscGain).connect(out(ac));
  osc.start();
  osc.stop(ac.currentTime + 1.0);
}
