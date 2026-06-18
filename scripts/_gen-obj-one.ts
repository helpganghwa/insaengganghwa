// 단일 오브젝트 애니 재생성(투명). 정적 보존(idle.png 유지), 0..N.png만 교체.
// 사용: bun run scripts/_gen-obj-one.ts <key> <object_id> "<action>"
import { config } from 'dotenv';
import { join } from 'node:path';
import sharp from 'sharp';
config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY!;
const BASE = 'https://api.pixellab.ai/v2';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const [key, oid, action] = process.argv.slice(2);
if (!key || !oid || !action) { console.error('usage: _gen-obj-one <key> <oid> "<action>"'); process.exit(1); }
const OUT = join(process.cwd(), 'public', 'sprites-test', 'anim-obj');
const sub = await fetch(`${BASE}/objects/${oid}/animations`, {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
  body: JSON.stringify({ animation_description: action, mode: 'v3', frame_count: 14 }),
});
if (!sub.ok) { console.error('POST', sub.status, (await sub.text()).slice(0, 200)); process.exit(1); }
const sj = (await sub.json()) as { submissions?: { background_job_id?: string }[] };
const jobId = sj.submissions?.[0]?.background_job_id;
if (!jobId) { console.error('no job id'); process.exit(1); }
console.log(`[${key}] job ${jobId} — 폴링…`);
for (let i = 0; i < 90; i++) {
  await sleep(6000);
  const r = await fetch(`${BASE}/background-jobs/${jobId}`, { headers: { authorization: `Bearer ${KEY}` } });
  if (!r.ok) continue;
  const j = (await r.json()) as { status?: string; last_response?: { images?: { base64?: string; width?: number; height?: number }[] } };
  if (j.status === 'failed') { console.error('failed'); process.exit(1); }
  if (j.status === 'completed') {
    const imgs = j.last_response?.images ?? []; let n = 0;
    for (let idx = 0; idx < imgs.length; idx++) {
      const im = imgs[idx];
      if (!im.base64 || !im.width || !im.height) continue;
      await sharp(Buffer.from(im.base64, 'base64'), { raw: { width: im.width, height: im.height, channels: 4 } }).png().toFile(join(OUT, key, `${idx}.png`));
      n++;
    }
    console.log(`✓ ${key}: ${n} 프레임(투명)`);
    process.exit(0);
  }
  console.log(`  [${key}] ${j.status}… (${(i + 1) * 6}s)`);
}
console.error('타임아웃');
