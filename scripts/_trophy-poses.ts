/**
 * 우승컵 포즈 변형 풀 테스트 — 우승자마다 다른 포즈 선택용 후보군.
 * 최소 프롬프트(표정/분위기 단어 X → 원본 얼굴 보존), palette off(골드 유지).
 * bun run scripts/_trophy-poses.ts
 */
import { writeFileSync } from 'fs';

import { config } from 'dotenv';
config({ path: '.env.local' });

const PIXELLAB_BASE = 'https://api.pixellab.ai/v2';
const SOURCE = 'c85c1c08-7621-4ce9-a538-be012380c86d'; // 제3회 우승자 RYU

const POSES = [
  { tag: 'onehand', edit: 'raising a golden trophy cup high overhead with one hand' },
  { tag: 'twohand', edit: 'lifting a large golden trophy cup high overhead with both hands' },
  { tag: 'chest', edit: 'holding a golden trophy cup against the chest with both arms' },
];

const key = process.env.PIXELLAB_API_KEY!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isPng = (b: Buffer) =>
  b.length > 1000 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

async function create(edit: string): Promise<string> {
  const res = await fetch(`${PIXELLAB_BASE}/create-character-state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      character_id: SOURCE,
      edit_description: edit,
      no_background: true,
      use_color_palette_from_reference: false,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`create HTTP ${res.status}: ${text.slice(0, 300)}`);
  return (JSON.parse(text) as { character_id: string }).character_id;
}

async function southReady(charId: string): Promise<Buffer | null> {
  const res = await fetch(`${PIXELLAB_BASE}/characters/${charId}`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { rotation_urls?: Record<string, string | null> };
  const url = j.rotation_urls?.south;
  if (typeof url !== 'string' || !url) return null;
  const img = await fetch(url);
  if (!img.ok) return null;
  const buf = Buffer.from(await img.arrayBuffer());
  return isPng(buf) ? buf : null;
}

async function main() {
  const jobs: { tag: string; charId: string; done: boolean }[] = [];
  for (const p of POSES) {
    const charId = await create(p.edit);
    console.log(`  ${p.tag}: "${p.edit}" → ${charId}`);
    jobs.push({ tag: p.tag, charId, done: false });
  }

  const start = Date.now();
  while (jobs.some((j) => !j.done) && (Date.now() - start) / 60000 < 22) {
    await sleep(45000);
    const mins = ((Date.now() - start) / 60000).toFixed(1);
    for (const j of jobs) {
      if (j.done) continue;
      const buf = await southReady(j.charId);
      if (buf) {
        const out = `/Users/ryu/Desktop/ai/insaengganghwa/trophy-pose-${j.tag}.png`;
        writeFileSync(out, buf);
        j.done = true;
        console.log(`[${mins}min] READY ${j.tag} → ${out} (${buf.length}B)`);
      } else {
        console.log(`[${mins}min] ${j.tag} not ready`);
      }
    }
  }
  console.log(jobs.every((j) => j.done) ? 'ALL DONE' : 'TIMEOUT (일부 미완)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
