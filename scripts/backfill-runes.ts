/**
 * 속성 각인 백필/재롤 — 아바타 1개당 1건, **지역은 착용 스냅샷의 아이템이 결정**(2026-07-28 B안).
 *
 * - 미지급 아바타: 새로 각인
 * - 기지급 아바타: `--reroll` 지정 시 현재 규칙(아이템 지역)으로 다시 굴린다.
 *   B안 전환 이전에 지급된 건은 지역이 무작위라 규칙과 어긋나므로 CBT 중 1회 정리용.
 *
 * 사용:
 *   bun scripts/backfill-runes.ts                              # 스테이징, 미지급만
 *   bun scripts/backfill-runes.ts --reroll                     # 스테이징, 전체 재롤
 *   bun scripts/backfill-runes.ts PROD_DATABASE_URL [--reroll] # 프로덕션
 */
import { config } from 'dotenv';
import postgres from 'postgres';

import { rollAvatarAttrs, type AvatarAttr } from '../lib/game/balance';
import { attrRegionOfItemKey } from '../lib/game/attr/item-region';
import { runeNameFor } from '../lib/game/rune/name';

config({ path: '.env.local' });
const args = process.argv.slice(2);
const reroll = args.includes('--reroll');
const envName = args.find((a) => !a.startsWith('--')) ?? 'DATABASE_URL';
const url = process.env[envName];
if (!url) {
  console.error(`${envName} 없음`);
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });
console.log(`[backfill-runes] 대상 = ${envName}${reroll ? ' (재롤)' : ''}`);

type Snap = { weaponKey?: string; armorKey?: string; accessoryKey?: string } | null;
const rollFor = (snap: Snap): AvatarAttr[] =>
  rollAvatarAttrs({
    weapon: attrRegionOfItemKey(snap?.weaponKey),
    armor: attrRegionOfItemKey(snap?.armorKey),
    accessory: attrRegionOfItemKey(snap?.accessoryKey),
  });

const targets = reroll
  ? await sql`
      select p.id, p.user_id, p.server_id, p.equipment_snapshot
      from user_profiles p`
  : await sql`
      select p.id, p.user_id, p.server_id, p.equipment_snapshot
      from user_profiles p
      left join runes r on r.source_profile_id = p.id
      where r.id is null`;
console.log(`대상 아바타 ${targets.length}건`);

let granted = 0;
let rerolled = 0;
let empty = 0;
for (const p of targets) {
  const attrs = rollFor(p.equipment_snapshot as Snap);
  if (attrs.length === 0) empty++;
  const name = runeNameFor(attrs);
  const json = sql.json(attrs as unknown as never);
  if (reroll) {
    const upd = await sql`
      update runes set attrs = ${json}, name = ${name}
      where source_profile_id = ${p.id}
      returning id`;
    if (upd.length > 0) {
      rerolled++;
      continue;
    }
  }
  const ins = await sql`
    insert into runes (user_id, server_id, attrs, name, source_profile_id)
    values (${p.user_id}, ${p.server_id}, ${json}, ${name}, ${p.id})
    on conflict (source_profile_id) do nothing
    returning id`;
  if (ins.length > 0) granted++;
}
console.log(`[backfill-runes] 신규 ${granted}건 · 재롤 ${rerolled}건 · 속성 없음(일반/미착용) ${empty}건`);
await sql.end();
