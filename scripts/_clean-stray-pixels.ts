// 캐릭터 8방향 PNG에서 main blob과 떨어진 작은 픽셀 덩어리(노이즈) 제거.
// 알파 channel 8-connectivity component labeling → 가장 큰 컴포넌트(=캐릭터)
// 외에 SIZE_MAX 미만 + 거리 DIST_MIN 이상 떨어진 컴포넌트만 알파 0 처리.
import sharp from 'sharp';

const ALPHA_THRESHOLD = 16;
const SIZE_MAX = 500;
const DIST_MIN = 0;

interface Component {
  id: number;
  size: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  pixels: number[];
}

async function processOne(inputPath: string, outputPath: string) {
  const { data: buf, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const data = new Uint8Array(buf);
  const { width, height, channels } = info;

  const visited = new Uint8Array(width * height);
  const components: Component[] = [];
  let nextId = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (visited[i]) continue;
      const a = data[i * channels + 3]!;
      if (a < ALPHA_THRESHOLD) {
        visited[i] = 1;
        continue;
      }
      const comp: Component = {
        id: nextId++,
        size: 0,
        minX: x,
        maxX: x,
        minY: y,
        maxY: y,
        pixels: [],
      };
      const stack = [i];
      while (stack.length) {
        const j = stack.pop()!;
        if (visited[j]) continue;
        visited[j] = 1;
        const aj = data[j * channels + 3]!;
        if (aj < ALPHA_THRESHOLD) continue;
        comp.size++;
        comp.pixels.push(j);
        const jy = Math.floor(j / width);
        const jx = j - jy * width;
        if (jx < comp.minX) comp.minX = jx;
        if (jx > comp.maxX) comp.maxX = jx;
        if (jy < comp.minY) comp.minY = jy;
        if (jy > comp.maxY) comp.maxY = jy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = jx + dx;
            const ny = jy + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const nidx = ny * width + nx;
            if (!visited[nidx]) stack.push(nidx);
          }
        }
      }
      components.push(comp);
    }
  }

  components.sort((a, b) => b.size - a.size);
  const main = components[0];
  if (!main) {
    // 빈 이미지
    await sharp(buf, { raw: { width, height, channels } })
      .png()
      .toFile(outputPath);
    return { total: 0, removed: 0, removedDetails: [] };
  }

  const removedDetails: Array<{ size: number; dist: number; bbox: string }> = [];
  for (let i = 1; i < components.length; i++) {
    const c = components[i]!;
    if (c.size >= SIZE_MAX) continue;
    const dx = Math.max(0, main.minX - c.maxX, c.minX - main.maxX);
    const dy = Math.max(0, main.minY - c.maxY, c.minY - main.maxY);
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < DIST_MIN) continue;
    removedDetails.push({
      size: c.size,
      dist: Math.round(dist),
      bbox: `${c.minX},${c.minY}-${c.maxX},${c.maxY}`,
    });
    for (const p of c.pixels) {
      data[p * channels + 3] = 0;
    }
  }

  await sharp(data, { raw: { width, height, channels } }).png().toFile(outputPath);
  return { total: components.length, removed: removedDetails.length, removedDetails };
}

const DIRS = ['south', 'east', 'north', 'west', 'south-east', 'north-east', 'north-west', 'south-west'];
async function debugOne(inputPath: string) {
  const { data: buf, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const data = new Uint8Array(buf);
  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const comps: { size: number; minX: number; maxX: number; minY: number; maxY: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (visited[i]) continue;
      if (data[i * channels + 3]! < ALPHA_THRESHOLD) {
        visited[i] = 1;
        continue;
      }
      const c = { size: 0, minX: x, maxX: x, minY: y, maxY: y };
      const stack = [i];
      while (stack.length) {
        const j = stack.pop()!;
        if (visited[j]) continue;
        visited[j] = 1;
        if (data[j * channels + 3]! < ALPHA_THRESHOLD) continue;
        c.size++;
        const jy = Math.floor(j / width);
        const jx = j - jy * width;
        if (jx < c.minX) c.minX = jx;
        if (jx > c.maxX) c.maxX = jx;
        if (jy < c.minY) c.minY = jy;
        if (jy > c.maxY) c.maxY = jy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = jx + dx;
            const ny = jy + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const ni = ny * width + nx;
            if (!visited[ni]) stack.push(ni);
          }
        }
      }
      comps.push(c);
    }
  }
  comps.sort((a, b) => b.size - a.size);
  const main = comps[0]!;
  console.log(`\n[${inputPath.split('/').pop()}] components(${comps.length}):`);
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i]!;
    const dx = Math.max(0, main.minX - c.maxX, c.minX - main.maxX);
    const dy = Math.max(0, main.minY - c.maxY, c.minY - main.maxY);
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
    const role = i === 0 ? 'MAIN' : 'sub ';
    console.log(`  ${role} size=${String(c.size).padStart(4)} bbox=${c.minX},${c.minY}-${c.maxX},${c.maxY} dist=${dist}`);
  }
}

for (const d of DIRS) {
  const r = await processOne(`/tmp/clean-pixels/orig/${d}.png`, `/tmp/clean-pixels/clean/${d}.png`);
  console.log(
    `${d.padEnd(11)} comps=${String(r.total).padStart(3)}  removed=${r.removed}`,
    r.removedDetails.length ? r.removedDetails : '',
  );
}

console.log('\n=== south-west 상세 ===');
await debugOne('/tmp/clean-pixels/orig/south-west.png');
