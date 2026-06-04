/**
 * 우승컵 포즈 충실도 테스트 v2 — 원본 캐릭터 100% 유지 목표.
 * edit_description 최소화(포즈+컵만, 표정/분위기 제거) + palette 스냅 on/off 비교.
 * bun run scripts/_trophy-test2.ts
 */
import { writeFileSync } from 'fs';

import { config } from 'dotenv';
config({ path: '.env.local' });

const PIXELLAB_BASE = 'https://api.pixellab.ai/v2';
const SOURCE = 'c85c1c08-7621-4ce9-a538-be012380c86d'; // 제3회 우승자 RYU 활성 프로필 캐릭터
// 표정/분위기 단어 제거 — 원본 얼굴·의상·비율 보존. 포즈+컵만(무기→컵 대체).
const EDIT = 'both arms raised overhead holding a large golden trophy cup, replacing any weapon';

const VARIANTS = [
  { tag: 'A_nopal', palette: false },
  { tag: 'B_pal', palette: true },
];

const key = process.env.PIXELLAB_API_KEY!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isPng = (b: Buffer) =>
  b.length > 1000 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

async function create(palette: boolean): Promise<string> {
  const res = await fetch(`${PIXELLAB_BASE}/create-character-state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      character_id: SOURCE,
      edit_description: EDIT,
      no_background: true,
      use_color_palette_from_reference: palette,
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
  console.log(`EDIT: "${EDIT}"`);
  const jobs: { tag: string; charId: string; done: boolean }[] = [];
  for (const v of VARIANTS) {
    const charId = await create(v.palette);
    console.log(`  ${v.tag} (palette=${v.palette}) → ${charId}`);
    jobs.push({ tag: v.tag, charId, done: false });
  }

  const start = Date.now();
  while (jobs.some((j) => !j.done) && (Date.now() - start) / 60000 < 22) {
    await sleep(45000);
    const mins = ((Date.now() - start) / 60000).toFixed(1);
    for (const j of jobs) {
      if (j.done) continue;
      const buf = await southReady(j.charId);
      if (buf) {
        const out = `/Users/ryu/Desktop/ai/insaengganghwa/trophy-v2-${j.tag}.png`;
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
