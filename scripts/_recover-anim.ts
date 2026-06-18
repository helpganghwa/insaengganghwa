// 이미 제출된 애니 job을 job_id로 폴링해 프레임만 회수(재생성 비용 없음).
// 타임아웃 길게(최대 ~8분). 출력: public/sprites-test/anim/<key>/<i>.png
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY!;
const BASE = 'https://api.pixellab.ai/v2';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const JOBS = [
  { key: 'kingdom_dawnguard_sword', jobId: '539a335c-a81d-42ae-bc9d-40a167e6806d' },
  { key: 'kingdom_dawnguard_cuirass', jobId: '02d8139f-5cb7-4d93-92f9-3b9cd93a2167' },
];
const OUT = join(process.cwd(), 'public', 'sprites-test', 'anim');

for (const { key, jobId } of JOBS) {
  let done = false;
  for (let i = 0; i < 80; i++) {
    const r = await fetch(`${BASE}/background-jobs/${jobId}`, { headers: { authorization: `Bearer ${KEY}` } });
    if (!r.ok) { console.error(`[${key}] poll HTTP ${r.status}`); await sleep(6000); continue; }
    const j = (await r.json()) as { status?: string; last_response?: { images?: { base64?: string }[] } };
    if (j.status === 'failed') { console.error(`✗ ${key}: failed`); break; }
    if (j.status === 'completed') {
      const imgs = j.last_response?.images ?? [];
      const dir = join(OUT, key);
      mkdirSync(dir, { recursive: true });
      let n = 0;
      imgs.forEach((im, idx) => {
        const raw = (im.base64 ?? '').replace(/^data:image\/png;base64,/, '');
        if (raw) { writeFileSync(join(dir, `${idx}.png`), Buffer.from(raw, 'base64')); n++; }
      });
      writeFileSync(join(dir, 'frames.json'), JSON.stringify({ count: n }));
      console.log(`✓ ${key}: ${n} 프레임 회수`);
      done = true;
      break;
    }
    console.log(`  [${key}] ${j.status}… (${(i + 1) * 6}s)`);
    await sleep(6000);
  }
  if (!done) console.error(`✗ ${key}: 미완(타임아웃/실패)`);
}
console.log('recover done');
