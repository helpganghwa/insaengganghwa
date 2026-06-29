// 3차 60종 → lib/game/equipment/catalog-v3.ts (CatalogItem[]) 생성 + id→code 매핑 저장.
// 코드 정리: seed-prefix 제거 / 풀 아이템(w-,a-)은 테마 기반 깔끔한 snake_case.
// 컷오버 시 catalog.ts import를 CATALOG_NEXT → CATALOG_V3로 교체(그 전까진 비연동).
// 입력: scripts/final-sel.json, scripts/anim3-lore.json, scripts/pool-data.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const sel = JSON.parse(readFileSync(join(ROOT, 'scripts/final-sel.json'), 'utf8')) as Record<string, string[]>;
const lore = JSON.parse(readFileSync(join(ROOT, 'scripts/anim3-lore.json'), 'utf8')) as Record<string, { name: string; tone?: string; lore: string; region?: string; wornDesc?: string }>;
const pool = new Map((JSON.parse(readFileSync(join(ROOT, 'scripts/pool-data.json'), 'utf8')) as { id: string; prompt?: string }[]).map((p) => [p.id, p]));

// id → 깔끔한 code (= 스프라이트 파일명 = catalog code, 전역 유니크)
const CODE: Record<string, string> = {
  // weapon
  'seed-kingdom_ribbon_rapier': 'kingdom_ribbon_rapier',
  'seed-kingdom_court_twin_sabers': 'kingdom_court_twin_sabers',
  'seed-kingdom_winged_coronation_sword': 'kingdom_winged_coronation_sword',
  'seed-kingdom_falcon_cane_sword': 'kingdom_falcon_cane_sword',
  'seed-temple_frost_odachi': 'temple_frost_odachi',
  'seed-volcano_emberveined_greatsword': 'volcano_emberveined_greatsword',
  'seed-swamp_lotus_trident': 'swamp_lotus_trident',
  'seed-angel_star_wand': 'angel_star_wand',
  'seed-volcano_dragonjaw_halberd': 'volcano_dragonjaw_halberd',
  'w-pumpkin-witch-staff-95': 'pumpkin_witch_staff',
  'seed-kingdom_banner_spear': 'kingdom_banner_spear',
  'seed-volcano_ember_scythe': 'volcano_ember_scythe',
  'w-vampire-rapier-114': 'vampire_blood_rapier',
  'w-reaper-scythe-120': 'reaper_soul_scythe',
  'w-necromancer-staff-126': 'necromancer_skull_staff',
  'w-assassin-twin-daggers-156': 'assassin_twin_daggers',
  'w-ornate-flintlock-pistol-162': 'ivory_flintlock_pistol',
  'w-celestial-greatsword-153': 'celestial_dawn_greatsword',
  'seed-volcano_forgeheart_warhammer': 'volcano_forgeheart_warhammer',
  'w-thunder-spear-191': 'thunder_emperor_spear',
  'w--57': 'vault_key_greatsword',
  // armor
  'seed-angel_radiant_gown': 'angel_radiant_gown',
  'seed-kingdom_azure_outfit': 'kingdom_azure_outfit',
  'seed-angel_seraphguard_armor': 'angel_seraphguard_armor',
  'seed-kingdom_goldknight_plate': 'kingdom_goldknight_plate',
  'seed-temple_frostguard_garb': 'temple_frostguard_garb',
  'seed-temple_breathwoven_vestment': 'temple_breathwoven_vestment',
  'a-pumpkin-witch-outfit-96': 'pumpkin_witch_dress',
  'a-necromancer-robe-127': 'necromancer_raven_robe',
  'a-test-gothic-lolita-150': 'crimson_gothic_dress',
  'a-test-military-coat-151': 'royal_military_coat',
  'seed-volcano_embersilk_dress': 'volcano_embersilk_dress',
  'a-valkyrie-battle-dress-176': 'valkyrie_battle_dress',
  'a-frost-warden-coat-179': 'frostwarden_coat',
  'a-paladin-armor-180': 'paladin_holy_armor',
  'a-dragon-knight-armor-186': 'dragonknight_scale_armor',
  'a-phoenix-dancer-dress-183': 'phoenix_dancer_dress',
  'a-astrologer-outfit-103': 'astrologer_starmap_coat',
  'a-desert-nomad-robes-231': 'desert_nomad_robes',
  'a-academy-professor-robe-234': 'academy_professor_robe',
  'a-academy-student-uniform-233': 'academy_student_uniform',
  'a-forest-ranger-outfit-240': 'forest_ranger_outfit',
  // accessory
  'seed-temple_snowflake_crown': 'temple_snowflake_crown',
  'seed-temple_fur_stole': 'temple_fur_stole',
  'seed-volcano_dragonscale_satchel': 'volcano_dragonscale_satchel',
  'seed-volcano_dragonhorn_circlet': 'volcano_dragonhorn_circlet',
  'seed-volcano_obsidian_warfan': 'volcano_obsidian_warfan',
  'seed-swamp_mushroom_hat': 'swamp_mushroom_hat',
  'seed-swamp_lily_crown': 'swamp_lily_crown',
  'seed-angel_glide_wings': 'angel_glide_wings',
  'seed-kingdom_court_fan': 'kingdom_court_fan',
  'a-commander-epaulets-93': 'commander_feather_epaulets',
  'a-pumpkin-witch-hat-97': 'pumpkin_witch_hat',
  'a-phantom-half-mask-125': 'phantom_half_mask',
  'a-valkyrie-winged-circlet-179': 'valkyrie_winged_circlet',
  'a-devil-horns-winged-149': 'devil_horn_headband',
  'a-dragon-horned-helm-187': 'dragonknight_horned_helm',
  'a-paladin-winged-helm-181': 'paladin_winged_helm',
  'a-frost-kite-shield-82': 'frost_kite_shield',
  'a-round-glasses-245': 'round_gold_glasses',
};

type Entry = { key: string; slot: string; nameKo: string; region: string; tone?: string; lore: string; art: string; wornDesc?: string };
const entries: Entry[] = [];
const codemap: Record<string, { code: string; slot: string }> = {};
const problems: string[] = [];
const seenCodes = new Set<string>();

for (const slot of ['weapon', 'armor', 'accessory']) {
  for (const uid of sel[slot] ?? []) {
    if (!uid.startsWith('v3:')) continue;
    const id = uid.slice(3);
    const code = CODE[id];
    const lo = lore[id];
    const art = pool.get(id)?.prompt;
    if (!code) { problems.push(`code누락 ${id}`); continue; }
    if (seenCodes.has(code)) { problems.push(`code중복 ${code}`); continue; }
    if (!lo?.name || !lo.lore) { problems.push(`로어누락 ${id}`); continue; }
    if (!lo.region) { problems.push(`region누락 ${id}`); continue; }
    if (!lo.wornDesc) { problems.push(`wornDesc누락 ${id}`); continue; }
    if (!art) { problems.push(`art누락 ${id}`); continue; }
    seenCodes.add(code);
    // tone 제외: 3차 로어용 tone 어휘(우아·맹렬 등)는 CatalogTone enum과 불일치하고,
    // tone은 게임 미사용·108종도 미지정이므로 카탈로그엔 넣지 않는다(분류는 anim3-lore.json에 보존).
    const e: Entry = { key: code, slot, nameKo: lo.name, region: lo.region, lore: lo.lore, art, wornDesc: lo.wornDesc };
    entries.push(e);
    codemap[id] = { code, slot };
  }
}

if (problems.length) { console.error('문제:\n' + problems.join('\n')); process.exit(1); }

// catalog-v3.ts 생성 (catalog-next.ts와 동일 포맷)
const body = entries.map((e) => {
  const lines = [
    `    "key": ${JSON.stringify(e.key)},`,
    `    "slot": ${JSON.stringify(e.slot)},`,
    `    "nameKo": ${JSON.stringify(e.nameKo)},`,
    `    "region": ${JSON.stringify(e.region)},`,
    ...(e.tone ? [`    "tone": ${JSON.stringify(e.tone)},`] : []),
    `    "lore": ${JSON.stringify(e.lore)},`,
    `    "art": ${JSON.stringify(e.art)},`,
    `    "wornDesc": ${JSON.stringify(e.wornDesc)}`,
  ];
  return `  {\n${lines.join('\n')}\n  }`;
}).join(',\n');

const ts = `// 3차 60종 카탈로그 — 인생강화 1차 운영(목표 120종)의 전반부. 단일 source.
// 컷오버 시 catalog.ts의 import를 CATALOG_NEXT → CATALOG_V3로 교체(스프라이트 배치 + DB 재시드 동반).
// 생성: scripts/build-catalog-v3.ts (수정은 anim3-lore.json / pool-data.json / 코드맵에서).
import type { CatalogItem } from './catalog';

export const CATALOG_V3: CatalogItem[] = [
${body}
];
`;

writeFileSync(join(ROOT, 'lib/game/equipment/catalog-v3.ts'), ts);
writeFileSync(join(ROOT, 'scripts/catalog-v3-codemap.json'), JSON.stringify(codemap, null, 2));
const dist: Record<string, number> = {};
for (const e of entries) dist[e.slot] = (dist[e.slot] ?? 0) + 1;
console.log(`catalog-v3.ts 생성: ${entries.length}종`, JSON.stringify(dist));
console.log('codemap:', Object.keys(codemap).length, '→ scripts/catalog-v3-codemap.json');
