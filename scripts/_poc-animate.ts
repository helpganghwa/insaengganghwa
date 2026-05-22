// PoC 4 — v2 object workflow.
// 1) 기존 sprite를 reference로 1-direction object 등록 (캐릭터 아닌 object 타입)
// 2) animate_object로 애니메이션 큐
// 3) 폴링 → frames 다운로드
import { config } from 'dotenv';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) { console.error('PIXELLAB_API_KEY 없음'); process.exit(1); }

const BASE = 'https://api.pixellab.ai/v2';
const HDR = { 'content-type': 'application/json', authorization: `Bearer ${KEY}` } as const;

const SRC = 'public/sprites/weapon/dragon_slayer_blade.png';
const OUT_DIR = '/tmp/poc-frames-v4';
mkdirSync(OUT_DIR, { recursive: true });

const DESCRIPTION = 'fantasy weapon sword inventory item icon, single inanimate game loot object';
const ANIM_DESCRIPTION = 'gentle floating sway oscillating slowly in place with subtle rotation';

async function api(method: 'GET' | 'POST', path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: HDR,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) {
    console.error(`✗ ${method} ${path} → ${r.status}\n${text.slice(0, 800)}`);
    process.exit(1);
  }
  return JSON.parse(text);
}

async function poll<T extends { status?: string }>(
  path: string,
  done: (r: T) => boolean,
  label: string,
): Promise<T> {
  const start = Date.now();
  for (let i = 0; i < 120; i++) { // 최대 10분
    const r = (await api('GET', path)) as T;
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    process.stdout.write(`\r     ${label} ${elapsed}s  status=${r.status ?? '?'}`);
    if (done(r)) { console.log(''); return r; }
    await new Promise((res) => setTimeout(res, 5000));
  }
  console.log('');
  throw new Error('poll timeout');
}

async function main() {
  // 1) sprite base64 (원본 128 그대로)
  const buf = readFileSync(SRC);
  const refBase64 = buf.toString('base64');
  console.log(`[1] sprite 로드 — ${buf.length}B base64=${refBase64.length}`);

  // 2) create-1-direction-object
  console.log(`[2] POST /create-1-direction-object`);
  const created = (await api('POST', '/create-1-direction-object', {
    description: DESCRIPTION,
    style_images: [{ type: 'base64', base64: refBase64 }],
  })) as { object_id: string; background_job_id?: string };
  const objectId = created.object_id;
  console.log(`     object_id=${objectId}`);

  // 3) object 완료 대기
  const obj = await poll<{ status: string }>(
    `/objects/${objectId}`,
    (r) => r.status === 'completed' || r.status === 'review' || r.status === 'failed',
    'object',
  );
  console.log(`     object status=${obj.status}`);
  writeFileSync(`${OUT_DIR}/_object.json`, JSON.stringify(obj, null, 2));

  // 4) animation 큐
  console.log(`[3] POST /objects/${objectId}/animations  "${ANIM_DESCRIPTION}"`);
  const anim = (await api('POST', `/objects/${objectId}/animations`, {
    direction: 'east',
    animation_description: ANIM_DESCRIPTION,
    frame_count: 8,
    no_background: true,
  })) as { animation_id?: string; background_job_id?: string };
  console.log(`     animation_id=${anim.animation_id}  job=${anim.background_job_id}`);

  // 5) animation 완료 대기 (object 재조회)
  const final = await poll<{ status: string; animations?: unknown[] }>(
    `/objects/${objectId}`,
    (r) => {
      const a = r.animations as Array<{ status?: string }> | undefined;
      return Array.isArray(a) && a.some((x) => x.status === 'completed');
    },
    'animation',
  );
  writeFileSync(`${OUT_DIR}/_final.json`, JSON.stringify(final, null, 2));
  console.log(`\n✅ 결과: ${OUT_DIR}/_final.json — frame URLs/base64 추출 필요`);
}

main().catch((e) => { console.error(e); process.exit(1); });
