// 재생성한 정적(idle.png)에 애니 입히기 — animate-with-text-v3. 출력: anim-obj/<key>/<i>.png
import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) { console.error('PIXELLAB_API_KEY 필요'); process.exit(1); }
const BASE = 'https://api.pixellab.ai/v2';
const FRAME_COUNT = 14;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ITEMS = [
  { key: 'tw_robe', action: 'the ornate ceremonial priest robe hangs and sways very gently as if in a soft breeze, while the many golden medals, badges, ribbons and chains on it jingle, glint and softly shine with twinkling light reflections. No glowing aura — just gentle hanging-cloth motion and sparkling metal ornaments.' },
  { key: 'angel_armor', action: 'the fallen angel keeps the body still while the large black-and-gold dusk-colored wings slowly spread and flutter softly, the thin faded golden halo above the head gently glows and pulses, and a warm twilight shimmer sweeps over the dusk-gold armor.' },
] as const;
const OUT = join(process.cwd(), 'public', 'sprites-test', 'anim-obj');
async function run(key: string, action: string) {
  const src = join(OUT, key, 'idle.png');
  if (!existsSync(src)) { console.error(`✗ ${key}: idle.png 없음`); return; }
  const b64 = readFileSync(src).toString('base64');
  const sub = await fetch(`${BASE}/animate-with-text-v3`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ first_frame: { type: 'base64', base64: `data:image/png;base64,${b64}` }, action, frame_count: FRAME_COUNT }),
  });
  if (!sub.ok) { console.error(`✗ ${key}: submit HTTP ${sub.status} ${(await sub.text()).slice(0, 200)}`); return; }
  const { background_job_id: jobId } = (await sub.json()) as { background_job_id?: string };
  if (!jobId) { console.error(`✗ ${key}: no job id`); return; }
  console.log(`  [${key}] job ${jobId} — 폴링…`);
  for (let i = 0; i < 90; i++) {
    await sleep(6000);
    const r = await fetch(`${BASE}/background-jobs/${jobId}`, { headers: { authorization: `Bearer ${KEY}` } });
    if (!r.ok) { console.error(`  [${key}] poll HTTP ${r.status}`); continue; }
    const j = (await r.json()) as { status?: string; last_response?: { images?: { base64?: string }[] } };
    if (j.status === 'failed') { console.error(`✗ ${key}: failed`); return; }
    if (j.status === 'completed') {
      const imgs = j.last_response?.images ?? [];
      if (!imgs.length) { console.error(`✗ ${key}: no images`); return; }
      let n = 0;
      imgs.forEach((im, idx) => { const raw = (im.base64 ?? '').replace(/^data:image\/png;base64,/, ''); if (raw) { writeFileSync(join(OUT, key, `${idx}.png`), Buffer.from(raw, 'base64')); n++; } });
      console.log(`✓ ${key}: ${n} 프레임 저장`);
      return;
    }
    console.log(`  [${key}] ${j.status}… (${(i + 1) * 6}s)`);
  }
  console.error(`✗ ${key}: 타임아웃`);
}
for (const it of ITEMS) await run(it.key, it.action);
console.log('static-anim done');
