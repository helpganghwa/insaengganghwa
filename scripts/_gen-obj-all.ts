// 오브젝트 기반 애니(투명) — 기존 object_id의 정적 다운로드 + /objects/{id}/animations 생성·회수.
// 애니 응답 images[].base64 = raw RGBA → sharp로 PNG 변환. 출력: anim-obj/<key>/{idle,0..N}.png
import { config } from 'dotenv';
import { join } from 'node:path';
import sharp from 'sharp';
config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY!;
const BASE = 'https://api.pixellab.ai/v2';
const FRAME_COUNT = 14;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const OUT = join(process.cwd(), 'public', 'sprites-test', 'anim-obj');

type Item = { key: string; oid: string; action: string };
const ITEMS: Item[] = [
  { key: 'tc_shawl', oid: '023adca6-de2e-4c97-81ed-915eae88d6c1', action: 'the reflection inside the central round mirror surface shimmers and ripples subtly, while the ornate outer decorative ring and metal frame stay completely still and rigid' },
  { key: 'temple_monk_sash', oid: 'c8a9a50a-8c5a-4557-8dec-f5162fde8844', action: 'the draped cloth shoulder sash sways gently as if in a soft breeze while the small jade beads and charm ornaments hanging on it glint and softly shine; no glowing aura burst, the rest stays still' },
  { key: 'tw_staff', oid: '909a0923-3c39-4bdf-bcfa-fddac1efb3ed', action: 'the golden star at the top of the staff makes playful changing facial expressions and the small bells jingle, while the wooden staff pole stays completely still and rigid' },
  { key: 'angel_armor', oid: 'e1a9cc95-059b-4aa7-b1b0-590a3f7bc2bc', action: 'the large black-and-gold dusk-colored feathered wings flutter and spread softly while the faded golden halo above the head gently glows and pulses, the body stays still' },
];

async function dlStatic(key: string, oid: string) {
  const r = await fetch(`${BASE}/objects/${oid}`, { headers: { authorization: `Bearer ${KEY}` } });
  if (!r.ok) { console.error(`✗ ${key}: GET object ${r.status}`); return false; }
  const j = (await r.json()) as { storage_urls?: { unknown?: string } };
  const url = j.storage_urls?.unknown;
  if (!url) { console.error(`✗ ${key}: no static url`); return false; }
  const im = await fetch(url);
  if (!im.ok) { console.error(`✗ ${key}: static HTTP ${im.status}`); return false; }
  // 192 캔버스에 맞춰 contain (대부분 이미 192)
  const buf = Buffer.from(await im.arrayBuffer());
  await sharp(buf).resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(join(OUT, key, 'idle.png'));
  console.log(`  [${key}] 정적 idle.png 저장`);
  return true;
}

async function animate(key: string, oid: string, action: string) {
  const sub = await fetch(`${BASE}/objects/${oid}/animations`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ animation_description: action, mode: 'v3', frame_count: FRAME_COUNT }),
  });
  if (!sub.ok) { console.error(`✗ ${key}: anim POST ${sub.status} ${(await sub.text()).slice(0, 160)}`); return; }
  const sj = (await sub.json()) as { submissions?: { background_job_id?: string }[] };
  const jobId = sj.submissions?.[0]?.background_job_id;
  if (!jobId) { console.error(`✗ ${key}: no job id`); return; }
  console.log(`  [${key}] job ${jobId} — 폴링…`);
  for (let i = 0; i < 90; i++) {
    await sleep(6000);
    const r = await fetch(`${BASE}/background-jobs/${jobId}`, { headers: { authorization: `Bearer ${KEY}` } });
    if (!r.ok) { console.error(`  [${key}] poll ${r.status}`); continue; }
    const j = (await r.json()) as { status?: string; last_response?: { images?: { base64?: string; width?: number; height?: number }[] } };
    if (j.status === 'failed') { console.error(`✗ ${key}: failed`); return; }
    if (j.status === 'completed') {
      const imgs = j.last_response?.images ?? [];
      let n = 0;
      for (let idx = 0; idx < imgs.length; idx++) {
        const im = imgs[idx];
        if (!im.base64 || !im.width || !im.height) continue;
        const raw = Buffer.from(im.base64, 'base64');
        await sharp(raw, { raw: { width: im.width, height: im.height, channels: 4 } }).png().toFile(join(OUT, key, `${idx}.png`));
        n++;
      }
      console.log(`✓ ${key}: ${n} 프레임(투명 PNG)`);
      return;
    }
    console.log(`  [${key}] ${j.status}… (${(i + 1) * 6}s)`);
  }
  console.error(`✗ ${key}: 타임아웃`);
}

for (const it of ITEMS) {
  await dlStatic(it.key, it.oid);
  await animate(it.key, it.oid, it.action);
}
console.log('gen-obj-all done');
