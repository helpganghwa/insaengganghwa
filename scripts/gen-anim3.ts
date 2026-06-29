// 3차 객체 애니 생성 (key2, 객체 기반, v3, 15프레임) → 프레임 PNG + N×256 스트립 webp.
// 사용: bun run scripts/gen-anim3.ts <id|all|N>   (id 나열 / all / 앞에서 N개)
// 입력: scripts/obj-map.json, scripts/anim3-prompts.json
// 출력: public/sprites/anim3-frames/<pool_id>/<i>.png, public/sprites/anim3/<pool_id>.webp, public/sprites/anim3.json
// 파이프라인(메모리 pixellab-object-anim-pipeline):
//  POST /objects/{oid}/animations {animation_description, mode:'v3', frame_count:14}
//   → submissions[0].background_job_id → GET /background-jobs/{id} 폴링
//   → last_response.images[] = {width,height,base64=raw RGBA} → sharp raw→PNG
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { fixOne } from './fix-anim';

const TOK = process.env.PIXELLAB_API_KEY_2;
if (!TOK) { console.error('PIXELLAB_API_KEY_2 필요'); process.exit(1); }
const PIX = 'https://api.pixellab.ai/v2';
const ROOT = process.cwd();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CELL = 256;
const FRAME_COUNT = 8; // v3 256px 최대: 8 (+1 참조프레임 → 9프레임)
const CONC = 5; // 동시 생성 수

const map = JSON.parse(readFileSync(join(ROOT, 'scripts/obj-map.json'), 'utf8')) as Record<string, string>;
const A = JSON.parse(readFileSync(join(ROOT, 'scripts/anim3-prompts.json'), 'utf8')) as {
  items: Record<string, string>; fixFloorDefault?: number; fixFloor?: Record<string, number>;
};
const floorFor = (pid: string) => A.fixFloor?.[pid] ?? A.fixFloorDefault ?? 0;

const arg = process.argv[2] ?? '3';
let targets: string[];
if (arg === 'all') targets = Object.keys(map);
else if (/^\d+$/.test(arg)) targets = Object.keys(map).slice(0, parseInt(arg, 10));
else targets = process.argv.slice(2).filter((a) => map[a]);

const framesDir = join(ROOT, 'public/sprites/anim3-raw'); // 원본 v3 프레임 보존(후처리 입력)
const stripDir = join(ROOT, 'public/sprites/anim3');
mkdirSync(framesDir, { recursive: true }); mkdirSync(stripDir, { recursive: true });
const manifestP = join(ROOT, 'public/sprites/anim3.json');
const manifest: { cell: number; items: Record<string, { frames: number }> } = existsSync(manifestP)
  ? JSON.parse(readFileSync(manifestP, 'utf8')) : { cell: CELL, items: {} };

let VERBOSE = true;

async function postAnim(oid: string, action: string): Promise<string | null> {
  const body = { animation_description: action, mode: 'v3', frame_count: FRAME_COUNT };
  for (let a = 0; a < 5; a++) {
    let r: Response; try {
      r = await fetch(`${PIX}/objects/${oid}/animations`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOK}` }, body: JSON.stringify(body),
      });
    } catch { await sleep(2000 * 2 ** a); continue; }
    if (r.status === 429) { await sleep(2000 * 2 ** a); continue; }
    const txt = await r.text();
    if (VERBOSE) { console.error(`  [POST ${r.status}] ${txt.slice(0, 300)}`); VERBOSE = false; }
    if (!r.ok) { console.error(`  POST 실패 ${r.status}: ${txt.slice(0, 160)}`); return null; }
    const j = JSON.parse(txt);
    return j.submissions?.[0]?.background_job_id ?? j.background_job_id ?? j.job_id ?? null;
  }
  return null;
}

async function pollJob(jobId: string): Promise<{ width: number; height: number; base64: string }[] | null> {
  for (let i = 0; i < 120; i++) {
    await sleep(3000);
    let r: Response; try { r = await fetch(`${PIX}/background-jobs/${jobId}`, { headers: { authorization: `Bearer ${TOK}` } }); } catch { continue; }
    if (!r.ok) continue;
    const j = await r.json() as { status?: string; last_response?: { images?: { width: number; height: number; base64: string }[] } };
    if (j.status === 'completed' || j.status === 'success' || j.last_response?.images?.length) {
      return j.last_response?.images ?? null;
    }
    if (j.status === 'failed' || j.status === 'error') { console.error(`  job ${jobId} 실패`); return null; }
  }
  return null;
}

(async () => {
  console.error(`대상 ${targets.length}종, frame_count=${FRAME_COUNT}(→${FRAME_COUNT + 1}프레임), 동시 ${CONC}`);
  let ok = 0, done = 0; const fail: string[] = [];

  const force = process.argv.includes('--force');
  async function doItem(pid: string) {
    const oid = map[pid]; const action = A.items[pid];
    if (!oid || !action) { fail.push(`${pid}(맵/액션없음)`); return; }
    // resume: 이미 raw+매니페스트 있으면 건너뜀(재생성 토큰 절약)
    if (!force && manifest.items[pid] && existsSync(join(framesDir, pid, '0.png'))) { ok++; process.stderr.write(`· skip ${pid} (${++done}/${targets.length})\n`); return; }
    const jobId = await postAnim(oid, action);
    if (!jobId) { fail.push(`${pid}(POST)`); return; }
    const images = await pollJob(jobId);
    if (!images || !images.length) { fail.push(`${pid}(폴링)`); return; }
    const dir = join(framesDir, pid); mkdirSync(dir, { recursive: true });
    let fi = 0;
    for (const im of images) {
      const expected = im.width * im.height * 4;
      const raw = Buffer.from(im.base64, 'base64');
      const png = raw.length === expected
        ? await sharp(raw, { raw: { width: im.width, height: im.height, channels: 4 } }).png().toBuffer()
        : await sharp(raw).png().toBuffer(); // 혹시 PNG로 올 경우 대비
      writeFileSync(join(dir, `${fi}.png`), png); fi++;
    }
    await fixOne(pid, true, floorFor(pid)); // 정렬+(per-item floor) 후처리 → 스트립 webp 작성
    manifest.items[pid] = { frames: fi };
    writeFileSync(manifestP, JSON.stringify(manifest));
    ok++; process.stderr.write(`✓ ${pid} (${++done}/${targets.length})\n`);
  }

  let idx = 0;
  await Promise.all(Array.from({ length: CONC }, async () => { while (idx < targets.length) { const k = idx++; await doItem(targets[k]); } }));
  console.log(`\n완료 ${ok}/${targets.length}` + (fail.length ? ` · 실패: ${fail.join(', ')}` : ''));
})();
