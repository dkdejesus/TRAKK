export type DrumKind = "kick" | "snare" | "hat" | "openHat" | "bass";

export type AudioPattern = {
  channel: DrumKind;
  steps: number[];
};

export type MidiNote = {
  start: number;
  duration: number;
  pitch: number;
  velocity: number;
};

export type ArrangementClip = {
  channel: DrumKind;
  startBar: number;
  lengthBars: number;
};

export type AudioEngineOptions = {
  onStep?: (step: number, bar: number) => void;
  onStateChange?: (playing: boolean) => void;
};

const LOOKAHEAD_SECONDS = 0.1;
const SCHEDULE_INTERVAL_MS = 25;

export class TrakkAudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private scheduleTimer: number | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;
  private currentBar = 0;
  private tempo = 120;
  private swing = 0.18;
  private patterns: AudioPattern[] = [];
  private notes: MidiNote[] = [];
  private arrangement: ArrangementClip[] = [];
  private samples = new Map<DrumKind, AudioBuffer>();
  private channelOutputs = new Map<DrumKind, GainNode>();
  private channelMix = new Map<DrumKind, { volume: number; pan: number; muted: boolean; soloed: boolean }>();
  private masterVolume = 0.62;
  private loopEnabled = true;
  private metronomeEnabled = false;
  private playing = false;

  constructor(private readonly options: AudioEngineOptions = {}) {}

  setTempo(tempo: number): void {
    this.tempo = Math.min(240, Math.max(40, tempo));
  }

  setSwing(swing: number): void {
    this.swing = Math.min(1, Math.max(0, swing));
  }

  setPatterns(patterns: AudioPattern[]): void {
    this.patterns = patterns;
  }

  setNotes(notes: MidiNote[]): void {
    this.notes = notes;
  }

  setArrangement(arrangement: ArrangementClip[]): void {
    this.arrangement = arrangement;
  }

  setLoop(enabled: boolean): void {
    this.loopEnabled = enabled;
  }

  setMetronome(enabled: boolean): void {
    this.metronomeEnabled = enabled;
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.min(1, Math.max(0, volume));
    if (this.masterGain && this.context) this.masterGain.gain.setTargetAtTime(this.masterVolume, this.context.currentTime, 0.01);
  }

  setChannelMix(channel: DrumKind, mix: Partial<{ volume: number; pan: number; muted: boolean; soloed: boolean }>): void {
    const current = this.channelMix.get(channel) ?? { volume: 1, pan: 0, muted: false, soloed: false };
    const next = { ...current, ...mix, volume: Math.min(1, Math.max(0, mix.volume ?? current.volume)), pan: Math.min(1, Math.max(-1, mix.pan ?? current.pan)) };
    this.channelMix.set(channel, next);
    const output = this.channelOutputs.get(channel);
    if (output && this.context) output.gain.setTargetAtTime(next.muted ? 0 : next.volume, this.context.currentTime, 0.01);
  }

  async loadSample(channel: DrumKind, data: ArrayBuffer): Promise<void> {
    const context = await this.ensureAudioGraph();
    const audioBuffer = await context.decodeAudioData(data.slice(0));
    this.samples.set(channel, audioBuffer);
  }

  async start(): Promise<void> {
    const context = await this.ensureAudioGraph();
    await context.resume();
    if (this.playing) return;

    this.playing = true;
    this.currentStep = 0;
    this.currentBar = 0;
    this.nextNoteTime = context.currentTime + 0.05;
    this.scheduleTimer = window.setInterval(() => this.schedule(), SCHEDULE_INTERVAL_MS);
    this.schedule();
    this.options.onStateChange?.(true);
  }

  stop(): void {
    if (this.scheduleTimer !== null) {
      window.clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    this.playing = false;
    this.currentStep = 0;
    this.currentBar = 0;
    this.options.onStep?.(0, 0);
    this.options.onStateChange?.(false);
  }

  private async ensureAudioGraph(): Promise<AudioContext> {
    if (this.context) return this.context;

    const AudioContextConstructor = window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) throw new Error("This browser does not support the Web Audio API");

    const context = new AudioContextConstructor();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -6;
    compressor.knee.value = 10;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;
    const masterGain = context.createGain();
    masterGain.gain.value = this.masterVolume;
    masterGain.connect(compressor).connect(context.destination);
    this.context = context;
    this.masterGain = masterGain;
    return context;
  }

  private schedule(): void {
    if (!this.context || !this.playing) return;
    while (this.nextNoteTime < this.context.currentTime + LOOKAHEAD_SECONDS) {
      const stepDuration = 60 / this.tempo / 4;
      const swingOffset = this.currentStep % 2 === 1 ? stepDuration * this.swing * 0.42 : 0;
      const scheduledTime = this.nextNoteTime + swingOffset;
      this.scheduleStep(this.currentStep, this.currentBar, scheduledTime);
      if (!this.loopEnabled && this.currentBar === this.arrangementLength - 1 && this.currentStep === 15) {
        window.setTimeout(() => this.finishPlayback(), Math.max(0, (scheduledTime + stepDuration - (this.context?.currentTime ?? scheduledTime)) * 1000));
      }
      this.nextNoteTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % 16;
      if (this.currentStep === 0) this.currentBar = (this.currentBar + 1) % this.arrangementLength;
    }
  }

  private scheduleStep(step: number, bar: number, time: number): void {
    if (this.metronomeEnabled && step % 4 === 0) this.playMetronome(time, step === 0);
    this.patterns.filter((pattern) => pattern.steps.includes(step) && this.isChannelActive(pattern.channel, bar) && this.shouldPlayChannel(pattern.channel)).forEach(({ channel }) => {
      if (channel === "kick") this.samples.has(channel) ? this.playSample(time, channel) : this.playKick(time);
      if (channel === "snare") this.samples.has(channel) ? this.playSample(time, channel) : this.playSnare(time);
      if (channel === "hat") this.samples.has(channel) ? this.playSample(time, channel) : this.playHat(time, false);
      if (channel === "openHat") this.samples.has(channel) ? this.playSample(time, channel) : this.playHat(time, true);
      if (channel === "bass") this.samples.has(channel) ? this.playSample(time, channel) : this.playBass(time, step);
    });
    const stepDuration = 60 / this.tempo / 4;
    this.notes.filter((note) => note.start === step && this.isChannelActive("bass", bar) && this.shouldPlayChannel("bass")).forEach((note) => this.playMidiNote(time, note, stepDuration));
    window.setTimeout(() => {
      if (this.playing) this.options.onStep?.(step, bar);
    }, Math.max(0, (time - (this.context?.currentTime ?? time)) * 1000));
  }

  private finishPlayback(): void {
    if (!this.playing) return;
    if (this.scheduleTimer !== null) {
      window.clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    this.playing = false;
    this.currentStep = 0;
    this.currentBar = 0;
    this.options.onStep?.(0, 0);
    this.options.onStateChange?.(false);
  }

  private get arrangementLength(): number {
    const lastBar = this.arrangement.reduce((last, clip) => Math.max(last, clip.startBar + clip.lengthBars), 1);
    return Math.max(1, lastBar);
  }

  private isChannelActive(channel: DrumKind, bar: number): boolean {
    if (this.arrangement.length === 0) return true;
    return this.arrangement.some((clip) => clip.channel === channel && bar >= clip.startBar && bar < clip.startBar + clip.lengthBars);
  }

  private shouldPlayChannel(channel: DrumKind): boolean {
    const mix = this.channelMix.get(channel) ?? { volume: 1, pan: 0, muted: false, soloed: false };
    if (mix.muted) return false;
    const anySoloed = [...this.channelMix.values()].some((value) => value.soloed);
    return !anySoloed || mix.soloed;
  }

  private getChannelOutput(channel: DrumKind): GainNode {
    const existing = this.channelOutputs.get(channel);
    if (existing) return existing;
    if (!this.context || !this.masterGain) throw new Error("Audio graph is not ready");
    const mix = this.channelMix.get(channel) ?? { volume: 1, pan: 0, muted: false, soloed: false };
    const output = this.context.createGain();
    output.gain.value = mix.muted ? 0 : mix.volume;
    output.connect(this.masterGain);
    this.channelOutputs.set(channel, output);
    return output;
  }

  private playSample(time: number, channel: DrumKind): void {
    const context = this.context;
    const sample = this.samples.get(channel);
    if (!context || !sample) return;
    const source = context.createBufferSource();
    source.buffer = sample;
    source.connect(this.getChannelOutput(channel));
    source.start(time);
  }

  private playMetronome(time: number, downbeat: boolean): void {
    const context = this.context;
    const output = this.masterGain;
    if (!context || !output) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = downbeat ? 1500 : 980;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(downbeat ? 0.09 : 0.055, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    oscillator.connect(gain).connect(output);
    oscillator.start(time);
    oscillator.stop(time + 0.05);
  }

  private playKick(time: number): void {
    const context = this.context;
    const output = this.getChannelOutput("kick");
    if (!context || !output) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(155, time);
    oscillator.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.92, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);
    oscillator.connect(gain).connect(output);
    oscillator.start(time);
    oscillator.stop(time + 0.45);
  }

  private playSnare(time: number): void {
    const context = this.context;
    const output = this.getChannelOutput("snare");
    if (!context || !output) return;
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = this.createNoiseBuffer(0.18);
    noiseFilter.type = "highpass";
    noiseFilter.frequency.value = 1300;
    noiseGain.gain.setValueAtTime(0.0001, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.42, time + 0.002);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
    const body = context.createOscillator();
    const bodyGain = context.createGain();
    body.type = "triangle";
    body.frequency.value = 180;
    bodyGain.gain.setValueAtTime(0.0001, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.18, time + 0.002);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    noise.connect(noiseFilter).connect(noiseGain).connect(output);
    body.connect(bodyGain).connect(output);
    noise.start(time);
    noise.stop(time + 0.2);
    body.start(time);
    body.stop(time + 0.14);
  }

  private playHat(time: number, open: boolean): void {
    const context = this.context;
    const output = this.getChannelOutput(open ? "openHat" : "hat");
    if (!context || !output) return;
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const duration = open ? 0.34 : 0.07;
    noise.buffer = this.createNoiseBuffer(duration);
    filter.type = "highpass";
    filter.frequency.value = open ? 4700 : 6800;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(open ? 0.13 : 0.1, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    noise.connect(filter).connect(gain).connect(output);
    noise.start(time);
    noise.stop(time + duration + 0.02);
  }

  private playBass(time: number, step: number): void {
    const context = this.context;
    const output = this.getChannelOutput("bass");
    if (!context || !output) return;
    const notes = [36, 36, 43, 36, 31, 31, 38, 31, 36, 36, 43, 48, 36, 31, 38, 43];
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = 440 * Math.pow(2, (notes[step] - 69) / 12);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(520, time);
    filter.frequency.exponentialRampToValueAtTime(180, time + 0.18);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.15, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.24);
    oscillator.connect(filter).connect(gain).connect(output);
    oscillator.start(time);
    oscillator.stop(time + 0.26);
  }

  private playMidiNote(time: number, note: MidiNote, stepDuration: number): void {
    const context = this.context;
    const output = this.getChannelOutput("bass");
    if (!context || !output) return;

    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const duration = Math.max(0.08, note.duration * stepDuration * 0.92);
    oscillator.type = "triangle";
    oscillator.frequency.value = 440 * Math.pow(2, (note.pitch - 69) / 12);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1450, time);
    filter.frequency.exponentialRampToValueAtTime(620, time + Math.min(duration, 0.28));
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.03, note.velocity * 0.22), time + 0.012);
    gain.gain.setValueAtTime(Math.max(0.03, note.velocity * 0.22), time + Math.max(0.02, duration - 0.05));
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(filter).connect(gain).connect(output);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  private createNoiseBuffer(duration: number): AudioBuffer {
    const context = this.context;
    if (!context) throw new Error("Audio context is not ready");
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return buffer;
  }
}
