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

type Job = { key: string; w: number; h: number; noBg: boolean; prompt: string; mode?: 'pixflux' | 'object' };
const OBJ_TAIL = ', a beautiful clean fantasy anime RPG gacha-game food item, bright and glossy, a single isolated object on a plain flat empty background, large, pixel art';
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
  // 3차(사용자 "다 별로야"): 송편은 객체 생성으로 전환(아이템 후보 파이프라인, 송편 꼬치 창의 송편이 좋았음), 배너는 달토끼+송편 3안
  { key: 'sp_obj_a', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'a single plump Korean songpyeon rice cake, a half-moon shaped dumpling with a crimped curved seam, smooth white dough with soft highlights' + OBJ_TAIL },
  { key: 'sp_obj_b', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'a single plump pale mugwort-green Korean songpyeon half-moon rice cake resting on two green pine needles, crimped curved seam' + OBJ_TAIL },
  { key: 'sp_obj_c', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'a single plump pink Korean songpyeon half-moon rice cake with a crimped seam and a tiny sesame seed' + OBJ_TAIL },
  { key: 'sp_obj_d', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'three plump Korean songpyeon half-moon rice cakes in white, pale green and pink arranged on a small round white dish' + OBJ_TAIL },
  { key: 'sp_obj_e', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'five Korean songpyeon half-moon rice cakes in white and pale green on a round bamboo steamer tray with a few pine needles' + OBJ_TAIL },
  { key: 'sp_obj_f', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'two plump Korean songpyeon half-moon rice cakes leaning on each other, one white and one pink, crimped seams, glossy' + OBJ_TAIL },
  { key: 'banner_g', w: 384, h: 128, noBg: false, prompt: 'wide banner background, a huge golden full moon filling the right side with a white rabbit pounding rice cake with a wooden pestle inside the moon as a silhouette, dark indigo night sky with stars on the left, a small plate of white half-moon rice cakes glowing on a wooden table at the bottom, fully filled edge-to-edge composition, no text, pixel art' },
  { key: 'banner_h', w: 384, h: 128, noBg: false, prompt: 'wide banner background, a white rabbit sitting on a grassy hill gazing up at a bright full moon, night sky with drifting pink petals, a round plate piled with white and green half-moon rice cakes in the foreground at the bottom right, soft moonlight, fully filled edge-to-edge composition, no text, pixel art' },
  { key: 'banner_i', w: 384, h: 128, noBg: false, prompt: 'wide banner background, cozy close-up of a wooden table with a plate of white, green and pink half-moon rice cakes and a small teacup, a white rabbit peeking from behind the plate, a round paper window behind showing the full moon and night sky, warm lamp glow, fully filled edge-to-edge composition, no text, pixel art' },
  // 4차(사용자): 송편은 주름 없는 매끈한 흰 반달, 배너는 '달 속 절구 토끼' 컨셉에서 접시 위 송편을 송편답게
  { key: 'sp_obj_g', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'a single smooth plump white Korean songpyeon rice cake, a clean half-moon crescent shape with a smooth rounded surface and no pleats or seams, soft matte white with gentle shading and one small highlight' + OBJ_TAIL },
  { key: 'sp_obj_h', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'a single smooth white half-moon Korean songpyeon rice cake without any pleats, resting on two thin green pine needles, soft rounded surface, subtle shading' + OBJ_TAIL },
  { key: 'sp_obj_i', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'two smooth white half-moon Korean songpyeon rice cakes side by side, no pleats, plump rounded surfaces, soft shading' + OBJ_TAIL },
  { key: 'sp_obj_j', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'a small round white dish holding three smooth white half-moon Korean songpyeon rice cakes without pleats, plump and rounded, a sprig of pine needles' + OBJ_TAIL },
  { key: 'banner_j', w: 384, h: 128, noBg: false, prompt: 'wide banner background, a huge golden full moon on the right with the silhouette of a rabbit pounding rice cake with a pestle inside it, dark indigo starry sky on the left, at the bottom center a wooden table with a small white dish holding three large plump smooth white crescent half-moon shaped rice cakes (songpyeon), the rice cakes clearly half-moon shaped like little white crescents, fully filled edge-to-edge composition, no text, pixel art' },
  { key: 'banner_k', w: 384, h: 128, noBg: false, prompt: 'wide banner background, night sky with a big golden full moon showing a rabbit-and-pestle silhouette at the upper right, in the foreground bottom left a close-up wooden tray with several smooth white half-moon crescent dumplings (Korean songpyeon) piled neatly, each clearly a white crescent shape, warm lantern glow, fully filled edge-to-edge composition, no text, pixel art' },
  { key: 'banner_base', w: 384, h: 128, noBg: false, prompt: 'wide banner background, a huge golden full moon on the right with the silhouette of a rabbit pounding rice cake with a pestle inside it, dark indigo starry sky, a plain empty wooden table surface across the bottom with nothing on it, fully filled edge-to-edge composition, no text, no food, pixel art' },
  // 5차(사용자): 흰 송편 하나는 초록 없이 / 두 개는 흰+분홍 또는 흰+초록
  { key: 'sp_obj_k', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'a single smooth plump pure white Korean songpyeon rice cake, a clean half-moon crescent shape with a smooth rounded surface and no pleats, soft matte white with gentle shading and one small highlight, nothing else' + OBJ_TAIL },
  { key: 'sp_obj_l', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'two smooth plump half-moon Korean songpyeon rice cakes side by side, one pure white and one soft pink, no pleats, rounded surfaces, soft shading' + OBJ_TAIL },
  { key: 'sp_obj_m', w: 128, h: 128, noBg: true, mode: 'object', prompt: 'two smooth plump half-moon Korean songpyeon rice cakes side by side, one pure white and one pale mugwort green, no pleats, rounded surfaces, soft shading' + OBJ_TAIL },
  { key: 'banner_a', w: 384, h: 128, noBg: false, prompt: 'wide night sky banner background, a large glowing golden full moon at the right, soft clouds, a few small stars, a dark indigo to deep crimson gradient sky, faint silhouette of a traditional Korean tiled roof at the bottom left, warm festive Chuseok mood, fully filled edge-to-edge composition, no text, no characters, pixel art' },
  { key: 'banner_b', w: 384, h: 128, noBg: false, prompt: 'wide banner background, deep navy night sky with a bright golden full moon at the upper right and a small white rabbit silhouette sitting below it, scattered pale pink petals drifting, a plate of white half-moon rice cakes glowing softly at the bottom right, dark red silk cloth at the bottom, warm festive mood, fully filled edge-to-edge composition, no text, pixel art' },
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
      writeFileSync(file, buf); return 'ok';
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
