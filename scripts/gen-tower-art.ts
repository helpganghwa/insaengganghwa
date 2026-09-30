/**
 * 무한의 탑 몬스터·구간 배경 생성(Pixellab v2 REST, PIXELLAB_API_KEY_2) — docs/TOWER.md §9 제작 계획.
 *   bun --env-file=.env.local scripts/gen-tower-art.ts <구간번호 1~10> [--only=bg,guardian,mons,compare] [--force]
 * 산출: scripts/tower-art/out/sec<NN>/<key>/<i>.png(후보) + manifest.json. 이미 있으면 건너뛴다(재개형, --force로 다시).
 * 비용: 배경 = 고급(generate-image-v2) 400×240 1장, 수문장 = 고급 160px 후보 4장, 일반 9종 = 빠른 모델(pixen) 128px 후보 3장씩,
 *       compare = 일반 1종(9번째)을 고급 128px 후보 4장으로도 만들어 모델 비교.
 * 주문문은 외형만(감각·서사 금지), 고급스러움 우선, 원색 지양 — 구간 팔레트를 말로 덧붙인다.
 */
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const KEY = process.env.PIXELLAB_API_KEY_2;
if (!KEY) throw new Error('PIXELLAB_API_KEY_2 없음');
const API = 'https://api.pixellab.ai/v2';
const args = process.argv.slice(2);
const sec = Number(args[0]);
const only = (args.find((a) => a.startsWith('--only='))?.slice(7) ?? 'bg,guardian,mons,compare').split(',');
const force = args.includes('--force');

type Mon = { floor: number; name: string; desc: string; art: string; guardian: boolean };
type Sec = { theme: string; palette: string[]; mons: Mon[] };
const data = JSON.parse(readFileSync('scripts/tower-art/monsters.json', 'utf8')) as Sec[];
const S = data[sec - 1];
if (!S) throw new Error('구간 번호 1~10');

// 구간별 배경 주문문(외형만) — 1단계 테마 설정의 재질·색.
const BG: Record<number, string> = {
  1: 'interior of an ancient grey stone corridor inside a great tower, weathered stone walls and worn flagstone floor, arched stone ceiling, rows of rusted iron candle holders with hardened dripping wax and small warm candle flames, faded tattered grey banners on the walls, soft dust in the air',
};
const PALETTE_WORDS: Record<number, string> = {
  1: 'muted desaturated palette of warm grey, taupe and dim amber candlelight',
};

const STYLE_MON =
  'pixel art game monster sprite, full body, three-quarter view facing right, clean readable silhouette, refined elegant detailed pixel art, muted desaturated colors, no text';
const STYLE_BG = 'pixel art game background scene, refined elegant detailed pixel art, no characters, no creatures, no text, fully filled background edge to edge';

const outDir = join('scripts/tower-art/out', `sec${String(sec).padStart(2, '0')}`);
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

async function pro(key: string, prompt: string, w: number, h: number, noBg: boolean) {
  if (done(key)) return console.log(`- ${key} 이미 있음`);
  const r = await call('/generate-image-v2', { description: prompt, image_size: { width: w, height: h }, no_background: noBg });
  const id = r.background_job_id ?? r.id;
  write(key, 'pro', prompt, images(await poll(id)));
}
async function pixen(key: string, prompt: string, n: number) {
  if (done(key)) return console.log(`- ${key} 이미 있음`);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await call('/create-image-pixen', {
      description: prompt, image_size: { width: 128, height: 128 }, no_background: true,
      direction: 'east', detail: 'highly detailed', outline: 'selective outline',
    });
    out.push(...images(r));
    await sleep(800);
  }
  write(key, 'pixen', prompt, out);
}

const pal = PALETTE_WORDS[sec] ?? 'muted desaturated palette';
const tasks: Promise<void>[] = [];
if (only.includes('bg')) tasks.push(pro('bg', `${BG[sec]}, ${pal}, ${STYLE_BG}`, 400, 240, false));
const guardian = S.mons.find((m) => m.guardian)!;
if (only.includes('guardian')) tasks.push(pro(`f${guardian.floor}`, `${guardian.art}, large imposing boss, ${pal}, ${STYLE_MON}`, 160, 160, true));
if (only.includes('compare')) {
  const m = S.mons[8]!;
  tasks.push(pro(`f${m.floor}-pro`, `${m.art}, ${pal}, ${STYLE_MON}`, 128, 128, true));
}
if (only.includes('mons')) {
  tasks.push((async () => {
    for (const m of S.mons.filter((x) => !x.guardian)) await pixen(`f${m.floor}`, `${m.art}, ${pal}, ${STYLE_MON}`, 3);
  })());
}
const res = await Promise.allSettled(tasks);
for (const r of res) if (r.status === 'rejected') console.error('실패:', (r.reason as Error).message);
console.log('완료', outDir);
