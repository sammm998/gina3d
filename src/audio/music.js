/**
 * Bakgrundsmusik i butiksstil – lugn, modern "lounge-house" som skapas direkt
 * i webbläsaren med Web Audio (inga ljudfiler, inga licensfrågor).
 * 116 BPM, mjuk kick och hi-hat, varma ackord (maj7/min9), bas och en enkel
 * pluck-melodi. Startar först efter ett klick (webbläsarnas autoplay-regler).
 */

const BPM = 116;
const BEAT = 60 / BPM;
const STEP = BEAT / 4; // sextondelar
// ackordföljd (MIDI-toner): Fmaj9 – Em7 – Dm9 – Cmaj7 (lätt, ljus känsla)
const CHORDS = [
  [53, 57, 60, 64, 67],
  [52, 55, 59, 62, 67],
  [50, 53, 57, 60, 64],
  [48, 52, 55, 59, 62],
];
const BASS = [41, 40, 38, 36];
const MELODY = [72, null, 74, null, 76, null, 74, 72, null, 69, null, 72, null, null, 71, null];
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

let ctx = null;
let master = null;
let timer = null;
let nextTime = 0;
let step = 0;
let playing = false;
let noiseBuf = null;
let reverb = null;

function setup() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);
  // enkel rumsklang
  const len = ctx.sampleRate * 2.2;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  reverb = ctx.createConvolver();
  reverb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  reverb.connect(wet).connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
}

function out(node, send = 0) {
  node.connect(master);
  if (send) {
    const g = ctx.createGain();
    g.gain.value = send;
    node.connect(g).connect(reverb);
  }
}

function kick(t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(g);
  out(g);
  o.start(t);
  o.stop(t + 0.4);
}

function hat(t, open) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(open ? 0.07 : 0.045, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.22 : 0.05));
  s.connect(f).connect(g);
  out(g, 0.1);
  s.start(t);
  s.stop(t + 0.25);
}

function pad(notes, t, dur) {
  for (const m of notes) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz(m);
      o.detune.value = det;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.022, t + 0.35);
      g.gain.setValueAtTime(0.022, t + dur - 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g);
      out(g, 0.6);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}

function bass(m, t, dur) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = hz(m - 12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.16, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.02, t + dur);
  o.connect(g);
  out(g);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function pluck(m, t) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = hz(m);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(2600, t);
  f.frequency.exponentialRampToValueAtTime(500, t + 0.25);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.03, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0005, t + 0.4);
  o.connect(f).connect(g);
  out(g, 0.5);
  o.start(t);
  o.stop(t + 0.45);
}

function schedule() {
  while (nextTime < ctx.currentTime + 0.25) {
    const t = nextTime;
    const bar = Math.floor(step / 16) % CHORDS.length;
    const s = step % 16;
    const section = Math.floor(step / 64) % 4; // varierar uppbyggnaden lite
    if (s % 4 === 0) kick(t);
    if (s % 4 === 2) hat(t, s === 14);
    if (section > 0 && s % 2 === 1) hat(t, false);
    if (s === 0) pad(CHORDS[bar], t, STEP * 16);
    if ([0, 3, 6, 10, 12].includes(s)) bass(BASS[bar] + (s === 10 ? 7 : 0), t, STEP * 2.5);
    if (section >= 2 && MELODY[s] != null) pluck(MELODY[s] + (bar === 3 ? -2 : 0), t);
    nextTime += STEP;
    step++;
  }
}

export function startMusic() {
  if (!ctx) setup();
  if (ctx.state === 'suspended') ctx.resume();
  if (playing) return;
  playing = true;
  nextTime = ctx.currentTime + 0.1;
  timer = setInterval(schedule, 60);
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2);
}

export function stopMusic() {
  if (!ctx || !playing) return;
  playing = false;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
  setTimeout(() => !playing && clearInterval(timer), 700);
}

const KEY = 'gt3d.music.v1';
export function musicPreference() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}
export function saveMusicPreference(on) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* privat läge */
  }
}
