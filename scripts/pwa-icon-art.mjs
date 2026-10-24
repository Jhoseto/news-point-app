/** One centred, opaque composition for every reader launcher icon. */
export async function readerPwaIcon(sharp, source, size) {
  // 78% diameter leaves antialiasing inside the maskable 80% safe circle.
  // Trim the asymmetric SVG viewBox before centring the actual visible artwork.
  const mark = await sharp(source, { density: 512 }).trim().resize({
    width: Math.round(size * .78), height: Math.round(size * .78), fit: "inside",
  }).png().toBuffer();
  const { width, height } = await sharp(mark).metadata();
  return sharp({ create: { width: size, height: size, channels: 3, background: "#ffffff" } })
    .composite([{ input: mark, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }]);
}
