// 기본 프로필(대장장이 모험가) 남/여 생성(일회성) — SOURCE + 컨셉 edit_description으로
// create-character-state 호출 → south 다운로드(/tmp/default-{g}.png). vision/장비 없음.
// 실행: bun run scripts/_gen-default.ts
import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';

config({ path: '.env.local' });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY missing');
  process.exit(1);
}
const BASE = 'https://api.pixellab.ai/v2';
const SOURCE = {
  male: '49f210db-1899-4df0-8b2e-bb09537ed7c6',
  female: 'fa5ff0de-1ab2-4dcf-b1a9-80a08f86f67b',
} as const;

// 골격은 compose.ts assemble과 동일(pose=hand_on_hip).
const HEAD =
  'KEEP unchanged from source: gender, the exact same facial features, the Japanese anime art style, body proportions, and overall vibe. Full body head-to-feet, pure clean background, character only. Crisp clean silhouette with smooth solid outlines — no stray white dots, specks or noise around the edges. Slim tall figure with a small head and long legs. Redesign ONLY hair & outfit (keep all else from source): ';
const TAIL =
  ' Pose: one hand resting lightly on the hip. Expression free — any natural pleasant look. Confirm: keep the same facial features, body and anime style as source; full body with both feet on the ground.';

const CLAUSE = {
  male: 'A rugged young blacksmith adventurer gripping a worn iron smithing hammer, wearing a thick brown leather apron over a rolled-sleeve cream linen tunic, reinforced leather gloves and forearm bracers, a tool-laden belt and heavy travel boots, faint soot smudges, short tousled chestnut hair.',
  female:
    'A spirited young blacksmith adventurer resting a worn iron smithing hammer on one shoulder, wearing a fitted brown leather apron over a rolled-sleeve cream blouse, leather gloves and forearm bracers, a tool belt with small pouches and sturdy travel boots, faint soot smudges, long chestnut hair in a practical high ponytail.',
} as const;

const GENDERS = ['male', 'female'] as const;

async function main() {
  const ids: Record<string, string> = {};
  for (const g of GENDERS) {
    const edit = HEAD + CLAUSE[g] + TAIL;
    console.log(`[${g}] desc(${edit.length}) → POST`);
    const res = await fetch(`${BASE}/create-character-state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        character_id: SOURCE[g],
        edit_description: edit,
        no_background: true,
        use_color_palette_from_reference: false,
      }),
    });
    if (!res.ok) {
      console.error(`  POST ${res.status}: ${(await res.text()).slice(0, 200)}`);
      continue;
    }
    const j = (await res.json()) as { character_id: string };
    ids[g] = j.character_id;
    console.log(`  → ${j.character_id}`);
  }

  const start = Date.now();
  const done: Record<string, boolean> = {};
  while (Date.now() - start < 7 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 12000));
    if (GENDERS.every((g) => !ids[g] || done[g])) break;
    for (const g of GENDERS) {
      if (!ids[g] || done[g]) continue;
      try {
        const res = await fetch(`${BASE}/characters/${ids[g]}`, {
          headers: { authorization: `Bearer ${KEY}` },
        });
        if (!res.ok) continue;
        const c = (await res.json()) as { rotation_urls?: Record<string, string | null> };
        const s = c.rotation_urls?.south;
        if (!s) continue;
        let ok = false;
        for (let a = 0; a < 5; a++) {
          const h = await fetch(s, { method: 'HEAD' });
          if (h.ok) {
            ok = true;
            break;
          }
          await new Promise((rr) => setTimeout(rr, 3000));
        }
        if (!ok) continue;
        const im = await fetch(s);
        writeFileSync(`/tmp/default-${g}.png`, Buffer.from(await im.arrayBuffer()));
        done[g] = true;
        console.log(
          `[${g}] ready → /tmp/default-${g}.png (${((Date.now() - start) / 1000).toFixed(0)}s)`,
        );
      } catch {
        /* transient */
      }
    }
  }
  console.log(`\n[done] ${GENDERS.filter((g) => done[g]).length}/2`);
}

main();
