// vision e2e — 새 SOURCE + vision 프롬프트로 실제 pixellab create-character-state 호출 →
// 폴링 → south.png 다운로드(/tmp/vision-e2e-N.png). 결과 캐릭터 확인용(일회성).
// 실행: bun --conditions=react-server run scripts/_test-vision-e2e.ts
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

const CASES = [
  {
    label: 'orc·dark_elf·남',
    opts: { gender: 'male', hairLength: 'natural', pose: 'hand_on_hip', race: 'dark_elf' },
    eq: {
      weaponKey: 'orc_ancestor_twin_tusk_axe',
      armorKey: 'orc_first_chief_armor',
      accessoryKey: 'orc_chief_gold_collar',
    },
  },
  {
    label: 'fallen·fairy·여',
    opts: { gender: 'female', hairLength: 'long', pose: 'peace_sign', race: 'fairy' },
    eq: {
      weaponKey: 'fallen_seraph_glaive',
      armorKey: 'fallen_archangel_gold_wings',
      accessoryKey: 'fallen_archangel_halo_crown',
    },
  },
] as const;

async function main() {
  const { composeEditDescription } = await import('../lib/game/profile/compose');
  const start = Date.now();
  const results: { i: number; label: string; characterId?: string; south?: string }[] = [];

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i]!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const edit = await composeEditDescription(c.opts as any, c.eq);
    console.log(`[${i}] ${c.label} desc(${edit.length}) → POST`);
    const res = await fetch(`${BASE}/create-character-state`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        character_id: SOURCE[c.opts.gender],
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
    results.push({ i, label: c.label, characterId: j.character_id });
    console.log(`  → ${j.character_id}`);
  }

  const MAX = 7 * 60 * 1000;
  while (Date.now() - start < MAX) {
    await new Promise((r) => setTimeout(r, 12000));
    const pending = results.filter((r) => r.characterId && !r.south);
    if (!pending.length) break;
    for (const r of pending) {
      try {
        const res = await fetch(`${BASE}/characters/${r.characterId}`, {
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
        writeFileSync(`/tmp/vision-e2e-${r.i}.png`, Buffer.from(await im.arrayBuffer()));
        r.south = s;
        console.log(
          `[${r.i}] ${r.label} ready → /tmp/vision-e2e-${r.i}.png (${((Date.now() - start) / 1000).toFixed(0)}s)`,
        );
      } catch {
        /* transient */
      }
    }
  }
  console.log(`\n[done] ${results.filter((r) => r.south).length}/${results.length} 생성 완료`);
}

main();
