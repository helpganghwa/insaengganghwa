// 프롬포트 확인용(일회성) — Haiku vision clause + 최종 edit_description만 출력.
// pixellab 호출 없음(e2e 후순위). 실행: bun --conditions=react-server run scripts/_test-prompt.ts
import { config } from 'dotenv';
config({ path: '.env.local' });

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
  for (const c of CASES) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const edit = await composeEditDescription(c.opts as any, c.eq);
    console.log(`\n========== ${c.label} (${edit.length}자) ==========`);
    console.log(edit);
  }
}

main();
