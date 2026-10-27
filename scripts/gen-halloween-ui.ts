/**
 * 할로윈 이벤트 UI 그림 — Pixellab pixflux(key3). 홈 배너 배경 2종(대회 기본 · 사탕 보상 있을 때), 추석(gen-chuseok-ui.ts)과 같은 규격 384×128.
 *   실행: GEN_KEY=3 bun run scripts/gen-halloween-ui.ts [--only=a,b]   결과: public/sprites/halloween-ui/*.png (있으면 건너뜀, 유료)
 * 왼쪽은 검은 그라데이션 위에 글자가 얹히므로 주요 피사체는 오른쪽·아래에 둔다.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { scriptKeyFor, scriptKeyLabel } from './pixellab-script-key';

config({ path: '.env.local' });
const OUT = join(process.cwd(), 'public', 'sprites', 'halloween-ui');
const { key: KEY, envName } = scriptKeyFor(scriptKeyLabel('key3'));
if (!KEY) throw new Error(`${envName} 없음`);

type Job = { key: string; w: number; h: number; prompt: string };
const JOBS: Job[] = [
  // 1차(10-27): 대회 기본 배경 — 호박밭 밤 풍경, 사탕 배경 — 사탕이 쏟아진 탁자.
  { key: 'banner_contest_a', w: 384, h: 128, prompt: 'wide banner background, a Halloween night pumpkin patch, several carved jack-o-lanterns glowing warm orange among dark vines on the right and bottom, a huge pale yellow full moon in a deep purple-indigo starry sky, a few small bats flying across the moon, a dark gothic mansion silhouette with lit windows far in the background, thin wisps of fog along the ground, fully filled edge-to-edge composition, no text, no people, pixel art' },
  { key: 'banner_candy_a', w: 384, h: 128, prompt: 'wide banner background, a close-up of a dark wooden table covered with colorful wrapped candies, swirl lollipops and candy corn spilling out of a tipped-over carved jack-o-lantern bucket on the right, warm candle glow, a dark purple night window with a crescent moon and a tiny bat at the back left, cozy and festive Halloween mood, fully filled edge-to-edge composition, no text, no people, pixel art' },
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
        body: JSON.stringify({ description: j.prompt, image_size: { width: j.w, height: j.h }, no_background: false }),
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

console.log(`할로윈 UI 그림 ${JOBS.length}종 — pixflux(key3)`);
let ok = 0, skip = 0, fail = 0;
for (const j of JOBS) {
  if (only && !only.includes(j.key)) continue;
  const r = await gen(j);
  console.log(`  ${r === 'ok' ? '✓' : r === 'skip' ? '·' : '✗'} ${j.key} ${j.w}×${j.h}`);
  if (r === 'ok') ok++; else if (r === 'skip') skip++; else fail++;
  await sleep(1500);
}
console.log(`완료 — 생성 ${ok} · 스킵 ${skip} · 실패 ${fail}`);
