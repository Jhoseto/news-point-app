/** Length-prefixed speech pieces. One MP3 cannot be seeked after the pieces are glued together. */

export function packSpeechParts(parts: readonly Uint8Array[]): Uint8Array {
  const usable = parts.filter((part) => part.byteLength > 0);
  const total = usable.reduce((sum, part) => sum + 4 + part.byteLength, 4);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, usable.length, true);
  let offset = 4;
  for (const part of usable) {
    view.setUint32(offset, part.byteLength, true);
    offset += 4;
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export function unpackSpeechParts(bytes: Uint8Array): Uint8Array[] {
  if (bytes.byteLength < 4) return [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(0, true);
  const parts: Uint8Array[] = [];
  let offset = 4;
  for (let index = 0; index < count; index += 1) {
    if (offset + 4 > bytes.byteLength) break;
    const length = view.getUint32(offset, true);
    offset += 4;
    if (offset + length > bytes.byteLength) break;
    parts.push(bytes.slice(offset, offset + length));
    offset += length;
  }
  return parts;
}
