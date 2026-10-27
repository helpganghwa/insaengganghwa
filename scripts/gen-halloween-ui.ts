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

type Job = { key: string; w: number; h: number; prompt: string; noBg?: boolean; mode?: 'pixflux' | 'object' };
const OBJ_TAIL = ', a beautiful clean fantasy anime RPG gacha-game item icon, bright and glossy, bold clean outline, a single isolated object on a plain flat empty background, large, pixel art';
const JOBS: Job[] = [
  // 1차(10-27): 대회 기본 배경 — 호박밭 밤 풍경, 사탕 배경 — 사탕이 쏟아진 탁자.
  { key: 'banner_contest_a', w: 384, h: 128, prompt: 'wide banner background, a Halloween night pumpkin patch, several carved jack-o-lanterns glowing warm orange among dark vines on the right and bottom, a huge pale yellow full moon in a deep purple-indigo starry sky, a few small bats flying across the moon, a dark gothic mansion silhouette with lit windows far in the background, thin wisps of fog along the ground, fully filled edge-to-edge composition, no text, no people, pixel art' },
  { key: 'banner_candy_a', w: 384, h: 128, prompt: 'wide banner background, a close-up of a dark wooden table covered with colorful wrapped candies, swirl lollipops and candy corn spilling out of a tipped-over carved jack-o-lantern bucket on the right, warm candle glow, a dark purple night window with a crescent moon and a tiny bat at the back left, cozy and festive Halloween mood, fully filled edge-to-edge composition, no text, no people, pixel art' },
  // 2차(10-27 사용자): B는 품질을 높여 "호박 바구니에 넘치듯 담긴 사탕"으로 다시. 피사체는 오른쪽.
  { key: 'banner_candy_b', w: 384, h: 128, prompt: 'wide banner background, a large carved jack-o-lantern bucket on the right overflowing with a mountain of colorful wrapped candies, swirl lollipops and candy corn spilling over its rim and tumbling onto a dark wooden table, warm orange candle glow on the candies, a deep purple night with a crescent moon and tiny bats on the left, rich detail, crisp highlights, cozy festive Halloween mood, fully filled edge-to-edge composition, no text, no people, pixel art' },
  { key: 'banner_candy_c', w: 384, h: 128, prompt: 'wide banner background, close-up of a grinning jack-o-lantern pumpkin bucket heaped high with glossy candies in orange, purple, green and white wrappers, lollipops and candy canes sticking out of the pile, candies spilling down the front onto a wooden table, soft magical sparkles, a dark violet starry sky behind, the bucket on the right side, left side dark and empty, fully filled edge-to-edge composition, no text, no people, pixel art' },
  { key: 'banner_candy_d', w: 384, h: 128, prompt: 'wide banner background, a plump orange jack-o-lantern basket with a curved handle sitting on a stone windowsill at night, piled so full of colorful wrapped candies that they overflow and cascade down the side, a bright full moon and purple sky outside the window on the left, warm glow from inside the pumpkin lighting the candies, detailed and glossy, fully filled edge-to-edge composition, no text, no people, pixel art' },
  // 사탕 아이콘(10-27 사용자): 도달 보상 화면의 사탕 수 옆 16~28px 아이콘 — 추석 송편(128 투명, 객체 생성)과 같은 규격. 작게 보여도 읽히게 단순·굵은 실루엣.
  { key: 'candy_obj_a', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'a single round orange hard candy in a glossy clear twist wrapper with purple stripes, the wrapper twisted into little fans at both ends, front view' + OBJ_TAIL },
  { key: 'candy_obj_b', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'a single wrapped candy with an orange and black striped wrapper twisted at both ends, plump round body, glossy highlight, front view' + OBJ_TAIL },
  { key: 'candy_obj_c', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'a single purple swirl lollipop on a short white stick, a glossy round disc with a white and purple spiral, a tiny orange bow at the stick, front view' + OBJ_TAIL },
  { key: 'candy_px_a', w: 96, h: 96, noBg: true, prompt: 'a single wrapped hard candy, round orange body with a purple stripe, clear wrapper twisted at both ends, glossy, bold clean outline, centered, cute item icon, pixel art' },
  { key: 'candy_px_b', w: 96, h: 96, noBg: true, prompt: 'three wrapped candies in orange, purple and green wrappers piled together, twisted wrapper ends, glossy, bold clean outline, centered, cute item icon, pixel art' },
  { key: 'candy_px_c', w: 96, h: 96, noBg: true, prompt: 'a single piece of candy corn, a small triangle with yellow, orange and white bands, glossy, bold clean outline, centered, cute item icon, pixel art' },
];
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',').filter(Boolean);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pickUrl = (v: unknown): string | null => { if (!v) return null; if (typeof v === 'string') return v; if (Array.isArray(v)) { for (const x of v) { const u = pickUrl(x); if (u) return u; } return null; } if (typeof v === 'object') { for (const x of Object.values(v as Record<string, unknown>)) { const u = pickUrl(x); if (u) return u; } } return null; };
async function genObject(j: Job, file: string): Promise<'ok' | 'fail'> {
  let objectId = '';
  for (let attempt = 0; attempt < 5 && !objectId; attempt++) {
    let res: Response;
    try {
      res = await fetch('https://api.pixellab.ai/v2/create-1-direction-object', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` }, body: JSON.stringify({ description: j.prompt, size: j.w, view: 'sidescroller' }) });
    } catch (e) { console.error(`  ${j.key} 네트워크: ${(e as Error).message}`); await sleep(2000 * 2 ** attempt); continue; }
    if (res.status === 429) { await sleep(3000 * 2 ** attempt); continue; }
    if (!res.ok) { console.error(`  ${j.key} create HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); return 'fail'; }
    objectId = ((await res.json()) as { object_id?: string }).object_id ?? '';
  }
  if (!objectId) return 'fail';
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    let g: Response; try { g = await fetch(`https://api.pixellab.ai/v2/objects/${objectId}`, { headers: { authorization: `Bearer ${KEY}` } }); } catch { continue; }
    if (!g.ok) continue;
    const gj = (await g.json()) as { status?: string; rotation_urls?: unknown; frame_urls?: unknown; storage_urls?: unknown };
    if (gj.status === 'completed' || gj.status === 'review') {
      const url = pickUrl(gj.rotation_urls) ?? pickUrl(gj.frame_urls) ?? pickUrl(gj.storage_urls); if (!url) return 'fail';
      let buf: Buffer | null = null; for (let d = 0; d < 4 && !buf; d++) { try { buf = Buffer.from(await (await fetch(url)).arrayBuffer()); } catch { await sleep(1500 * 2 ** d); } }
      if (!buf || buf.length < 8 || buf[0] !== 0x89 || buf[1] !== 0x50) return 'fail';
      writeFileSync(file, buf); console.log(`    객체 ${j.key} = ${objectId}`); return 'ok';
    }
    if (gj.status === 'failed') return 'fail';
  }
  console.error(`  ${j.key} 폴링 타임아웃(객체 id: ${objectId})`); return 'fail';
}
async function gen(j: Job): Promise<'ok' | 'skip' | 'fail'> {
  const file = join(OUT, `${j.key}.png`);
  if (existsSync(file)) return 'skip';
  if (j.mode === 'object') return genObject(j, file);
  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response;
    try {
      res = await fetch('https://api.pixellab.ai/v1/generate-image-pixflux', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ description: j.prompt, image_size: { width: j.w, height: j.h }, no_background: !!j.noBg }),
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
