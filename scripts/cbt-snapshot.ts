/**
 * CBT 이월 스냅샷 — 실운영 컷오버(wipe) **직전** 1회 실행.
 *
 * 이월 범위(정책): 닉네임 + 추천 보상. 아바타·진행도는 이월하지 않음
 * (2026-07-24 아바타 보존 철회 — 컷오버 시 아바타 목록 초기화, 유저는 기본 아바타로 새 시작).
 *
 * 하는 일(캐릭터 보유 전 유저 — 빈손 유저도 닉네임 이월을 위해 전원 기록):
 *  1. 초대 보상 집계 — referral_attributions(rewarded=true) 건수 × 당시 단가(💎1,000+📦30).
 *  2. cbt_carryover upsert(avatars=null — 아바타 미이월).
 *
 * 실행 절차(컷오버 데이): docs/CUTOVER-LIVE.md 런북 — 점검ON → 본 스크립트 --confirm →
 * cutover-live.ts → cbt-restore.ts(1서버 사전 복원) → env 전환·배포.
 * 기본 드라이런. 대상 DB = PROD_DATABASE_URL(:5432 세션 풀러로 자동 전환).
 *
 * 사용: bun run --env-file=.env.local scripts/cbt-snapshot.ts [--confirm]
 */
import postgres from 'postgres';

const INVITE_DIAMOND_PER = 1_000; // 스냅샷 시점 단가 고정(lib/game/referral/stats.ts와 동일)
const INVITE_BOX_PER = 30;

const confirm = process.argv.includes('--confirm');
const raw = process.env.PROD_DATABASE_URL;
if (!raw) { console.error('PROD_DATABASE_URL 미설정'); process.exit(1); }
const sql = postgres(raw.replace(':6543/', ':5432/'), { prepare: false, max: 1 });

/** cbt_carryover.avatars 원소 — grant.ts/cbt-restore.ts와 형태 공유(현재 미이월이라 항상 null). */
type CarryAvatar = {
  image_url: string;
  was_active: boolean;
  pixellab_character_id: string;
  options: Record<string, unknown>;
  equipment_snapshot: unknown;
  description_prompt: string;
  created_at: string;
};

async function main() {
  console.log(`\n=== CBT 이월 스냅샷 ${confirm ? '(실행)' : '(드라이런)'} ===\n`);

  // 유저 풀 = 캐릭터 보유 전체 — 빈손이어도 닉네임은 이월(복원 시 그대로 캐릭터 생성).
  // 유저당 1행: 다중 서버 캐릭터 보유자는 마지막 활성 서버의 닉/착용을 정본으로
  // (행 단위 순회 + user_id PK upsert면 나중 행이 앞 행을 덮어 닉 하나가 소리 없이 유실).
  const users = await sql<{ user_id: string; nickname: string; active_profile_id: string | null }[]>`
    select distinct on (c.user_id) c.user_id, c.nickname, c.active_profile_id
    from characters c
    join profiles p on p.id = c.user_id
    order by c.user_id, (c.server_id = p.last_server_id) desc, c.created_at`;

  // 초대 집계(추천인 기준).
  const invites = await sql<{ referrer_user_id: string; n: number }[]>`
    select referrer_user_id, count(*)::int n from referral_attributions
    where rewarded = true group by referrer_user_id`;
  const inviteBy = new Map(invites.map((r) => [r.referrer_user_id, Number(r.n)]));

  let rows = 0, withInvite = 0, avatarTotal = 0;
  for (const u of users) {
    const inviteCount = inviteBy.get(u.user_id) ?? 0;

    // 아바타는 이월하지 않는다(2026-07-24 보존 철회) — 컷오버 시 아바타 목록을 초기화하고
    // 유저는 기본 아바타 2종으로 새 시작한다. 초대 보상(💎/📦)만 이월. keepsake 버킷 복사·
    // avatars 스냅샷 없음(restore는 빈 avatars면 기본 2종만 생성하므로 그대로 둔다).
    const avatars: CarryAvatar[] = [];

    rows++;
    if (inviteCount > 0) withInvite++;
    avatarTotal += avatars.length;
    console.log(
      `  ${u.nickname.padEnd(12)} 초대 ${String(inviteCount).padStart(2)}건` +
      ` → 💎${inviteCount * INVITE_DIAMOND_PER} 📦${inviteCount * INVITE_BOX_PER}` +
      ` · 아바타 ${avatars.length}개${avatars.some((a) => a.was_active) ? '(착용 포함)' : ''}`,
    );

    if (confirm) {
      await sql`
        insert into cbt_carryover (user_id, nickname, invite_count, invite_diamond, invite_boxes, avatars)
        values (${u.user_id}, ${u.nickname}, ${inviteCount},
                ${inviteCount * INVITE_DIAMOND_PER}, ${inviteCount * INVITE_BOX_PER},
                ${avatars.length > 0 ? sql.json(avatars as never) : null})
        on conflict (user_id) do update set
          nickname = excluded.nickname,
          invite_count = excluded.invite_count,
          invite_diamond = excluded.invite_diamond,
          invite_boxes = excluded.invite_boxes,
          avatars = excluded.avatars,
          snapshot_at = now()`;
    }
  }

  console.log(`\n대상 ${rows}명 (초대보상 ${withInvite} · 아바타 총 ${avatarTotal}개)`);
  if (!confirm) console.log('드라이런 종료 — 실제 기록은 --confirm.');
  await sql.end();
}

await main();
