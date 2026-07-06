// 단발 자유 테스트: 지역/형식/스타일 제약 없이 내가 판단한 최적 프롬프트로 3종 생성(/tmp 저장).
import { writeFileSync } from 'node:fs';

const KEY = process.env.PIXELLAB_API_KEY_2;
const PIX = 'https://api.pixellab.ai/v2';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function pickUrl(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.startsWith('http') ? v : null;
  if (Array.isArray(v)) { for (const x of v) { const u = pickUrl(x); if (u) return u; } return null; }
  if (typeof v === 'object') { for (const x of Object.values(v as Record<string, unknown>)) { const u = pickUrl(x); if (u) return u; } }
  return null;
}

const JOBS: { name: string; prompt: string }[] = [
  {
    name: 'free_weapon',
    prompt:
      'a gorgeous fantasy anime RPG sword, a slender shining blade with an elegant ornate winged guard and a single sky-blue gem in the hilt, a beautiful clean gacha game weapon, a single isolated object on a plain flat empty background, large, pixel art',
  },
  {
    name: 'free_armor',
    prompt:
      'a cute and cool fantasy anime RPG outfit for a young heroine, a fitted blue-and-white dress with soft gold trim, a short flowing cape and a pleated skirt, a beautiful clean gacha game costume shown as the worn outfit on its own, no head, no neck, a slim full-length figure, a single isolated object on a plain flat empty background, pixel art',
  },
  {
    name: 'free_accessory',
    prompt:
      'a charming fantasy anime RPG accessory, an ornate golden locket pocketwatch with a glowing pale-blue gem and fine delicate chains, a beautiful clean gacha game item, a single isolated object on a plain flat empty background, pixel art',
  },
];

if (!KEY) { console.error('PIXELLAB_API_KEY_2 필요'); process.exit(1); }

async function gen(job: { name: string; prompt: string }): Promise<void> {
  const res = await fetch(`${PIX}/create-1-direction-object`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ description: job.prompt, size: 256, view: 'sidescroller' }),
  });
  if (!res.ok) { console.error(`${job.name} create HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`); return; }
  const j = (await res.json()) as { object_id?: string };
  const id = j.object_id ?? '';
  if (!id) { console.error(`${job.name} no id`); return; }
  console.log(`${job.name} → object ${id}`);
  for (let i = 0; i < 100; i++) {
    await sleep(3000);
    let g: Response;
    try { g = await fetch(`${PIX}/objects/${id}`, { headers: { authorization: `Bearer ${KEY}` } }); } catch { continue; }
    if (!g.ok) continue;
    const gj = (await g.json()) as { status?: string; rotation_urls?: unknown; frame_urls?: unknown; storage_urls?: unknown };
    if (gj.status === 'completed' || gj.status === 'review') {
      const url = pickUrl(gj.rotation_urls) ?? pickUrl(gj.frame_urls) ?? pickUrl(gj.storage_urls);
      if (!url) { console.error(`${job.name} no url`); return; }
      const img = await fetch(url);
      const buf = Buffer.from(await img.arrayBuffer());
      writeFileSync(`/tmp/${job.name}.png`, buf);
      console.log(`${job.name} saved (${buf.length}b) id=${id}`);
      return;
    }
    if (gj.status === 'failed') { console.error(`${job.name} failed`); return; }
  }
  console.error(`${job.name} timeout`);
}

await Promise.all(JOBS.map(gen));
console.log('done');
