/**
 * CBT 유저 사전 복원 — 컷오버 wipe **직후**, 오픈 **전** 1회 실행(런북 §3.5).
 *
 * cbt_carryover(미지급)를 읽어 대상 서버에 캐릭터를 **미리 생성**한다 — 유저가 돌아오기 전에
 * 닉네임·아바타가 자리를 잡고 있으므로 닉네임 예약 로직이 필요 없고, 오픈 첫날 월드가
 * 비어 보이지 않는다. 이월 범위: 닉네임 + 아바타 전 목록 + 추천 보상(진행도는 리셋).
 *
 * 유저별 처리(단일 트랜잭션, 멱등 — 이미 캐릭터 있거나 지급 완료면 건너뜀):
 *  1. 캐릭터 생성 — CBT 닉네임 그대로(wipe 후라 충돌 없음), 가입 보너스 💎1,000 +
 *     슬롯당 📦10(×1 — 정식 오픈 배율), 거주지 랜덤, 튜토리얼 스킵(step 9, CBT 베테랑).
 *  2. 기본 아바타 2종 + 이월 아바타 전부(정면 1방향) 복원, 마지막 착용을 active로.
 *  3. 우편 — 초대 이월 보상(있으면) + 복귀 환영. 만료 90일(복귀가 늦어도 소멸 방지).
 *  4. granted_at 마킹 — 이후 lazy 지급(grant.ts)은 no-op.
 *
 * 사용: bun run --env-file=.env.local scripts/cbt-restore.ts --db=prod [--server=1] [--confirm]
 */
import postgres from 'postgres';

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const has = (k: string) => process.argv.includes(`--${k}`);
const target = arg('db'); // staging | prod
const confirm = has('confirm');
const serverId = Number(arg('server') ?? '1');

const URL =
  target === 'prod' ? process.env.PROD_DATABASE_URL
  : target === 'staging' ? process.env.DATABASE_URL
  : undefined;
if (!target || !URL || !Number.isInteger(serverId) || serverId < 1) {
  console.error('사용: cbt-restore.ts --db=staging|prod [--server=1] [--confirm]');
  process.exit(1);
}
const sql = postgres(URL.replace(':6543/', ':5432/'), { prepare: false, max: 1 });

// 가입 보너스 — 정식 오픈 배율(×1) 고정. lib/game/server-select.ts와 동일 수치
// (TEST_MODE env에 좌우되지 않도록 스크립트에 상수 고정).
const SIGNUP_DIAMOND = 1_000;
const SIGNUP_BOX_PER_SLOT = 10;
const MAIL_EXPIRE = `now() + interval '90 days'`;

// 기본 아바타(대장장이 남/여) — lib/game/server-select.ts DEFAULT_AVATARS와 동일 정본.
const DEFAULT_AVATARS = [
  { charId: 'fd767516-0af6-43f7-b6ed-398289e7d54f', gender: 'male' },
  { charId: '6c079398-6ccf-4610-8f39-f666688ff941', gender: 'female' },
] as const;
const DEFAULT_AVATAR_VER = 2;
const rotationsFor = (g: 'male' | 'female') =>
  Object.fromEntries(
    ['south', 'south_east', 'east', 'north_east', 'north', 'north_west', 'west', 'south_west'].map(
      (d) => [d, `/sprites/default/${g}/${d}.png?v=${DEFAULT_AVATAR_VER}`],
    ),
  );

type CarryAvatar = {
  image_url: string;
  was_active: boolean;
  pixellab_character_id: string;
  options: Record<string, unknown>;
  equipment_snapshot: unknown;
  description_prompt: string;
  created_at: string;
};

type CarryRow = {
  user_id: string; nickname: string | null;
  invite_count: number; invite_diamond: number; invite_boxes: number;
  avatars: CarryAvatar[] | null;
};

async function main() {
  console.log(`\n=== CBT 유저 사전 복원 → 서버 ${serverId} (${target!.toUpperCase()}) ${confirm ? '(실행)' : '(드라이런)'} ===\n`);

  const [srv] = await sql`select id, name, status from servers where id = ${serverId}`;
  if (!srv) { console.error(`중단: 서버 ${serverId} 없음`); process.exit(1); }

  const rows = await sql<CarryRow[]>`
    select user_id, nickname, invite_count, invite_diamond, invite_boxes, avatars
    from cbt_carryover where granted_at is null order by snapshot_at`;
  if (rows.length === 0) { console.log('미지급 이월 행 없음 — 종료.'); await sql.end(); return; }

  let created = 0, skipped = 0;
  for (const r of rows) {
    if (!r.nickname) { console.warn(`  ⚠ ${r.user_id} 닉네임 없음 — 건너뜀(lazy 지급이 처리)`); skipped++; continue; }
    const [dup] = await sql`
      select 1 from characters where user_id = ${r.user_id} and server_id = ${serverId}`;
    if (dup) { console.warn(`  ⚠ ${r.nickname} 캐릭터 이미 존재 — 건너뜀`); skipped++; continue; }

    const avatars = r.avatars ?? [];
    console.log(
      `  ${r.nickname.padEnd(12)} 아바타 ${avatars.length}개` +
      (r.invite_count > 0 ? ` · 초대 ${r.invite_count}건(💎${r.invite_diamond} 📦${r.invite_boxes})` : ''),
    );
    if (!confirm) continue;

    try {
      await restoreOne(r, avatars);
      created++;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('ALREADY_GRANTED')) {
        console.warn(`  ⚠ ${r.nickname} 이미 지급됨(lazy 선점) — 건너뜀`);
        skipped++;
        continue;
      }
      throw e;
    }
  }

  console.log(`\n완료: 생성 ${created} · 건너뜀 ${skipped} / 대상 ${rows.length}`);
  if (!confirm) console.log('드라이런 종료 — 실제 실행은 --confirm.');
  await sql.end();
}

async function restoreOne(r: CarryRow, avatars: CarryAvatar[]): Promise<void> {
  await sql.begin(async (tx) => {
      // 0. 지급권 클레임 먼저(멱등의 직접 방어) — lazy 지급(grant.ts)과 동시 실행돼도
      //    granted_at 조건부 전이는 한쪽만 성공한다. 0행이면 이미 지급됨 → 전체 중단.
      const claimed = await tx`
        update cbt_carryover set granted_at = now()
        where user_id = ${r.user_id} and granted_at is null
        returning user_id`;
      if (claimed.length === 0) throw new Error(`ALREADY_GRANTED:${r.nickname}`);

      // 1. 캐릭터 — CBT 닉 그대로, 거주지 랜덤, 튜토리얼 스킵(베테랑).
      const [rz] = await tx`
        select id from zones where server_id = ${serverId} order by random() limit 1`;
      await tx`
        insert into characters (user_id, server_id, nickname, diamond, tutorial_step, residence_zone_id)
        values (${r.user_id}, ${serverId}, ${r.nickname}, ${SIGNUP_DIAMOND}, 9, ${rz?.id ?? null})`;

      for (const slot of ['weapon', 'armor', 'accessory']) {
        await tx`
          insert into user_supply_boxes (user_id, server_id, slot, count)
          values (${r.user_id}, ${serverId}, ${slot}, ${SIGNUP_BOX_PER_SLOT})
          on conflict do nothing`;
      }

      // 2. 기본 아바타 2종 + 이월 아바타 전부. active = 마지막 착용 > 기본 랜덤.
      const defaultIds: string[] = [];
      for (const a of DEFAULT_AVATARS) {
        const [ins] = await tx`
          insert into user_profiles (user_id, server_id, rotations, active_direction,
                                     pixellab_character_id, options, equipment_snapshot, description_prompt)
          values (${r.user_id}, ${serverId}, ${tx.json(rotationsFor(a.gender))}, 'south',
                  ${a.charId}, ${tx.json({ gender: a.gender, isDefault: true })}, ${tx.json({})},
                  ${`기본 프로필(대장장이 ${a.gender === 'male' ? '남' : '여'})`})
          returning id`;
        defaultIds.push(ins!.id as string);
      }
      let activeId: string | null = null;
      for (const av of avatars) {
        const [ins] = await tx`
          insert into user_profiles (user_id, server_id, rotations, active_direction,
                                     pixellab_character_id, options, equipment_snapshot, description_prompt)
          values (${r.user_id}, ${serverId}, ${tx.json({ south: av.image_url })}, 'south',
                  ${av.pixellab_character_id || 'cbt-keepsake'},
                  ${tx.json({ ...(av.options ?? {}), cbtKeepsake: true })},
                  ${tx.json((av.equipment_snapshot ?? {}) as never)},
                  ${av.description_prompt || 'CBT keepsake avatar'})
          returning id`;
        if (av.was_active) activeId = ins!.id as string;
      }
      const pick = activeId ?? defaultIds[Math.floor(Math.random() * defaultIds.length)]!;
      await tx`
        update characters set active_profile_id = ${pick}
        where user_id = ${r.user_id} and server_id = ${serverId}`;

      // 3. 우편 — 초대 이월(있으면) + 복귀 환영. 만료 90일.
      if (r.invite_count > 0 && (r.invite_diamond > 0 || r.invite_boxes > 0)) {
        const perSlot = Math.floor(r.invite_boxes / 3);
        await tx`
          insert into mailbox (user_id, server_id, type, title, body, sender_label, payload, expires_at)
          values (${r.user_id}, ${serverId}, 'reward', 'CBT 감사 보상 — 친구 초대',
                  ${
                    `CBT를 함께해 주셔서 감사합니다!\n` +
                    `CBT 기간에 초대한 ${r.invite_count}명의 보상을 그대로 다시 담아 드렸어요.\n` +
                    `정식 서비스에서도 초대 보상은 새로 적립됩니다.`
                  }, '시스템',
                  ${tx.json({ diamond: r.invite_diamond, boxes: { weapon: perSlot, armor: perSlot, accessory: perSlot } })},
                  ${sql.unsafe(MAIL_EXPIRE)})`;
      }
      await tx`
        insert into mailbox (user_id, server_id, type, title, body, sender_label, payload, expires_at)
        values (${r.user_id}, ${serverId}, 'admin', '정식 오픈을 환영합니다', ${
          `${r.nickname}님, 다시 만나서 반가워요!\n` +
          `CBT의 닉네임과 아바타${avatars.length > 0 ? ` ${avatars.length}개` : ''}를 그대로 옮겨 두었습니다.\n` +
          `새로워진 세계에서 다시 한번, 강화는 인생이다!`
        }, '시스템', ${tx.json({})}, ${sql.unsafe(MAIL_EXPIRE)})`;

      // 4. 계정 포인터 — 마지막 서버·탈퇴 마킹 해제. (지급 완료 마킹은 0에서 선클레임.)
      await tx`
        update profiles set last_server_id = ${serverId}, withdrawn_at = null
        where id = ${r.user_id}`;
  });
}

main().catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
