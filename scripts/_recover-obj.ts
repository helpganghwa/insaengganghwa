// 오브젝트 애니 job 회수 — background_job_id 폴링해 프레임 저장(투명). 출력: anim-obj/<key>/<i>.png
import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY!;
const BASE = 'https://api.pixellab.ai/v2';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const JOBS: { key: string; jobId: string }[] = [
  { key: 'tw_robe', jobId: 'c27c575b-7593-4c64-9985-3377cfe1b271' },
];
const OUT = join(process.cwd(), 'public', 'sprites-test', 'anim-obj');
for (const { key, jobId } of JOBS) {
  let done = false;
  for (let i = 0; i < 90; i++) {
    await sleep(6000);
    const r = await fetch(`${BASE}/background-jobs/${jobId}`, { headers: { authorization: `Bearer ${KEY}` } });
    if (!r.ok) { console.error(`[${key}] poll ${r.status}`); continue; }
    const j = (await r.json()) as { status?: string; last_response?: { images?: { base64?: string }[] } };
    if (j.status === 'failed') { console.error(`✗ ${key}: failed`); break; }
    if (j.status === 'completed') {
      const imgs = j.last_response?.images ?? [];
      let n = 0;
      imgs.forEach((im, idx) => { const raw = (im.base64 ?? '').replace(/^data:image\/png;base64,/, ''); if (raw) { writeFileSync(join(OUT, key, `${idx}.png`), Buffer.from(raw, 'base64')); n++; } });
      console.log(`✓ ${key}: ${n} 프레임`);
      done = true; break;
    }
    console.log(`  [${key}] ${j.status}… (${(i + 1) * 6}s)`);
  }
  if (!done) console.error(`✗ ${key}: 미완`);
}
console.log('recover-obj done');
