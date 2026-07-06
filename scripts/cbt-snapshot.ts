/**
 * CBT 이월 스냅샷 — 실운영 컷오버(wipe) **직전** 1회 실행.
 *
 * 이월 범위(정책): 닉네임 + 아바타 전 목록(비기본) + 추천 보상. 진행도는 이월하지 않음.
 *
 * 하는 일(캐릭터 보유 전 유저 — 빈손 유저도 닉네임 이월을 위해 전원 기록):
 *  1. 초대 보상 집계 — referral_attributions(rewarded=true) 건수 × 당시 단가(💎1,000+📦30).
 *  2. 아바타 전 목록(비기본) — 정면(south) PNG를 storage `profiles` 버킷의
 *     `cbt-keepsake/{userId}/{profileId}.png`로 복사(wipe 생존). 아바타는 정면 1방향만
 *     사용(기획 확정)이라 south만 복사하면 완전 이월. 마지막 착용은 was_active 마킹.
 *  3. cbt_carryover upsert.
 *
 * 실행 절차(컷오버 데이): docs/CUTOVER-LIVE.md 런북 — 점검ON → 본 스크립트 --confirm →
 * cutover-live.ts → cbt-restore.ts(1서버 사전 복원) → env 전환·배포.
 * 기본 드라이런. 대상 DB = PROD_DATABASE_URL(:5432 세션 풀러로 자동 전환).
 *
 * 사용: bun run --env-file=.env.local scripts/cbt-snapshot.ts [--confirm]
 */
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const INVITE_DIAMOND_PER = 1_000; // 스냅샷 시점 단가 고정(lib/game/referral/stats.ts와 동일)
const INVITE_BOX_PER = 30;

const confirm = process.argv.includes('--confirm');
const raw = process.env.PROD_DATABASE_URL;
if (!raw) { console.error('PROD_DATABASE_URL 미설정'); process.exit(1); }
const sql = postgres(raw.replace(':6543/', ':5432/'), { prepare: false, max: 1 });

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) { console.error('SUPABASE service env 미설정'); process.exit(1); }
const storage = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } }).storage;

type ProfileRow = {
  id: string; user_id: string; rotations: Record<string, string>;
  pixellab_character_id: string; options: Record<string, unknown>;
  equipment_snapshot: unknown; description_prompt: string; created_at: string;
};

/** cbt_carryover.avatars 원소 — grant.ts/cbt-restore.ts와 형태 공유. */
type CarryAvatar = {
  image_url: string;
  was_active: boolean;
  pixellab_character_id: string;
  options: Record<string, unknown>;
  equipment_snapshot: unknown;
  description_prompt: string;
  created_at: string;
};

/** storage 공개 URL → 같은 버킷 내 키 추출. */
function storageKey(url: string): string | null {
  const m = url.match(/\/object\/public\/profiles\/(.+?)(\?|$)/);
  return m ? m[1]! : null;
}

async function copyKeepsakeImage(userId: string, profileId: string, southUrl: string): Promise<string | null> {
  const key = storageKey(southUrl);
  if (!key) return null;
  const dest = `cbt-keepsake/${userId}/${profileId}.png`;
  if (confirm) {
    const dl = await storage.from('profiles').download(key);
    if (dl.error || !dl.data) { console.warn(`  ⚠ 이미지 다운로드 실패 ${profileId}: ${dl.error?.message}`); return null; }
    const buf = Buffer.from(await dl.data.arrayBuffer());
    const up = await storage.from('profiles').upload(dest, buf, { contentType: 'image/png', upsert: true, cacheControl: '31536000' });
    if (up.error) { console.warn(`  ⚠ 이미지 업로드 실패 ${profileId}: ${up.error.message}`); return null; }
  }
  const { data } = storage.from('profiles').getPublicUrl(dest);
  return data.publicUrl;
}

async function main() {
  console.log(`\n=== CBT 이월 스냅샷 ${confirm ? '(실행)' : '(드라이런)'} ===\n`);

  // 유저 풀 = 캐릭터 보유 전체 — 빈손이어도 닉네임은 이월(복원 시 그대로 캐릭터 생성).
  const users = await sql<{ user_id: string; nickname: string; active_profile_id: string | null }[]>`
    select user_id, nickname, active_profile_id from characters order by created_at`;

  // 초대 집계(추천인 기준).
  const invites = await sql<{ referrer_user_id: string; n: number }[]>`
    select referrer_user_id, count(*)::int n from referral_attributions
    where rewarded = true group by referrer_user_id`;
  const inviteBy = new Map(invites.map((r) => [r.referrer_user_id, Number(r.n)]));

  let rows = 0, withInvite = 0, avatarTotal = 0;
  for (const u of users) {
    const inviteCount = inviteBy.get(u.user_id) ?? 0;

    // 비기본 아바타 전부 — 기본 아바타는 실운영 캐릭터 생성이 기본 지급하므로 제외.
    const owned = await sql<ProfileRow[]>`
      select id, user_id, rotations, pixellab_character_id, options, equipment_snapshot,
             description_prompt, created_at
      from user_profiles
      where user_id = ${u.user_id} and coalesce(options->>'isDefault','false') <> 'true'
      order by created_at`;

    const avatars: CarryAvatar[] = [];
    for (const p of owned) {
      const south = p.rotations?.south;
      if (typeof south !== 'string' || !south) { console.warn(`  ⚠ south 없음 ${p.id} — 건너뜀`); continue; }
      const url = await copyKeepsakeImage(u.user_id, p.id, south);
      if (!url) continue;
      avatars.push({
        image_url: url,
        was_active: p.id === u.active_profile_id,
        pixellab_character_id: p.pixellab_character_id,
        options: p.options ?? {},
        equipment_snapshot: p.equipment_snapshot ?? {},
        description_prompt: p.description_prompt ?? '',
        created_at: p.created_at,
      });
    }

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
