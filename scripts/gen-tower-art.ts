/**
 * 무한의 탑 몬스터·구간 배경 생성(Pixellab v2 REST, PIXELLAB_API_KEY_2) — docs/TOWER.md §9 제작 계획.
 *   bun --env-file=.env.local scripts/gen-tower-art.ts <구간번호 1~10> [--only=bg,mons] [--force]
 * 산출: scripts/tower-art/out/v3/sec<NN>/<key>/<i>.png(후보) + manifest.json. 이미 있으면 건너뛴다(재개형, --force로 다시).
 * 비용(호출 한 번 ≈ 26 gen, 크기에 따라 한 번에 나오는 장수만 다르다): 배경 = 고급(generate-image-v2) 400×240 1장,
 *   몬스터 = 고급 + 기준 그림(style_image = 레이드 슬라임 왕, 윤곽·세밀도·음영만 따르고 색은 구간 팔레트) 128px(수문장 160px) 한 번에 4장.
 * 주문문은 외형만(감각·서사 금지), 고급스러움 우선, 원색 지양 — 구간 팔레트를 말로 덧붙인다.
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const KEY = process.env.PIXELLAB_API_KEY_2;
if (!KEY) throw new Error('PIXELLAB_API_KEY_2 없음');
const API = 'https://api.pixellab.ai/v2';
const args = process.argv.slice(2);
const sec = Number(args[0]);
const only = (args.find((a) => a.startsWith('--only='))?.slice(7) ?? 'bg,mons').split(',');
const force = args.includes('--force');
// 특정 층만(--floors=1,4) · 결과 키 꼬리표(--tag=r2 → f1-r2, 다시 만들기 회차를 따로 보관).
const floorsArg = args.find((a) => a.startsWith('--floors='))?.slice(9);
const onlyFloors = floorsArg ? new Set(floorsArg.split(',').map(Number)) : null;
const tag = args.find((a) => a.startsWith('--tag='))?.slice(6) ?? '';
// 동시에 만들 몬스터 수(--lanes=4). 429는 call()이 물러났다 다시 시도한다.
const lanes = Math.max(1, Math.min(6, Number(args.find((a) => a.startsWith('--lanes='))?.slice(8) ?? 4)));

type Mon = { floor: number; name: string; desc: string; art: string; guardian: boolean };
type Sec = { theme: string; palette: string[]; mons: Mon[] };
const data = JSON.parse(readFileSync('scripts/tower-art/monsters.json', 'utf8')) as Sec[];
const S = data[sec - 1];
if (!S) throw new Error('구간 번호 1~10');

// 구간별 배경 주문문(외형만) — 1단계 테마 설정의 재질·색.
const BG: Record<number, string> = {
  1: 'interior of an ancient grey stone corridor inside a great tower, weathered stone walls and worn flagstone floor, arched stone ceiling, rows of rusted iron candle holders with hardened dripping wax and small warm candle flames, faded tattered grey banners on the walls, soft dust in the air',
  2: 'interior of an old tower library hall covered in frost, tall wooden bookshelves with frosted old books, thin ice on the stone floor, frozen reading desks, pale cold light from a high arched window, scattered faded paper',
  3: 'interior of an old blacksmith forge inside a tower, cooling furnaces with dim embers, anvils and hanging iron tools, rust and soot on stone walls, faint orange glow, worn stone floor',
  4: 'interior of a ruined glass greenhouse garden inside a tower, broken glass panes in iron frames, overgrown moss and dry vines, pale white flowers, soft mist over mossy stone paths',
  5: 'open stone terrace high on a tower under an overcast sky, stone balustrade, drifting clouds and wind-blown banners, pale grey lilac sky, worn flagstones',
  6: 'interior of an old observatory room at the top of a tower, large brass telescope and armillary instruments, star charts on the walls, open dome showing a deep navy starry sky',
  7: 'interior of a faded royal throne hall inside a tower, ivory marble floor, tall pillars with peeling gold leaf, faded red curtains, dim chandeliers',
  8: 'interior of a sunken temple inside a tower half flooded with murky teal water, broken stone pillars with faded coral growing on them, shafts of dim light through the water surface',
  9: 'interior of a stopped clock tower, huge bronze gears and clock mechanisms, a giant clock face seen from behind, dust in the air, wooden beams and stone walls',
  10: 'sanctuary above the clouds at the top of a tower, white marble floor and pillars, pale gold ornaments, soft sunlight, sea of clouds below and bright sky',
};
const PALETTE_WORDS: Record<number, string> = {
  1: 'muted desaturated palette of warm grey, taupe and dim amber candlelight',
  2: 'muted desaturated palette of frosty blue grey and faded paper beige',
  3: 'muted desaturated palette of soot black, rust brown and dim ember orange',
  4: 'muted desaturated palette of moss green, dry vine brown and misty white',
  5: 'muted desaturated palette of overcast grey and pale ash lilac',
  6: 'muted desaturated palette of deep navy and faded brass',
  7: 'muted desaturated palette of ivory, faded gold and dull crimson',
  8: 'muted desaturated palette of murky teal and faded coral',
  9: 'muted desaturated palette of aged bronze, dusty brown and warm grey',
  10: 'muted palette of pearl white, pale gold and soft sky blue',
};
const STYLE_MON =
  'pixel art game monster sprite, full body, three-quarter view facing right, clean readable silhouette, refined elegant detailed pixel art, muted desaturated colors, no text';
// 전체이용가 톤(09-30 1구간 검수): 사실적인 동물 그림은 징그럽고, 너무 단순하게 하면 디테일이 죽는다 —
// 디테일(질감·음영)은 기준 그림 그대로, 비율·표정만 판타지 게임 몬스터처럼 살짝 과장해 덜 사실적으로.
const STYLE_FRIENDLY =
  'fantasy game monster, slightly stylized and exaggerated proportions, expressive eyes, detailed pixel art rendering with rich texture and shading, not photorealistic, not creepy, all-ages';
// 다리 달린 몬스터만 — 뱀 등에 붙이면 다리가 생긴다(09-30 6층 돌비늘 뱀).
const STURDY_LEGS = 'sturdy legs instead of thin spindly legs';
const STYLE_BG = 'symmetrical composition, centered front view, pixel art game background scene, refined elegant detailed pixel art, no characters, no creatures, no text, fully filled background edge to edge, full bleed, no white borders, no vignette, no fade to white at the edges';

const outDir = join('scripts/tower-art/out/v3', `sec${String(sec).padStart(2, '0')}`);
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
function images(resp: any): string[] {
  const list = resp?.images ?? (resp?.image ? [resp.image] : []);
  return list.map((x: any) => x?.base64 ?? x).filter((b: unknown): b is string => typeof b === 'string');
}
function write(key: string, kind: string, prompt: string, b64s: string[]) {
  const dir = join(outDir, key);
  mkdirSync(dir, { recursive: true });
  const files = b64s.map((b, i) => {
    const f = join(dir, `${i}.png`);
    writeFileSync(f, Buffer.from(b, 'base64'));
    return f;
  });
  manifest[key] = { kind, prompt, files };
  save();
  console.log(`✓ ${key} ${kind} ${files.length}장`);
}
const done = (key: string) => !force && manifest[key]?.files?.length;

// 몬스터 그림체 기준 — 레이드 슬라임 왕(사용자 선택 09-30). 색은 따르지 않는다(구간 팔레트).
const STYLE_REF = readFileSync('public/sprites/boss/slime_king.png').toString('base64');
async function pro(key: string, prompt: string, w: number, h: number, noBg: boolean, styled = false) {
  if (done(key)) return console.log(`- ${key} 이미 있음`);
  const body: Record<string, unknown> = { description: prompt, image_size: { width: w, height: h }, no_background: noBg };
  if (styled) {
    body.style_image = { image: { type: 'base64', base64: STYLE_REF, format: 'png' }, size: { width: 128, height: 128 } };
    body.style_options = { color_palette: false, outline: true, detail: true, shading: true };
  }
  const r = await call('/generate-image-v2', body);
  const id = r.background_job_id ?? r.id;
  write(key, styled ? 'pro+style' : 'pro', prompt, images(await poll(id)));
}
const pal = PALETTE_WORDS[sec] ?? 'muted desaturated palette';
const tasks: Promise<void>[] = [];
if (only.includes('bg') && BG[sec]) tasks.push(pro('bg', `${BG[sec]}, ${pal}, ${STYLE_BG}`, 400, 240, false));
if (only.includes('mons')) {
  // lanes줄로 나눠 동시에 lanes개씩.
  const mons = S.mons.filter((m) => !onlyFloors || onlyFloors.has(m.floor));
  for (const lane of Array.from({ length: lanes }, (_, k) => mons.filter((_, i) => i % lanes === k))) {
    tasks.push((async () => {
      for (const m of lane) {
        const size = m.guardian ? 160 : 128;
        await pro(`f${m.floor}${tag ? `-${tag}` : ''}`, `${m.art}${m.guardian ? ', large imposing boss' : ''}, ${STYLE_FRIENDLY}${/legless|no legs|no feet|snake|serpent|eel|slime|fish|whale|jelly/i.test(m.art) ? '' : `, ${STURDY_LEGS}`}, ${pal}, ${STYLE_MON}`, size, size, true, true).catch((e) => console.error(`f${m.floor} 실패:`, (e as Error).message));
      }
    })());
  }
}
const res = await Promise.allSettled(tasks);
for (const r of res) if (r.status === 'rejected') console.error('실패:', (r.reason as Error).message);
console.log('완료', outDir);
