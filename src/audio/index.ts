// AudioKit (Agente 3): sonidos breves y suaves sintetizados con WebAudio (sin archivos).
// Decisión abierta de la sala (sección 17): por defecto suenan bajito y siempre se pueden silenciar.
// El audio nunca es indispensable: todo sonido acompaña una señal visual.
import type { AudioKit, SoundId } from '../core/contracts';

const MASTER = 0.22; // volumen general (suave)

type Ctx = AudioContext;

function env(g: GainNode, t0: number, attack: number, peak: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function tone(ctx: Ctx, out: AudioNode, t0: number, f0: number, f1: number, dur: number, peak: number, type: OscillatorType = 'sine'): void {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  env(g, t0, Math.min(0.012, dur * 0.2), peak, dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(ctx: Ctx, out: AudioNode, buf: AudioBuffer, t0: number, dur: number, peak: number, fFrom: number, fTo: number, q = 1.2): void {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(fFrom, t0);
  bp.frequency.exponentialRampToValueAtTime(fTo, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

const VOICES: Record<SoundId, (ctx: Ctx, out: AudioNode, nb: AudioBuffer, t: number) => void> = {
  // toque: gota corta y aguda
  tap: (c, o, _n, t) => tone(c, o, t, 1250, 900, 0.06, 0.35),
  // acople magnético: clic + golpe grave
  snap: (c, o, n, t) => {
    noise(c, o, n, t, 0.05, 0.5, 3500, 2500, 3);
    tone(c, o, t + 0.01, 220, 140, 0.12, 0.6, 'triangle');
  },
  // logro: arpegio mayor ascendente (do-mi-sol-do)
  success: (c, o, _n, t) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, o, t + i * 0.085, f, f, 0.22, 0.32, 'triangle'));
  },
  // intento fallido: dos notas descendentes, sin dureza
  fail: (c, o, _n, t) => {
    tone(c, o, t, 392, 370, 0.16, 0.3, 'triangle');
    tone(c, o, t + 0.14, 311, 280, 0.24, 0.3, 'triangle');
  },
  // corriente de aire/luz (aparición, cambio de experiencia)
  whoosh: (c, o, n, t) => noise(c, o, n, t, 0.45, 0.35, 400, 2400, 0.9),
  // colocar: asentamiento grave + brillo
  place: (c, o, n, t) => {
    tone(c, o, t, 180, 110, 0.22, 0.6, 'sine');
    noise(c, o, n, t, 0.08, 0.15, 2000, 1200, 2);
    tone(c, o, t + 0.05, 880, 880, 0.18, 0.12, 'sine');
  },
};

export function createAudioKit(): AudioKit {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuf: AudioBuffer | null = null;
  let muted = false;
  const last = new Map<SoundId, number>();

  const ensure = (): boolean => {
    if (ctx) return true;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    // compresor suave: evita picos si coinciden varios sonidos
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    return true;
  };

  return {
    play(id) {
      if (muted) return;
      if (!ensure() || !ctx || !master || !noiseBuf) return;
      // El contexto arranca suspendido hasta un gesto del usuario; se reanuda en el primer toque.
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      // anti-ráfaga: el mismo sonido como máximo cada 50 ms
      if (now - (last.get(id) ?? -1) < 0.05) return;
      last.set(id, now);
      try {
        VOICES[id](ctx, master, noiseBuf, now + 0.005);
      } catch {
        /* el audio nunca rompe la experiencia */
      }
    },
    setMuted(m) {
      muted = m;
      if (ctx && master) master.gain.setTargetAtTime(m ? 0 : MASTER, ctx.currentTime, 0.04);
    },
    dispose() {
      const c = ctx;
      ctx = null;
      master = null;
      noiseBuf = null;
      last.clear();
      if (c) void c.close().catch(() => {});
    },
  };
}
