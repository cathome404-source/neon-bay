// Sound, all synthesised with WebAudio: no audio files, no network. Engine hum, sirens,
// gunshots, punches, pickups and jingles are oscillators and filtered noise, built on demand.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  /** Call from a user gesture (start button, first key) so the context is allowed to run. */
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, duration, type, volume, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function noise(duration, volume, filterFreq, filterType) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  function jingle(notes, noteTime, type, volume) {
    if (!ensure()) return;
    notes.forEach((freq, i) => {
      setTimeout(() => tone(freq, noteTime, type, volume), i * noteTime * 1000);
    });
  }

  return {
    unlock,
    /** The engine hum follows the car's speed (0..1); call every frame while driving. */
    engine(speed01, on) {
      if (!ensure()) return;
      if (!on) {
        if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 500;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(master);
        engineOsc.start();
      }
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
      engineFilter.frequency.setTargetAtTime(350 + speed01 * 900, t, 0.08);
      engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.05, t, 0.1);
    },
    /** The two-tone siren; `near` (0..1) sets how loud it is. Call every frame. */
    siren(near) {
      if (!ensure()) return;
      if (near <= 0.01) {
        if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain);
        sirenGain.connect(master);
        sirenOsc.start();
      }
      sirenTimer -= 1 / 60;
      if (sirenTimer <= 0) {
        sirenTimer = 0.42;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.setValueAtTime(sirenHigh ? 720 : 540, ctx.currentTime);
      }
      sirenGain.gain.setTargetAtTime(0.028 * near, ctx.currentTime, 0.15);
    },
    gunshot() { noise(0.14, 0.5, 2800, 'lowpass'); tone(150, 0.1, 'square', 0.2, 60); },
    punch() { noise(0.09, 0.35, 500, 'lowpass'); },
    crash() { noise(0.3, 0.5, 900, 'lowpass'); tone(90, 0.25, 'sawtooth', 0.2, 40); },
    skid() { noise(0.18, 0.12, 2400, 'bandpass'); },
    pickup() { jingle([660, 880], 0.09, 'sine', 0.25); },
    cash() { jingle([880, 1174, 1568], 0.08, 'sine', 0.22); },
    mission() { jingle([523, 659, 784, 1046], 0.13, 'triangle', 0.25); },
    fail() { jingle([392, 330, 262], 0.16, 'triangle', 0.22); },
    busted() { jingle([220, 196, 165], 0.2, 'sawtooth', 0.2); },
    click() { tone(800, 0.05, 'sine', 0.15); },
  };
}
