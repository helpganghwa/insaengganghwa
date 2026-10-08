/**
 * 월드보스 그림·배경 생성(Pixellab v2 REST, PIXELLAB_API_KEY_2) — docs/WORLD-BOSS.md §9, 컨셉 '부서진 칼날의 거신'(2026-10-08 사용자 선택).
 *   bun --env-file=.env.local scripts/gen-world-boss-art.ts [--only=boss,bg|r2] [--tag=r1] [--force]
 * 산출: scripts/world-boss-art/out/<tag>/<key>/<i>.png + manifest.json(재개형). 무한의 탑과 같은 방식 —
 *   보스 = 고급(generate-image-v2) + 기준 그림(레이드 슬라임 왕: 윤곽·세밀도·음영만, 색은 따르지 않음) 160px 한 번에 4장, 두 번.
 *   배경 = 고급 400×240 1장, 두 번. 주문문은 외형만(감각·서사 금지), 고급스러움 우선, 원색 지양.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const KEY = process.env.PIXELLAB_API_KEY_2;
if (!KEY) throw new Error('PIXELLAB_API_KEY_2 없음');
const API = 'https://api.pixellab.ai/v2';
const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only='))?.slice(7) ?? 'boss,bg').split(',');
const tag = args.find((a) => a.startsWith('--tag='))?.slice(6) ?? 'r1';
const force = args.includes('--force');

const BOSS =
  'colossal humanoid giant built from countless shattered swords, broken spear shafts and cracked shield plates fused together, glowing molten orange seams between the metal pieces, a fan of broken blades rising from its back like wings, a cracked great helm with two glowing eyes, dark steel and tarnished gold with warm ember light';
const STYLE_BOSS =
  'fearsome imposing boss monster, massive heavy build, glowing eyes, dramatic powerful silhouette, menacing stance, sturdy legs, detailed pixel art rendering with rich texture and shading, not gory, all-ages';
const STYLE_MON = 'pixel art game monster sprite, full body, three-quarter view facing right, clean readable silhouette, refined elegant detailed pixel art, muted desaturated colors, no text';
const PAL = 'muted desaturated palette of dark steel grey, tarnished gold and dim ember orange';
const BG =
  'a vast desolate battlefield plain at dusk, countless broken swords and spears stuck upright in the cracked ground, scattered cracked shields and helmets, faint ember glow rising from fissures in the earth, ruined stone forge chimneys in the distance, heavy smoky clouds with a dim amber light low on the horizon';
const STYLE_BG =
  'symmetrical composition, centered front view, pixel art game background scene, refined elegant detailed pixel art, no characters, no creatures, no text, fully filled background edge to edge, full bleed, no white or grey borders, no side margins, no vignette, no fade at the edges, scene continues to the left and right edges';

const outDir = join('scripts/world-boss-art/out', tag);
mkdirSync(outDir, { recursive: true });
const manPath = join(outDir, 'manifest.json');
const manifest: Record<string, { kind: string; prompt: string; files: string[] }> = existsSync(manPath) ? JSON.parse(readFileSync(manPath, 'utf8')) : {};
const save = () => writeFileSync(manPath, JSON.stringify(manifest, null, 1));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function call(path: string, body: unknown): Promise<any> {
  for (let i = 0; ; i++) {
    const r = await fetch(API + path, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 429 && i < 6) { await sleep(Math.min(30_000, 2_000 * 2 ** i)); continue; }
    const t = await r.text();
    if (!r.ok) throw new Error(`${path} ${r.status} ${t.slice(0, 300)}`);
    return JSON.parse(t);
  }
}
async function poll(jobId: string): Promise<any> {
  for (let i = 0; i < 120; i++) {
    await sleep(6_000);
    const r = await fetch(`${API}/background-jobs/${jobId}`, { headers: { Authorization: `Bearer ${KEY}` } });
    if (!r.ok) continue;
    const j = await r.json();
    if (j.status === 'completed') return j.last_response;
    if (j.status === 'failed') throw new Error(`job failed ${JSON.stringify(j.last_response).slice(0, 200)}`);
  }
  throw new Error('poll timeout');
}
const images = (resp: any): string[] => (resp?.images ?? (resp?.image ? [resp.image] : [])).map((x: any) => x?.base64 ?? x).filter((b: unknown): b is string => typeof b === 'string');
const STYLE_REF = readFileSync('public/sprites/boss/slime_king.png').toString('base64');
async function pro(key: string, prompt: string, w: number, h: number, noBg: boolean, styled: boolean) {
  if (!force && manifest[key]?.files?.length) return console.log(`- ${key} 이미 있음`);
  const body: Record<string, unknown> = { description: prompt, image_size: { width: w, height: h }, no_background: noBg };
  if (styled) {
    body.style_image = { image: { type: 'base64', base64: STYLE_REF, format: 'png' }, size: { width: 128, height: 128 } };
    body.style_options = { color_palette: false, outline: true, detail: true, shading: true };
  }
  const r = await call('/generate-image-v2', body);
  const imgs = images(await poll(r.background_job_id ?? r.id));
  const dir = join(outDir, key);
  mkdirSync(dir, { recursive: true });
  const files = imgs.map((b, i) => { const f = join(dir, `${i}.png`); writeFileSync(f, Buffer.from(b, 'base64')); return f; });
  manifest[key] = { kind: styled ? 'pro+style' : 'pro', prompt, files };
  save();
  console.log(`✓ ${key} ${files.length}장`);
}
// 2차(10-08 사용자): 정면·비인간형·더 웅장하고 강해 보이게, 컨셉별 1장씩(256px — 한 번에 한 장).
const STYLE_FRONT =
  'pixel art game boss sprite, full body, perfectly symmetrical front view facing the viewer, centered, colossal scale, majestic and overwhelming presence, clean readable silhouette, refined elegant detailed pixel art, muted desaturated colors, no text';
const R2: Record<string, string> = {
  beast:
    'colossal four-legged behemoth beast made of countless shattered swords and broken armor plates, a glowing molten core heart visible in its chest, a great mane and crown of broken blades, massive horns formed from fused greatswords, heavy clawed forelegs planted wide, glowing ember eyes',
  core:
    'enormous floating sphere of molten metal with a blazing ember core, surrounded by several slowly orbiting rings of broken swords and spear tips, shattered shield fragments drifting around it, a single great glowing eye in the center of the core, heat shimmer',
  beetle:
    'gigantic armored beetle colossus with a massive horn made of fused greatswords, layered carapace of broken blades and cracked shield plates, glowing molten orange seams between the plates, six heavy legs planted wide, glowing ember eyes',
};
const tasks: Promise<void>[] = [];
// 3차(10-08 사용자 선택): 황금 사자 거상 — 정면·네 발, 대리석·청동 바탕에 금 상감(왕국 황금 그리폰과 색 겹침 피함).
const R3: Record<string, string> = {
  marble:
    'colossal awakened lion statue standing on four legs, body of pale white marble with fine gold inlay patterns, a great flowing mane carved from marble edged with gold, glowing amber eyes, faint cracks of golden light across the stone, an ancient stone pedestal fragment under its paws',
  bronze:
    'colossal majestic lion guardian standing on four legs, body of dark aged bronze with polished gold trim, a huge radiant mane shaped like a sunburst halo of gold, a small gemstone crown on its brow, glowing eyes, heavy armored paws',
  temple:
    'ancient colossal temple guardian lion standing on four legs, weathered grey stone body overgrown with a little moss, deep cracks glowing with molten gold light, a heavy carved mane with gold ornaments, glowing golden eyes, stone collar with a large round gold medallion',
};
const PAL3 = 'muted refined palette of ivory marble, aged bronze and warm gold, elegant and luxurious';
if (only.includes('r3')) for (const [k, d] of Object.entries(R3)) tasks.push(pro(`r3-${k}`, `${d}, ${STYLE_BOSS.replace('sturdy legs, ', '')}, ${PAL3}, ${STYLE_FRONT}`, 256, 256, true, true));
// 4차(10-08 사용자 선택): 별을 두른 신수(성운의 사슴왕) — 근엄·웅장, 몬스터와 배경 따로. 보라(부유섬)는 피한다.
const STYLE_SOLEMN =
  'majestic solemn divine beast, dignified calm noble gaze, sacred and awe-inspiring presence, grand imposing scale, glowing eyes, detailed pixel art rendering with rich texture and shading, all-ages';
const R4: Record<string, string> = {
  stag:
    'colossal celestial stag king standing on four legs, enormous branching antlers shaped like constellations with glowing star points at the tips, a flowing mane of soft nebula mist and stardust, body of deep midnight blue fur with fine silver starlight patterns, pale gold ornaments on its brow and chest, crystal hooves',
  crowned:
    'colossal sacred stag king standing on four legs, towering crown-like antlers of pale gold and silver with small floating stars between the branches, a radiant ring of starlight behind its head like a halo, long mane flowing like the milky way, deep navy and silver body with constellation markings',
};
const PAL4 = 'refined palette of deep navy, silver starlight and pale gold, elegant and luxurious, no purple';
const BG4 =
  'a vast ancient sky sanctuary on a high plateau at night, a great ring of tall weathered standing stones, a sea of clouds far below, an immense starry night sky with bright constellations and a soft pale aurora, a plain round stone altar in the center, distant mountain peaks above the clouds';
if (only.includes('r4')) {
  for (const [k, d] of Object.entries(R4)) tasks.push(pro(`r4-${k}`, `${d}, ${STYLE_SOLEMN}, ${PAL4}, ${STYLE_FRONT}`, 256, 256, true, true));
  tasks.push(pro('r4-bg', `${BG4}, ${PAL4}, ${STYLE_BG}`, 400, 240, false, false));
}
// 5차(10-08): 정면 네발짐승은 뒷다리가 앞다리 사이로 겹쳐 다리가 많아 보였다(사용자). 선 자세는 다리 수를 못박고, 엎드린 자세를 함께.
const STAG_BODY =
  'colossal celestial stag king, enormous branching antlers shaped like constellations with glowing star points at the tips, a flowing mane of soft nebula mist and stardust, body of deep midnight blue fur with fine silver starlight patterns, pale gold crown ornament on its brow and a pale gold breastplate ornament on its chest';
const R5: Record<string, string> = {
  standing: `${STAG_BODY}, standing still facing the viewer, exactly four legs in total, only the two front legs visible straight and parallel under the chest, the two hind legs hidden behind the body, crystal hooves`,
  resting: `${STAG_BODY}, lying down calmly like a guardian sphinx facing the viewer, both front legs folded neatly in front of its chest, body resting on the ground behind, head held high, no other legs visible`,
};
if (only.includes('r5')) for (const [k, d] of Object.entries(R5)) tasks.push(pro(`r5-${k}`, `${d}, ${STYLE_SOLEMN}, ${PAL4}, ${STYLE_FRONT}`, 256, 256, true, true));
if (only.includes('r2')) for (const [k, d] of Object.entries(R2)) tasks.push(pro(`r2-${k}`, `${d}, ${STYLE_BOSS.replace('sturdy legs, ', '')}, ${PAL}, ${STYLE_FRONT}`, 256, 256, true, true));
if (only.includes('boss')) for (const k of ['boss-a', 'boss-b']) tasks.push(pro(k, `${BOSS}, ${STYLE_BOSS}, ${PAL}, ${STYLE_MON}`, 160, 160, true, true));
if (only.includes('bg')) for (const k of ['bg-a', 'bg-b']) tasks.push(pro(k, `${BG}, ${PAL}, ${STYLE_BG}`, 400, 240, false, false));
const res = await Promise.allSettled(tasks);
for (const r of res) if (r.status === 'rejected') console.error('실패:', (r.reason as Error).message);
console.log('완료', outDir);
