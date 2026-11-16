// Synthesised sound effects: every sound is built from oscillators and shaped
// noise in WebAudio, so the game ships no audio files and makes no requests.
// The context starts on the first user gesture (the play click).
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function noise({ duration, freq, q, gain, when = 0, slideTo = null }) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t);
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  function tone({ freq, duration, type = 'sine', gain, when = 0, slideTo = null }) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // Volume falls with distance: 1 at the listener, 0 past maxDist metres.
  function attenuate(distance, maxDist) {
    return Math.max(0, 1 - distance / maxDist);
  }

  return {
    unlock() { ensure(); },
    shot(kind, distance = 0) {
      const v = 0.25 + 0.75 * attenuate(distance, 55);
      if (kind === 'scatter') {
        noise({ duration: 0.28, freq: 500, q: 0.6, gain: 0.9 * v, slideTo: 120 });
        tone({ freq: 90, duration: 0.16, type: 'sine', gain: 0.7 * v, slideTo: 45 });
      } else if (kind === 'rifle') {
        noise({ duration: 0.14, freq: 900, q: 0.8, gain: 0.7 * v, slideTo: 200 });
        tone({ freq: 130, duration: 0.09, type: 'triangle', gain: 0.5 * v, slideTo: 60 });
      } else {
        noise({ duration: 0.11, freq: 1400, q: 1, gain: 0.55 * v, slideTo: 300 });
        tone({ freq: 180, duration: 0.07, type: 'triangle', gain: 0.35 * v, slideTo: 90 });
      }
    },
    dryFire() { tone({ freq: 1200, duration: 0.04, type: 'square', gain: 0.12 }); },
    reload() {
      tone({ freq: 500, duration: 0.05, type: 'square', gain: 0.12 });
      tone({ freq: 750, duration: 0.05, type: 'square', gain: 0.12, when: 0.18 });
      tone({ freq: 600, duration: 0.06, type: 'square', gain: 0.14, when: 0.42 });
    },
    hit(head) {
      tone({ freq: head ? 1900 : 1400, duration: 0.06, type: 'sine', gain: 0.25 });
    },
    kill() {
      tone({ freq: 880, duration: 0.08, type: 'sine', gain: 0.22 });
      tone({ freq: 1320, duration: 0.12, type: 'sine', gain: 0.2, when: 0.07 });
    },
    hurt() { noise({ duration: 0.12, freq: 300, q: 1, gain: 0.3, slideTo: 140 }); },
    step(distance = 0) {
      const v = attenuate(distance, 14);
      if (v <= 0.05) return;
      noise({ duration: 0.05, freq: 700, q: 1, gain: 0.1 * v });
    },
    plantBeep(fast) {
      tone({ freq: 1050, duration: 0.09, type: 'square', gain: 0.18 });
      if (fast) tone({ freq: 1050, duration: 0.09, type: 'square', gain: 0.18, when: 0.16 });
    },
    explosion(distance = 0) {
      const v = 0.3 + 0.7 * attenuate(distance, 70);
      noise({ duration: 1.1, freq: 220, q: 0.4, gain: 1.0 * v, slideTo: 50 });
      tone({ freq: 70, duration: 0.9, type: 'sine', gain: 0.9 * v, slideTo: 30 });
    },
    roundEnd(won) {
      const base = won ? 523 : 392;
      tone({ freq: base, duration: 0.14, type: 'triangle', gain: 0.25 });
      tone({ freq: base * 1.25, duration: 0.14, type: 'triangle', gain: 0.25, when: 0.13 });
      tone({ freq: base * 1.5, duration: 0.22, type: 'triangle', gain: 0.25, when: 0.26 });
    },
    buy() {
      tone({ freq: 990, duration: 0.07, type: 'sine', gain: 0.2 });
      tone({ freq: 1480, duration: 0.1, type: 'sine', gain: 0.18, when: 0.06 });
    },
    denied() { tone({ freq: 220, duration: 0.12, type: 'square', gain: 0.15 }); },
    pin() { tone({ freq: 1600, duration: 0.05, type: 'square', gain: 0.15 }); },
  };
}
