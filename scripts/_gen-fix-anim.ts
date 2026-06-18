// 기존 정적(idle.png)을 first_frame으로 animate-with-text-v3 재생성 — 정적 보존, 동작만 교체.
// 출력: public/sprites-test/anim-obj/<key>/<i>.png (0..N), idle.png는 보존.
// 사용: bun run scripts/_gen-fix-anim.ts
import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) { console.error('PIXELLAB_API_KEY 필요'); process.exit(1); }
const BASE = 'https://api.pixellab.ai/v2';
const FRAME_COUNT = 14; // → 15프레임(0..14), 기존 n=15 일치
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ITEMS = [
  { key: 'vg_tiara', action: 'the golden crown is completely rigid and frozen, exactly identical in every single frame — no movement, no wobble, no shifting of the crown itself, and the gold metal does NOT glow. ONLY two effects animate: the large central red ruby gem brightens and pulses with an inner red glow, and small flames at the tips of the crown flicker and rise upward in vivid red and orange. Everything else stays perfectly still.' },
  { key: 'tc_shawl', action: 'the round mirror shield is completely rigid and frozen, exactly identical in every single frame — the outer metal ring and rim do NOT move, wobble, rotate or change shape at all. ONLY inside the central circular mirror surface a soft silvery reflection shimmers and ripples subtly, as if a faint image moves within the mirror. The whole shield frame stays perfectly still.' },
  { key: 'temple_monk_sash', action: 'the body stays completely rigid and still with no shifting. ONLY the draped cloth shoulder sash sways and ripples gently as if in a soft breeze, and the small jade beads and charm ornaments hanging on it glint and softly shine. No glowing aura burst — just gentle cloth movement and subtle sparkle on the ornaments.' },
  { key: 'tw_staff', action: 'the wooden staff pole is completely rigid and frozen, exactly identical in every single frame — the staff does NOT move, sway, tilt or shift at all. ONLY the golden star at the top of the staff animates a cute face with playful changing expressions, and the small bell hanging on it sways and jingles. The staff body stays perfectly still.' },
] as const;

const OUT = join(process.cwd(), 'public', 'sprites-test', 'anim-obj');

async function run(key: string, action: string) {
  const src = join(OUT, key, 'idle.png');
  if (!existsSync(src)) { console.error(`✗ ${key}: idle.png 없음`); return; }
  const b64 = readFileSync(src).toString('base64');
  const sub = await fetch(`${BASE}/animate-with-text-v3`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ first_frame: { type: 'base64', base64: `data:image/png;base64,${b64}` }, action, frame_count: FRAME_COUNT }),
  });
  if (!sub.ok) { console.error(`✗ ${key}: submit HTTP ${sub.status} ${(await sub.text()).slice(0, 200)}`); return; }
  const { background_job_id: jobId } = (await sub.json()) as { background_job_id?: string };
  if (!jobId) { console.error(`✗ ${key}: no job id`); return; }
  console.log(`  [${key}] job ${jobId} 제출 — 폴링…`);
  for (let i = 0; i < 90; i++) {
    await sleep(6000);
    const r = await fetch(`${BASE}/background-jobs/${jobId}`, { headers: { authorization: `Bearer ${KEY}` } });
    if (!r.ok) { console.error(`  [${key}] poll HTTP ${r.status}`); continue; }
    const j = (await r.json()) as { status?: string; last_response?: { images?: { base64?: string }[] } };
    if (j.status === 'failed') { console.error(`✗ ${key}: job failed`); return; }
    if (j.status === 'completed') {
      const imgs = j.last_response?.images ?? [];
      if (!imgs.length) { console.error(`✗ ${key}: no images`); return; }
      let n = 0;
      imgs.forEach((im, idx) => {
        const raw = (im.base64 ?? '').replace(/^data:image\/png;base64,/, '');
        if (raw) { writeFileSync(join(OUT, key, `${idx}.png`), Buffer.from(raw, 'base64')); n++; }
      });
      console.log(`✓ ${key}: ${n} 프레임 저장 (idle.png 보존)`);
      return;
    }
    console.log(`  [${key}] ${j.status}… (${(i + 1) * 6}s)`);
  }
  console.error(`✗ ${key}: 타임아웃`);
}

for (const it of ITEMS) await run(it.key, it.action);
console.log('fix-anim done');
