import sharp from 'sharp';
// Remove a thin, detached horizontal artifact line at the very bottom of a sprite
// (a ground-shadow / stray baseline separated from the body by a transparent gap).
const [dir, nArg] = process.argv.slice(2);
const n = parseInt(nArg || '0');
const base = `public/sprites-test/anim-obj/${dir}`;
const files = n > 0 ? [...Array.from({ length: n }, (_, i) => `${i}.png`), 'idle.png'] : ['idle.png'];
for (const f of files) {
  const path = `${base}/${f}`;
  let buf;
  try {
    const r = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    buf = r;
  } catch { continue; }
  const { data, info } = buf;
  const { width: w, height: h, channels: c } = info;
  const rowOpaque = (y: number) => {
    let cnt = 0;
    for (let x = 0; x < w; x++) if (data[(y * w + x) * c + 3] > 50) cnt++;
    return cnt;
  };
  let y = h - 1;
  const band: number[] = [];
  while (y >= 0 && rowOpaque(y) > 0) { band.push(y); y--; }
  let gap = 0;
  while (y >= 0 && rowOpaque(y) === 0) { gap++; y--; }
  const bodyExists = y >= 0;
  if (band.length > 0 && band.length <= 8 && gap >= 1 && bodyExists) {
    for (const ry of band) for (let x = 0; x < w; x++) data[(ry * w + x) * c + 3] = 0;
    await sharp(data, { raw: { width: w, height: h, channels: c } }).png().toFile(path);
    console.log(`${f}: stripped ${band.length}px baseline (gap ${gap})`);
  } else {
    console.log(`${f}: skip (band ${band.length}, gap ${gap})`);
  }
}
