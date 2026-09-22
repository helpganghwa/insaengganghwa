/**
 * 한가위 이벤트 UI 그림 — Pixellab pixflux(key3). 송편 아이콘(투명 배경)과 홈 배너 배경.
 *   실행: GEN_KEY=3 bun run scripts/gen-chuseok-ui.ts [--only=a,b]   결과: public/sprites/chuseok-ui/*.png (있으면 건너뜀)
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { scriptKeyFor, scriptKeyLabel } from './pixellab-script-key';

config({ path: '.env.local' });
const OUT = join(process.cwd(), 'public', 'sprites', 'chuseok-ui');
const { key: KEY, envName } = scriptKeyFor(scriptKeyLabel('key3'));
if (!KEY) throw new Error(`${envName} 없음`);

type Job = { key: string; w: number; h: number; noBg: boolean; prompt: string };
const JOBS: Job[] = [
  { key: 'songpyeon_a', w: 96, h: 96, noBg: true, prompt: 'a single Korean half-moon rice cake songpyeon, plump white glossy rice dough with a subtle green pine-needle tint, a small pinch mark seam along the top, soft highlight, centered, cute food icon, pixel art' },
  { key: 'songpyeon_b', w: 96, h: 96, noBg: true, prompt: 'three Korean half-moon rice cakes songpyeon stacked on a small round dish, white, pale green and pink dough, glossy, a few pine needles beside them, centered, cute food icon, pixel art' },
  { key: 'songpyeon_c', w: 96, h: 96, noBg: true, prompt: 'a single Korean songpyeon: a plump half-moon shaped steamed rice cake dumpling, crescent silhouette with a pinched crimped seam along the curved edge, glossy white dough with a faint green tint, sitting on two pine needles, seen from the side, centered, food icon, pixel art' },
  // 2차 후보(09-22 밤, 사용자 "여러 가지 생성해서 선택"): 송편은 반달 실루엣을 강하게, 배너는 소재를 달리
  { key: 'songpyeon_d', w: 96, h: 96, noBg: true, prompt: 'one Korean songpyeon rice cake, a crescent half-moon shaped dumpling with a flat bottom and a curved top edge with small pleated crimps, smooth white dough, seen from the front slightly above, soft shading, bold clean outline, centered, food icon, pixel art' },
  { key: 'songpyeon_e', w: 96, h: 96, noBg: true, prompt: 'two Korean songpyeon half-moon rice cake dumplings side by side, one white and one pale mugwort green, crescent shapes with crimped curved edges, glossy, centered, food icon, pixel art' },
  { key: 'songpyeon_f', w: 96, h: 96, noBg: true, prompt: 'a single pink Korean songpyeon, a half-moon crescent dumpling with a pinched wavy seam along the arc, resting on a few green pine needles, three-quarter view from above, cute, centered, food icon, pixel art' },
  { key: 'songpyeon_g', w: 96, h: 96, noBg: true, prompt: 'a stylized icon of a Korean half-moon rice cake songpyeon, thick dark outline, flat bold colors, white body with a green stripe of mugwort, crescent shape, mascot style, centered, pixel art' },
  { key: 'songpyeon_h', w: 96, h: 96, noBg: true, prompt: 'three Korean songpyeon half-moon dumplings fanned out on a small round bamboo steamer tray, white, green and pink, crescent shapes with pleated edges, seen from above at an angle, centered, food icon, pixel art' },
  { key: 'songpyeon_i', w: 96, h: 96, noBg: true, prompt: 'a single Korean songpyeon glowing softly like a small moon, white crescent dumpling with a pinched seam, tiny sparkle, centered, festive icon, pixel art' },
  { key: 'banner_c', w: 384, h: 128, noBg: false, prompt: 'wide banner background of a traditional Korean hanok courtyard at night, a huge golden full moon low in the sky, a persimmon tree with orange fruits on the left, stone wall, warm lantern light from a paper window, deep blue night, fully filled edge-to-edge composition, no text, no people, pixel art' },
  { key: 'banner_d', w: 384, h: 128, noBg: false, prompt: 'wide banner background, silhouettes of women in hanbok holding hands dancing in a circle (ganggangsullae) on a hill under a giant full moon, dark navy sky with stars, moonlit grass, fully filled edge-to-edge composition, no text, pixel art' },
  { key: 'banner_e', w: 384, h: 128, noBg: false, prompt: 'wide banner background, autumn field of silver grass and golden rice ears swaying at dusk, a large pale gold full moon rising over distant mountains, dragonflies, warm orange to violet gradient sky, fully filled edge-to-edge composition, no text, pixel art' },
  { key: 'banner_f', w: 384, h: 128, noBg: false, prompt: 'wide banner background, night sky with a bright full moon behind thin clouds, a row of red and blue Korean paper lanterns hanging on a string across the top, wooden pavilion railing at the bottom, festive and cozy, fully filled edge-to-edge composition, no text, pixel art' },
  { key: 'banner_a', w: 384, h: 128, noBg: false, prompt: 'wide night sky banner background, a large glowing golden full moon at the right, soft clouds, a few small stars, a dark indigo to deep crimson gradient sky, faint silhouette of a traditional Korean tiled roof at the bottom left, warm festive Chuseok mood, fully filled edge-to-edge composition, no text, no characters, pixel art' },
  { key: 'banner_b', w: 384, h: 128, noBg: false, prompt: 'wide banner background, deep navy night sky with a bright golden full moon at the upper right and a small white rabbit silhouette sitting below it, scattered pale pink petals drifting, a plate of white half-moon rice cakes glowing softly at the bottom right, dark red silk cloth at the bottom, warm festive mood, fully filled edge-to-edge composition, no text, pixel art' },
];
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gen(j: Job): Promise<'ok' | 'skip' | 'fail'> {
  const file = join(OUT, `${j.key}.png`);
  if (existsSync(file)) return 'skip';
  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response;
    try {
      res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ description: j.prompt, image_size: { width: j.w, height: j.h }, no_background: j.noBg }),
      });
    } catch (e) { console.error(`  ${j.key} 네트워크: ${(e as Error).message}`); await sleep(2000 * 2 ** attempt); continue; }
    if (res.status === 429) { await sleep(3000 * 2 ** attempt); continue; }
    if (!res.ok) { console.error(`  ${j.key} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); return 'fail'; }
    const b64 = ((await res.json()) as { image?: { base64?: string } }).image?.base64;
    if (!b64) return 'fail';
    const raw = Buffer.from(b64, 'base64');
    if (raw.length < 8 || raw[0] !== 0x89 || raw[1] !== 0x50) return 'fail';
    writeFileSync(file, raw);
    return 'ok';
  }
  return 'fail';
}

console.log(`한가위 UI 그림 ${JOBS.length}종 — pixflux(key3)`);
let ok = 0, skip = 0, fail = 0;
for (const j of JOBS) {
  if (only && !only.includes(j.key)) continue;
  const r = await gen(j);
  console.log(`  ${r === 'ok' ? '✓' : r === 'skip' ? '·' : '✗'} ${j.key} ${j.w}×${j.h}`);
  if (r === 'ok') ok++; else if (r === 'skip') skip++; else fail++;
  await sleep(1500);
}
console.log(`완료 — 생성 ${ok} · 스킵 ${skip} · 실패 ${fail}`);
