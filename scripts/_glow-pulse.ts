import sharp from 'sharp';
// Build a zero-movement "flash/glow pulse" animation from the static idle.png:
// every frame is the exact same image with only brightness oscillating. No motion at all.
const [dir, nArg, ampArg, mode] = process.argv.slice(2);
const n = parseInt(nArg || '15');
const amp = parseFloat(ampArg || '0.4');
const base = `public/sprites-test/anim-obj/${dir}`;
const { data, info } = await sharp(`${base}/idle.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h, channels: c } = info;
for (let f = 0; f < n; f++) {
  const factor = 1 + amp * Math.sin((2 * Math.PI * f) / n);
  const out = Buffer.from(data);
  for (let p = 0; p < w * h; p++) {
    if (!data[p * c + 3]) continue;
    const r = data[p * c], g = data[p * c + 1], b = data[p * c + 2];
    if (mode === 'gold' && !(r > 130 && g > 70 && b < r * 0.8)) continue;
    for (let k = 0; k < 3; k++) {
      let v = data[p * c + k] * factor;
      if (v > 255) v = 255;
      out[p * c + k] = v;
    }
  }
  await sharp(out, { raw: { width: w, height: h, channels: c } }).png().toFile(`${base}/${f}.png`);
}
console.log(`${dir}: glow-pulse ${n} frames (amp ${amp}) — zero movement`);
