import 'server-only';

import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { db } from '@/lib/db/client';
import { meleeBattles, type MeleeFinale } from '@/lib/db/schema/melee';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles } from '@/lib/db/schema/avatar';
import { reviewProfile } from '@/lib/game/profile/ai-review';
import { cleanupSprite } from '@/lib/game/profile/sprite-cleanup';

/**
 * 대난투 우승 트로피 아바타 자동 생성 — MELEE §우승컵.
 * melee-run(9:00)이 우승자를 산출하면, 이 파이프라인이 우승자 프로필 캐릭터에서
 * create-character-state(우승컵 포즈)로 파생 생성 → 폴링 → AI 검토(결함 차단) →
 * 통과 시 storage 미러 + finale.trophyAvatar 저장(대난투 포디움/우승카드/역대우승자 **표시 전용**).
 * 우승자에게 아바타로 지급하지 않음(우편/앱알림 폐기, 2026-06-04). 실패/미통과 시 재시도(상한 MAX_ATTEMPTS).
 *
 * 상태(melee_battles.trophy_status): null(미시작) → 'generating' → 'done' / 'failed'.
 * cron(`/api/cron/melee-trophy`)이 주기 호출. 멱등(상태머신 + 조건부 전이).
 */
const PIXELLAB_BASE = 'https://api.pixellab.ai/v2';
const STORAGE_BUCKET = 'profiles';
const MAX_ATTEMPTS = 3;
const GEN_TIMEOUT_MIN = 20; // 'generating' 정체 시 타임아웃 → 재시도.

// 최소 변경 프롬프트(2026-06-06) — 머리부터 발끝까지·자세·바라보는 방향 전부 원본
// 그대로 보존하고 한쪽 팔만 수정해 무늬 없는 매끈한 트로피를 들게 한다. 전신 포즈를
// 바꾸면 우승자 본인과 달라지고 얼굴이 가려져서(검증됨) 팔만 변경. 보존 강제는 PRESERVE.
const POSE_POOL = [
  {
    tag: 'onehand',
    edit: 'one hand holds up a plain smooth golden trophy cup with no engravings or patterns',
  },
  {
    tag: 'chest',
    edit: 'both arms cradle a plain smooth golden trophy cup with no engravings or patterns against the chest',
  },
] as const;

const REVIEW_DESCRIPTION =
  'A victorious champion character holding a golden trophy cup in a celebration pose. Check every rotation for anatomical part-count defects (extra or missing arms/legs/heads).';

const DIRECTIONS = [
  'south',
  'south_east',
  'east',
  'north_east',
  'north',
  'north_west',
  'west',
  'south_west',
] as const;

let _sb: SupabaseClient | null = null;
function serviceClient(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE service env missing');
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _sb;
}

function isPng(b: Buffer): boolean {
  return b.length > 1000 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

/** 우승자 source 캐릭터 — 현재 활성 프로필의 pixellab 캐릭터(없으면 최근 프로필). */
async function getSourceChar(userId: string): Promise<string | null> {
  const [p] = await db
    .select({ active: profiles.activeProfileId })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (p?.active) {
    const [ap] = await db
      .select({ cid: userProfiles.pixellabCharacterId })
      .from(userProfiles)
      .where(eq(userProfiles.id, p.active))
      .limit(1);
    if (ap?.cid) return ap.cid;
  }
  const [anyP] = await db
    .select({ cid: userProfiles.pixellabCharacterId })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return anyP?.cid ?? null;
}

/** 우승자 아바타의 표시 방향(active_direction) — 트로피도 같은 방향 노출. 없으면 south. */
async function getChampionDirection(userId: string): Promise<string> {
  const [p] = await db
    .select({ active: profiles.activeProfileId })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (p?.active) {
    const [ap] = await db
      .select({ dir: userProfiles.activeDirection })
      .from(userProfiles)
      .where(eq(userProfiles.id, p.active))
      .limit(1);
    if (ap?.dir) return ap.dir;
  }
  return 'south';
}

// 한쪽 팔만 바꾸고 나머지(얼굴·표정·머리·복장·몸·자세·바라보는 방향)는 머리부터 발끝까지
// 원본 그대로 유지 — 우승자 본인과 동일하게(2026-06-06). 모든 포즈 edit에 공통 접미.
const PRESERVE =
  ", while keeping the character's face, expression, hair, outfit, legs, body, stance and facing direction exactly the same as the original from head to toe; change only the arm(s) holding the trophy and nothing else";

async function createState(sourceChar: string, edit: string): Promise<string> {
  const key = process.env.PIXELLAB_API_KEY!;
  const res = await fetch(`${PIXELLAB_BASE}/create-character-state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      character_id: sourceChar,
      edit_description: edit + PRESERVE,
      no_background: true,
      use_color_palette_from_reference: false,
    }),
  });
  if (!res.ok) throw new Error(`create-state HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { character_id: string }).character_id;
}

type ReadyImages = { direction: string; png: Buffer }[];

/** pixellab 캐릭터 폴링 — 8방향 실파일(PNG) 완성 시 buffer 배열, 아니면 pending/gone. */
async function fetchReady(charId: string): Promise<'pending' | 'gone' | ReadyImages> {
  const key = process.env.PIXELLAB_API_KEY!;
  const res = await fetch(`${PIXELLAB_BASE}/characters/${charId}`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (res.status === 404) return 'gone';
  if (!res.ok) return 'pending';
  const j = (await res.json()) as { rotation_urls?: Record<string, string | null> };
  const urls = j.rotation_urls ?? {};
  const images: ReadyImages = [];
  for (const dir of DIRECTIONS) {
    const hy = dir.replace('_', '-');
    const url =
      (typeof urls[hy] === 'string' && urls[hy]) || (typeof urls[dir] === 'string' && urls[dir]);
    if (!url) return 'pending';
    const r = await fetch(url);
    if (!r.ok) return 'pending'; // rotation_urls는 떴지만 실파일 아직 404(검증된 케이스).
    const buf = Buffer.from(await r.arrayBuffer());
    if (!isPng(buf)) return 'pending';
    images.push({ direction: dir, png: buf });
  }
  return images;
}

/** 8방향 PNG를 Supabase Storage에 미러 → 영구 public URL 맵(snake_case 키). */
async function mirror(battleId: bigint, images: ReadyImages): Promise<Record<string, string>> {
  const sb = serviceClient();
  const rotations: Record<string, string> = {};
  for (const im of images) {
    const path = `melee-trophy/${battleId.toString()}/${im.direction}.png`;
    // 프로필과 동일하게 공중 픽셀 노이즈 제거(2026-06-06) — 트로피는 미적용이었음.
    const cleaned = await cleanupSprite(im.png);
    const { error } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(path, cleaned, { contentType: 'image/png', upsert: true });
    if (error) throw new Error(`storage ${im.direction}: ${error.message}`);
    rotations[im.direction] = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }
  return rotations;
}

type TrophyBattle = {
  id: bigint;
  championUserId: string;
  finale: MeleeFinale;
  trophyStatus: string | null;
  trophyCharId: string | null;
  trophyAttempts: number;
  trophyUpdatedAt: Date | null;
};

/** 새 시도 시작(생성 POST). 상한 초과면 failed. */
async function startAttempt(b: TrophyBattle, nextAttempt: number): Promise<void> {
  if (nextAttempt > MAX_ATTEMPTS) {
    await db
      .update(meleeBattles)
      .set({ trophyStatus: 'failed', trophyUpdatedAt: new Date() })
      .where(eq(meleeBattles.id, b.id));
    console.warn(`[melee.trophy] battle ${b.id} FAILED (attempts > ${MAX_ATTEMPTS})`);
    return;
  }
  const source = await getSourceChar(b.championUserId);
  if (!source) {
    await db
      .update(meleeBattles)
      .set({ trophyStatus: 'failed', trophyUpdatedAt: new Date() })
      .where(eq(meleeBattles.id, b.id));
    console.warn(`[melee.trophy] battle ${b.id} FAILED (champion has no pixellab profile)`);
    return;
  }
  const pose = POSE_POOL[(Number(b.id % BigInt(POSE_POOL.length)) + nextAttempt) % POSE_POOL.length]!;
  const charId = await createState(source, pose.edit);
  await db
    .update(meleeBattles)
    .set({
      trophyStatus: 'generating',
      trophyCharId: charId,
      trophyPose: pose.tag,
      trophyAttempts: nextAttempt,
      trophyUpdatedAt: new Date(),
    })
    .where(eq(meleeBattles.id, b.id));
  console.log(`[melee.trophy] battle ${b.id} attempt ${nextAttempt} → ${charId} (${pose.tag})`);
}

/** 통과 — 미러 + finale.trophyAvatar 저장 → done. 우승자 지급(우편/푸시) 없음 — 트로피는 대난투 표시 전용. */
async function finalize(b: TrophyBattle, _images: ReadyImages, _charId: string): Promise<void> {
  const rotations = await mirror(b.id, _images);
  // 표시 방향 = 우승자 아바타의 active_direction(같은 방향). 없으면 south 폴백.
  const dir = await getChampionDirection(b.championUserId);
  const chosen = rotations[dir] ?? rotations.south;
  if (!chosen) throw new Error('mirror missing chosen/south');

  // 트로피 아바타는 finale.trophyAvatar에만 저장 — 대난투 포디움/우승카드/역대우승자 표시 전용.
  // 우승자에게 아바타로 지급하지 않음(2026-06-04 피드백 — 우편/앱알림 폐기). 전투 재생은 원본 아바타.
  const finale = b.finale;
  if (finale) finale.trophyAvatar = chosen;
  await db
    .update(meleeBattles)
    .set({ finale, trophyStatus: 'done', trophyUpdatedAt: new Date() })
    .where(eq(meleeBattles.id, b.id));

  console.log(`[melee.trophy] battle ${b.id} DONE — trophyAvatar 저장(지급 없음)`);
}

async function processOne(b: TrophyBattle): Promise<void> {
  // 미시작 → 첫 시도.
  if (!b.trophyStatus) {
    await startAttempt(b, 1);
    return;
  }
  if (b.trophyStatus !== 'generating' || !b.trophyCharId) return;

  const ready = await fetchReady(b.trophyCharId);

  if (ready === 'pending') {
    // 타임아웃 시 재시도.
    const ageMin = (Date.now() - (b.trophyUpdatedAt?.getTime() ?? 0)) / 60_000;
    if (ageMin > GEN_TIMEOUT_MIN) {
      console.warn(`[melee.trophy] battle ${b.id} timeout ${ageMin.toFixed(0)}min → 재시도`);
      await startAttempt(b, b.trophyAttempts + 1);
    }
    return;
  }
  if (ready === 'gone') {
    await startAttempt(b, b.trophyAttempts + 1);
    return;
  }

  // 8방향 완성 → AI 검토.
  let pass = false;
  try {
    const review = await reviewProfile({
      images: ready.map((im) => ({ direction: im.direction, png: im.png })),
      descriptionPrompt: REVIEW_DESCRIPTION,
    });
    pass = review.verdict.pass;
    if (!pass) console.warn(`[melee.trophy] battle ${b.id} AI reject: ${review.verdict.notes}`);
  } catch (e) {
    console.warn(`[melee.trophy] battle ${b.id} review error`, (e as Error).message);
    return; // transient — 다음 tick 재시도(상태 유지).
  }

  if (pass) {
    await finalize(b, ready, b.trophyCharId);
  } else {
    await startAttempt(b, b.trophyAttempts + 1);
  }
}

/** cron 진입 — 최근(오늘±1일) 챔피언 배틀 중 미완 트로피 처리. */
export async function processTrophies(): Promise<{ processed: number }> {
  const rows = await db
    .select({
      id: meleeBattles.id,
      championUserId: meleeBattles.championUserId,
      finale: meleeBattles.finale,
      trophyStatus: meleeBattles.trophyStatus,
      trophyCharId: meleeBattles.trophyCharId,
      trophyAttempts: meleeBattles.trophyAttempts,
      trophyUpdatedAt: meleeBattles.trophyUpdatedAt,
    })
    .from(meleeBattles)
    .where(
      and(
        isNotNull(meleeBattles.championUserId),
        or(isNull(meleeBattles.trophyStatus), eq(meleeBattles.trophyStatus, 'generating')),
        // ⚠ 구 배틀(컬럼 신설로 trophy_status=null) 일괄 생성 방지 — 최근만.
        sql`${meleeBattles.battleDate} >= (now() at time zone 'Asia/Seoul')::date - 1`,
      ),
    )
    .orderBy(desc(meleeBattles.battleDate))
    .limit(3);

  let processed = 0;
  for (const r of rows) {
    if (!r.championUserId) continue;
    try {
      await processOne(r as TrophyBattle);
      processed += 1;
    } catch (e) {
      console.error(`[melee.trophy] battle ${r.id} error`, (e as Error).message);
    }
  }
  return { processed };
}
