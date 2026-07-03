/**
 * CBT 보상 이월 스냅샷 — 실운영 컷오버(wipe) **직전** 1회 실행.
 *
 * 하는 일(유저별):
 *  1. 초대 보상 집계 — referral_attributions(rewarded=true) 건수 × 당시 단가(💎1,000+📦30).
 *  2. 기념 아바타 — 마지막 착용(characters.active_profile_id, 기본 제외) 없으면 가장 최근
 *     생성 아바타(user_profiles, isDefault 제외). south.png를 storage `profiles` 버킷의
 *     `cbt-keepsake/{userId}.png`로 복사(wipe 후에도 생존) + 행 원본 jsonb 스냅샷.
 *  3. cbt_carryover upsert.
 *
 * 실행 절차(컷오버 데이): 0096 적용 → 본 스크립트 --confirm → wipe(cbt_carryover·cbt-keepsake 제외) → 배포.
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
  id: string; user_id: string; server_id: number; rotations: Record<string, string>;
  pixellab_character_id: string; options: Record<string, unknown>;
  equipment_snapshot: unknown; description_prompt: string; created_at: string;
};

async function keepsakeOf(userId: string): Promise<ProfileRow | null> {
  // 착용 중(비기본) 우선 — 기본 아바타 착용 중이거나 미착용이면 가장 최근 생성한 비기본
  // 아바타로 fallback. 기본 아바타 자체는 실운영에서 기본 지급되므로 항상 제외.
  const [active] = await sql<ProfileRow[]>`
    select up.* from characters c join user_profiles up on up.id = c.active_profile_id
    where c.user_id = ${userId} and coalesce(up.options->>'isDefault','false') <> 'true'
    limit 1`;
  if (active) return active;
  const [latest] = await sql<ProfileRow[]>`
    select up.* from user_profiles up
    where up.user_id = ${userId} and coalesce(up.options->>'isDefault','false') <> 'true'
    order by up.created_at desc
    limit 1`;
  return latest ?? null;
}

/** storage 공개 URL → 같은 버킷 내 키 추출. */
function storageKey(url: string): string | null {
  const m = url.match(/\/object\/public\/profiles\/(.+?)(\?|$)/);
  return m ? m[1]! : null;
}

async function copyKeepsakeImage(userId: string, southUrl: string): Promise<string | null> {
  const key = storageKey(southUrl);
  if (!key) return null;
  const dest = `cbt-keepsake/${userId}.png`;
  if (confirm) {
    const dl = await storage.from('profiles').download(key);
    if (dl.error || !dl.data) { console.warn(`  ⚠ 이미지 다운로드 실패 ${userId}: ${dl.error?.message}`); return null; }
    const buf = Buffer.from(await dl.data.arrayBuffer());
    const up = await storage.from('profiles').upload(dest, buf, { contentType: 'image/png', upsert: true, cacheControl: '31536000' });
    if (up.error) { console.warn(`  ⚠ 이미지 업로드 실패 ${userId}: ${up.error.message}`); return null; }
  }
  const { data } = storage.from('profiles').getPublicUrl(dest);
  return data.publicUrl;
}

async function main() {
  console.log(`\n=== CBT 보상 이월 스냅샷 ${confirm ? '(실행)' : '(드라이런)'} ===\n`);

  // 유저 풀 = 캐릭터 보유 전체(닉네임 포함).
  const users = await sql<{ user_id: string; nickname: string }[]>`
    select user_id, nickname from characters order by created_at`;

  // 초대 집계(추천인 기준).
  const invites = await sql<{ referrer_user_id: string; n: number }[]>`
    select referrer_user_id, count(*)::int n from referral_attributions
    where rewarded = true group by referrer_user_id`;
  const inviteBy = new Map(invites.map((r) => [r.referrer_user_id, Number(r.n)]));

  let rows = 0, withInvite = 0, withKeepsake = 0;
  for (const u of users) {
    const inviteCount = inviteBy.get(u.user_id) ?? 0;
    const ks = await keepsakeOf(u.user_id);
    if (inviteCount === 0 && !ks) continue; // 이월할 것 없음

    let keepsakeUrl: string | null = null;
    if (ks) {
      const south = ks.rotations?.south;
      if (typeof south === 'string' && south) keepsakeUrl = await copyKeepsakeImage(u.user_id, south);
    }

    rows++;
    if (inviteCount > 0) withInvite++;
    if (ks && keepsakeUrl) withKeepsake++;
    console.log(
      `  ${u.nickname.padEnd(12)} 초대 ${String(inviteCount).padStart(2)}건` +
      ` → 💎${inviteCount * INVITE_DIAMOND_PER} 📦${inviteCount * INVITE_BOX_PER}` +
      (ks && keepsakeUrl ? ' · 기념아바타 ✓' : ks ? ' · 기념아바타(이미지 실패)' : ''),
    );

    if (confirm) {
      await sql`
        insert into cbt_carryover (user_id, nickname, invite_count, invite_diamond, invite_boxes, keepsake, keepsake_image_url)
        values (${u.user_id}, ${u.nickname}, ${inviteCount},
                ${inviteCount * INVITE_DIAMOND_PER}, ${inviteCount * INVITE_BOX_PER},
                ${ks && keepsakeUrl ? sql.json(ks as never) : null}, ${keepsakeUrl})
        on conflict (user_id) do update set
          nickname = excluded.nickname,
          invite_count = excluded.invite_count,
          invite_diamond = excluded.invite_diamond,
          invite_boxes = excluded.invite_boxes,
          keepsake = excluded.keepsake,
          keepsake_image_url = excluded.keepsake_image_url,
          snapshot_at = now()`;
    }
  }

  console.log(`\n대상 ${rows}명 (초대보상 ${withInvite} · 기념아바타 ${withKeepsake})`);
  if (!confirm) console.log('드라이런 종료 — 실제 기록은 --confirm.');
  await sql.end();
}

await main();
