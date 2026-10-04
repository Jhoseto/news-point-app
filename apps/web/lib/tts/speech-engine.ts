/** Playback of one decoded recording. Seeking starts again from the chosen second. */

export interface SpeechEngine {
  context: AudioContext;
  buffer: AudioBuffer;
  source: AudioBufferSourceNode | null;
  offset: number;
  startedAt: number;
  token: number;
}

export function createEngine(context: AudioContext, buffer: AudioBuffer): SpeechEngine {
  return { context, buffer, source: null, offset: 0, startedAt: 0, token: 0 };
}

export function engineTime(engine: SpeechEngine): number {
  if (!engine.source) return engine.offset;
  const played = engine.context.currentTime - engine.startedAt;
  return Math.min(engine.buffer.duration, Math.max(0, engine.offset + played));
}

export function pauseEngine(engine: SpeechEngine): number {
  engine.offset = engineTime(engine);
  stopSource(engine);
  return engine.offset;
}

export function playEngine(engine: SpeechEngine, seconds: number, onEnded: () => void): void {
  stopSource(engine);
  const offset = Math.min(engine.buffer.duration, Math.max(0, seconds));
  engine.offset = offset;
  if (offset >= engine.buffer.duration - 0.05) {
    onEnded();
    return;
  }
  const source = engine.context.createBufferSource();
  source.buffer = engine.buffer;
  source.connect(engine.context.destination);
  const token = engine.token;
  source.onended = () => {
    if (engine.token !== token || engine.source !== source) return;
    engine.source = null;
    engine.offset = engine.buffer.duration;
    onEnded();
  };
  engine.source = source;
  engine.startedAt = engine.context.currentTime;
  source.start(0, offset);
}

function stopSource(engine: SpeechEngine): void {
  engine.token += 1;
  const source = engine.source;
  engine.source = null;
  if (!source) return;
  source.onended = null;
  try {
    source.stop();
  } catch {
    /* already stopped */
  }
}

export async function decodeSpeechParts(context: AudioContext, parts: readonly Uint8Array[]): Promise<AudioBuffer> {
  const buffers: AudioBuffer[] = [];
  for (const part of parts) {
    const copy = new ArrayBuffer(part.byteLength);
    new Uint8Array(copy).set(part);
    buffers.push(await context.decodeAudioData(copy));
  }
  if (!buffers.length) throw new Error("empty");
  const channels = buffers[0]!.numberOfChannels;
  const rate = buffers[0]!.sampleRate;
  const length = buffers.reduce((sum, buffer) => sum + buffer.length, 0);
  const mixed = context.createBuffer(channels, length, rate);
  for (let channel = 0; channel < channels; channel += 1) {
    const dest = mixed.getChannelData(channel);
    let offset = 0;
    for (const buffer of buffers) {
      dest.set(buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1)), offset);
      offset += buffer.length;
    }
  }
  return mixed;
}
