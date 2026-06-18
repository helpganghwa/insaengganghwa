// 기준 프레임의 특정 사각 영역(예: 후광)을 전 프레임에 합성(over) — 그 영역을 항상 동일하게 보이게.
// 기준 영역의 불투명 픽셀만 칠해지므로(투명은 통과) 해당 요소가 모든 프레임에서 일정하게 유지된다.
// 사용: bun run scripts/_overlay-region.ts <key> <refIdx> <x> <y> <w> <h> [n]
import sharp from 'sharp';
const [key, refS, xS, yS, wS, hS, nS] = process.argv.slice(2);
if (!key || hS === undefined) { console.error('usage: bun run scripts/_overlay-region.ts <key> <refIdx> <x> <y> <w> <h> [n]'); process.exit(1); }
const ref = Number(refS), x = Number(xS), y = Number(yS), w = Number(wS), h = Number(hS), N = Number(nS ?? 15);
const dir = `public/sprites-test/anim-obj/${key}`;
const patch = await sharp(`${dir}/${ref}.png`).extract({ left: x, top: y, width: w, height: h }).png().toBuffer();
for (let i = 0; i < N; i++) {
  const out = await sharp(`${dir}/${i}.png`).composite([{ input: patch, left: x, top: y }]).png().toBuffer();
  await sharp(out).toFile(`${dir}/${i}.png`);
}
console.log(`✓ ${key}: f${ref}의 영역(${x},${y},${w}x${h})을 전 ${N}프레임에 합성`);
