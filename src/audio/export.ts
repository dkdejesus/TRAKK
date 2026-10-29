import type { ArrangementClip, AudioPattern, MidiNote } from "./engine.ts";

type RenderInput = {
  tempo: number;
  bars: number;
  patterns: AudioPattern[];
  notes: MidiNote[];
  arrangement: ArrangementClip[];
};

export async function renderArrangementWav(input: RenderInput): Promise<Blob> {
  const sampleRate = 44100;
  const secondsPerBar = 240 / input.tempo;
  const duration = input.bars * secondsPerBar + 0.5;
  const context = new OfflineAudioContext(2, Math.ceil(sampleRate * duration), sampleRate);
  const master = context.createGain();
  master.gain.value = 0.62;
  master.connect(context.destination);

  for (let bar = 0; bar < input.bars; bar += 1) {
    for (let step = 0; step < 16; step += 1) {
      const time = bar * secondsPerBar + step * (secondsPerBar / 16);
      input.patterns.filter((pattern) => pattern.steps.includes(step) && isActive(pattern.channel, bar, input.arrangement)).forEach((pattern) => {
        if (pattern.channel === "kick") playKick(context, master, time);
        if (pattern.channel === "snare") playSnare(context, master, time);
        if (pattern.channel === "hat") playHat(context, master, time, false);
        if (pattern.channel === "openHat") playHat(context, master, time, true);
        if (pattern.channel === "bass") playBass(context, master, time, step);
      });
      input.notes.filter((note) => note.start === step && isActive("bass", bar, input.arrangement)).forEach((note) => playNote(context, master, time, note, secondsPerBar / 16));
    }
  }

  return encodeWav(await context.startRendering());
}

function isActive(channel: ArrangementClip["channel"], bar: number, arrangement: ArrangementClip[]): boolean {
  if (arrangement.length === 0) return true;
  return arrangement.some((clip) => clip.channel === channel && bar >= clip.startBar && bar < clip.startBar + clip.lengthBars);
}

function playKick(context: BaseAudioContext, output: AudioNode, time: number): void {
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

function playSnare(context: BaseAudioContext, output: AudioNode, time: number): void {
  const noise = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  noise.buffer = createNoiseBuffer(context, 0.18);
  filter.type = "highpass";
  filter.frequency.value = 1300;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.42, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
  noise.connect(filter).connect(gain).connect(output);
  noise.start(time);
  noise.stop(time + 0.2);
}

function playHat(context: BaseAudioContext, output: AudioNode, time: number, open: boolean): void {
  const noise = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const duration = open ? 0.34 : 0.07;
  noise.buffer = createNoiseBuffer(context, duration);
  filter.type = "highpass";
  filter.frequency.value = open ? 4700 : 6800;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(open ? 0.13 : 0.1, time + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  noise.connect(filter).connect(gain).connect(output);
  noise.start(time);
  noise.stop(time + duration + 0.02);
}

function playBass(context: BaseAudioContext, output: AudioNode, time: number, step: number): void {
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

function playNote(context: BaseAudioContext, output: AudioNode, time: number, note: MidiNote, stepDuration: number): void {
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const duration = Math.max(0.08, note.duration * stepDuration * 0.92);
  oscillator.type = "triangle";
  oscillator.frequency.value = 440 * Math.pow(2, (note.pitch - 69) / 12);
  filter.type = "lowpass";
  filter.frequency.value = 1450;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.03, note.velocity * 0.22), time + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  oscillator.connect(filter).connect(gain).connect(output);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.02);
}

function createNoiseBuffer(context: BaseAudioContext, duration: number): AudioBuffer {
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}

function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytesPerSample = 2;
  const dataLength = frames * channels * bytesPerSample;
  const view = new DataView(new ArrayBuffer(44 + dataLength));
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}
