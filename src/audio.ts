// 音はすべて Web Audio で合成する。最初のボタン操作のあとで鳴らし始める。
// どの音も「出力先の AudioContext」と「鳴らす時刻」を受け取る render() を通す。
// 告知動画の書き出しでは、記録した呼び出しを OfflineAudioContext で同じように鳴らし直す。

const KEY = 'toilet-sniper:sound';

type Surface = 'ceramic' | 'water' | 'floor' | 'none';

/** 1つの AudioContext に作る、鳴り続ける音（水流・ハエの羽音）のつながり */
interface Graph {
  master: GainNode;
  flowGain: GainNode;
  flowFilter: BiquadFilterNode;
  buzzGain: GainNode;
  noiseBuf: AudioBuffer;
}

function buildGraph(ctx: BaseAudioContext, masterVol: number): Graph {
  const master = ctx.createGain();
  master.gain.value = masterVol;
  master.connect(ctx.destination);

  // 水の音: ノイズ → 帯域フィルタ → 音量
  const len = ctx.sampleRate * 2;
  const noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = last * 0.6 + w * 0.4; // 少しこもらせる
    d[i] = last * (0.7 + 0.3 * Math.sin(i * 0.0021) * Math.sin(i * 0.00057));
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const flowFilter = ctx.createBiquadFilter();
  flowFilter.type = 'bandpass';
  flowFilter.frequency.value = 1200;
  flowFilter.Q.value = 0.9;
  const flowGain = ctx.createGain();
  flowGain.gain.value = 0;
  src.connect(flowFilter).connect(flowGain).connect(master);
  src.start(0);

  // ハエの羽音: のこぎり波を小刻みに揺らす
  const buzz = ctx.createOscillator();
  buzz.type = 'sawtooth';
  buzz.frequency.value = 210;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 23;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 18;
  lfo.connect(lfoGain).connect(buzz.frequency);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  const buzzGain = ctx.createGain();
  buzzGain.gain.value = 0;
  buzz.connect(lp).connect(buzzGain).connect(master);
  buzz.start(0);
  lfo.start(0);
  return { master, flowGain, flowFilter, buzzGain, noiseBuf };
}

function tone(ctx: BaseAudioContext, out: AudioNode, when: number, freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number): void {
  const t = when + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** 水を流す音: ボタンのカチッ → ジャー → 最後にゴボゴボ */
function flushSound(ctx: BaseAudioContext, gr: Graph, t: number, duration: number): void {
  tone(ctx, gr.master, t, 900, 0.05, 'square', 0.06);
  const src = ctx.createBufferSource();
  src.buffer = gr.noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(3200, t);
  f.frequency.linearRampToValueAtTime(900, t + duration);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.3, t + 0.3);
  g.gain.setValueAtTime(0.3, t + duration * 0.55);
  g.gain.linearRampToValueAtTime(0, t + duration);
  src.connect(f).connect(g).connect(gr.master);
  src.start(t);
  src.stop(t + duration + 0.1);
  // ゴボゴボ: こもった音の大きさを小刻みに揺らす
  const s2 = ctx.createBufferSource();
  s2.buffer = gr.noiseBuf;
  s2.loop = true;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'lowpass';
  f2.frequency.value = 420;
  const g2 = ctx.createGain();
  const t2 = t + duration * 0.6;
  g2.gain.setValueAtTime(0, t);
  g2.gain.setValueAtTime(0, t2);
  g2.gain.linearRampToValueAtTime(0.35, t2 + 0.2);
  g2.gain.linearRampToValueAtTime(0, t + duration + 0.2);
  const am = ctx.createGain();
  am.gain.value = 0.5;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 8;
  const lg = ctx.createGain();
  lg.gain.value = 0.5;
  lfo.connect(lg).connect(am.gain);
  s2.connect(f2).connect(am).connect(g2).connect(gr.master);
  s2.start(t);
  lfo.start(t);
  s2.stop(t + duration + 0.3);
  lfo.stop(t + duration + 0.3);
}

export class Sound {
  enabled = true;
  private ctx: AudioContext | null = null;
  private graphs = new WeakMap<BaseAudioContext, Graph>();
  /** 告知動画の撮影用: true の間は鳴らさずに呼び出しを記録する */
  private capturing = false;
  private queue: { name: string; args: unknown[] }[] = [];
  private lastArgs = new Map<string, string>();

  constructor() {
    try {
      this.enabled = localStorage.getItem(KEY) !== 'off';
    } catch {
      /* 保存できない環境では音あり */
    }
  }

  /** ボタン操作の中で呼ぶ */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    } catch {
      return;
    }
    this.graphs.set(this.ctx, buildGraph(this.ctx, this.enabled ? 0.8 : 0));
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      /* 無視 */
    }
    const g = this.ctx && this.graphs.get(this.ctx);
    if (g && this.ctx) g.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.02);
  }

  /** 指定した出力先で、時刻 when に音を鳴らす。普段の再生と告知動画の書き出しで共用する */
  render(ctx: BaseAudioContext, name: string, args: unknown[], when: number): void {
    let gr = this.graphs.get(ctx);
    if (!gr) {
      gr = buildGraph(ctx, 0.8);
      this.graphs.set(ctx, gr);
    }
    const out = gr.master;
    const n = (i: number) => Number(args[i]) || 0;
    switch (name) {
      case 'flow': {
        const level = n(0), surface = args[1] as Surface;
        const vol = surface === 'none' ? 0 : level * (surface === 'floor' ? 0.12 : 0.22);
        gr.flowGain.gain.setTargetAtTime(vol, when, 0.04);
        const f = surface === 'ceramic' ? 1700 + level * 900 : surface === 'water' ? 900 + level * 500 : 600;
        gr.flowFilter.frequency.setTargetAtTime(f, when, 0.06);
        break;
      }
      case 'buzz': {
        const c = n(0);
        gr.buzzGain.gain.setTargetAtTime(c > 0 ? Math.min(0.05, 0.03 + c * 0.008) : 0, when, 0.05);
        break;
      }
      case 'flush':
        flushSound(ctx, gr, when, n(0));
        break;
      case 'flee':
        tone(ctx, out, when, 1600, 0.12, 'sine', 0.09, 0, 2600);
        break;
      case 'click':
        tone(ctx, out, when, 660, 0.08, 'square', 0.06);
        break;
      case 'targetOn':
        tone(ctx, out, when, 1320, 0.07, 'sine', 0.08);
        break;
      case 'second':
        tone(ctx, out, when, 660 * Math.pow(2, Math.min(n(0), 12) / 12), 0.14, 'triangle', 0.12);
        break;
      case 'clear':
        [523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, when, f, 0.25, 'triangle', 0.16, i * 0.09));
        break;
      case 'fail':
        tone(ctx, out, when, 330, 0.5, 'triangle', 0.14, 0, 150);
        break;
      case 'drip':
        tone(ctx, out, when, 1400, 0.06, 'sine', 0.05, 0, 700);
        break;
    }
  }

  private play(name: string, ...args: unknown[]): void {
    if (this.capturing) {
      // 毎フレーム呼ばれる音（水流・羽音）は、値が変わったときだけ記録する
      if (name === 'flow' || name === 'buzz') {
        const key = JSON.stringify(args);
        if (this.lastArgs.get(name) === key) return;
        this.lastArgs.set(name, key);
      }
      this.queue.push({ name, args });
      return;
    }
    if (!this.ctx) return;
    this.render(this.ctx, name, args, this.ctx.currentTime);
  }

  /** 毎フレーム: 水流の強さ（0..1）と、どこに当たっているか */
  setFlow(level: number, surface: Surface): void {
    this.play('flow', Math.round(level * 100) / 100, surface);
  }
  /** 飛んでいるハエの数 */
  setBuzz(n: number): void {
    this.play('buzz', n);
  }
  flush(duration: number): void {
    this.play('flush', duration);
  }
  flee(): void {
    this.play('flee');
  }
  click(): void {
    this.play('click');
  }
  targetOn(): void {
    this.play('targetOn');
  }
  second(n: number): void {
    this.play('second', n);
  }
  clear(): void {
    this.play('clear');
  }
  fail(): void {
    this.play('fail');
  }
  drip(): void {
    this.play('drip');
  }

  /** 告知動画の撮影用 */
  capture(on: boolean): void {
    this.capturing = on;
    this.queue = [];
    this.lastArgs.clear();
  }
  drain(): { name: string; args: unknown[] }[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  get debug(): { enabled: boolean; started: boolean } {
    return { enabled: this.enabled, started: !!this.ctx };
  }
}
