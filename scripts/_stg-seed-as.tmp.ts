// 스테이징 전용 — 파견 성장축 ③ 밸런스 점검용 아바타 강화 합 시드.
//   bun run --conditions=react-server scripts/_stg-seed-as.tmp.ts <닉네임> <AS1> [AS2] [AS3] [--sum T]
// 해당 유저의 아바타(기본 제외, 최신순) 1~3개에 대해 생성 장비 3종의 enhance_level을 AS/3씩 세팅하고
// 미배정 오퍼를 지워 다음 진입 시 새 기준치 B로 재롤되게 한다. DATABASE_URL(스테이징)만 사용.
// --sum T: 계정 합산 강화(전 장비 enhance_level 합)를 T가 되도록 아바타 외 장비 1개에 나머지를 싣는다
//          (슬롯 해금 1k/3k/10k/15k 점검용). 지정 없으면 아바타 장비만 세팅.
import { config } from 'dotenv';
config({ path: '.env.local' });
if ((process.env.DATABASE_URL ?? '').includes(process.env.PROD_DATABASE_URL ?? '@@@')) throw new Error('prod 금지');
import { sql } from 'drizzle-orm';
const { db } = await import('../lib/db/client');
const argv = process.argv.slice(2);
const sumIdx = argv.indexOf('--sum');
const sumTarget = sumIdx >= 0 ? Number(argv[sumIdx + 1]) : null;
const [nick, ...asArgs] = argv.filter((_, i) => i !== sumIdx && i !== sumIdx + 1);
if (!nick || asArgs.length === 0) throw new Error('usage: <닉네임> <AS1> [AS2] [AS3] [--sum T]');
const targets = asArgs.map(Number);
const [c] = (await db.execute(sql`select user_id::text uid from characters where nickname = ${nick} and server_id = 1`)) as unknown as { uid: string }[];
if (!c) throw new Error('닉네임 없음: ' + nick);
const avs = (await db.execute(sql`
  select id::text, equipment_snapshot from user_profiles
  where user_id = ${c.uid}::uuid and server_id = 1 and coalesce((options->>'isDefault')::boolean,false) = false
  order by created_at desc limit ${targets.length}`)) as unknown as { id: string; equipment_snapshot: Record<string, string> }[];
if (avs.length === 0) throw new Error('커스텀 아바타 없음');
for (let i = 0; i < avs.length; i++) {
  const keys = Object.values(avs[i]!.equipment_snapshot ?? {}).filter((v) => typeof v === 'string');
  const per = Math.round(targets[i]! / Math.max(1, keys.length));
  for (const key of keys) {
    await db.execute(sql`
      insert into user_equipment (user_id, server_id, catalog_item_id, enhance_level, max_enhance_level)
      select ${c.uid}::uuid, 1, ci.id, ${per}, greatest(${per}, 0) from catalog_items ci where ci.code = ${key}
      on conflict (user_id, server_id, catalog_item_id) do update
        set enhance_level = ${per}, max_enhance_level = greatest(user_equipment.max_enhance_level, ${per})`);
  }
  console.log(`avatar ${avs[i]!.id.slice(0, 8)} → ${keys.join(',')} 각 +${per} (AS≈${per * keys.length})`);
}
if (sumTarget !== null) {
  // 아바타 스냅샷에 안 쓰인 장비 1개(없으면 카탈로그 첫 항목 삽입)에 잔여분을 실어 합계를 T로.
  const snapKeys = new Set(avs.flatMap((a) => Object.values(a.equipment_snapshot ?? {}).filter((v) => typeof v === 'string')));
  const [cur] = (await db.execute(sql`select coalesce(sum(enhance_level),0)::int s from user_equipment where user_id = ${c.uid}::uuid and server_id = 1`)) as unknown as { s: number }[];
  const rows = (await db.execute(sql`
    select ue.id::text, ci.code, ue.enhance_level lv from user_equipment ue join catalog_items ci on ci.id = ue.catalog_item_id
    where ue.user_id = ${c.uid}::uuid and ue.server_id = 1 order by ue.id`)) as unknown as { id: string; code: string; lv: number }[];
  const filler = rows.find((r) => !snapKeys.has(r.code));
  const others = rows.filter((r) => !snapKeys.has(r.code) && r.id !== filler?.id);
  // 아바타 외 나머지 장비는 0으로 정리한 뒤 filler 하나에 몰아준다(합계 계산 단순화).
  for (const o of others) await db.execute(sql`update user_equipment set enhance_level = 0 where id = ${BigInt(o.id)}`);
  const avatarSum = rows.filter((r) => snapKeys.has(r.code)).reduce((a, r) => a + r.lv, 0);
  const need = Math.max(0, sumTarget - avatarSum);
  if (filler) {
    await db.execute(sql`update user_equipment set enhance_level = ${need}, max_enhance_level = greatest(max_enhance_level, ${need}) where id = ${BigInt(filler.id)}`);
  } else {
    await db.execute(sql`
      insert into user_equipment (user_id, server_id, catalog_item_id, enhance_level, max_enhance_level)
      select ${c.uid}::uuid, 1, ci.id, ${need}, ${need} from catalog_items ci where ci.code not in ${sql.raw(`('${[...snapKeys].join("','")}')`)} order by ci.id limit 1`);
  }
  const [after] = (await db.execute(sql`select coalesce(sum(enhance_level),0)::int s from user_equipment where user_id = ${c.uid}::uuid and server_id = 1`)) as unknown as { s: number }[];
  console.log(`합산 강화 ${cur.s} → ${after.s} (filler ${filler?.code ?? '신규'} = ${need})`);
}
const del = await db.execute(sql`delete from expeditions where user_id = ${c.uid}::uuid and server_id = 1 and status = 'offer' returning id`);
console.log(`오퍼 ${(del as unknown as unknown[]).length}건 삭제 — 파견 화면 진입 시 새 기준치로 재롤`);
process.exit(0);
