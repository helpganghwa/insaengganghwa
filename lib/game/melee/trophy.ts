import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { meleeBattles, type MeleeFinale } from '@/lib/db/schema/melee';
import { userProfiles } from '@/lib/db/schema/avatar';
import { reviewProfile } from '@/lib/game/profile/ai-review';
import { anyBackgroundOpaque } from '@/lib/game/profile/bg-alpha';
import { detectFaceBox } from '@/lib/game/profile/face-box';
import { pixellabKeyByIdx, keyIdxFromOptions } from '@/lib/game/profile/pixellab-keys';

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
    edit: 'the character holds up a plain smooth golden trophy cup with no engravings or patterns in one hand, clearly visible at chest height; any staff, wand or weapon previously in hand is removed and replaced by this golden trophy cup',
  },
  {
    tag: 'chest',
    edit: 'the character cradles a plain smooth golden trophy cup with no engravings or patterns against the chest with both arms, clearly visible; any staff, wand or weapon previously in hand is removed and replaced by this golden trophy cup',
  },
] as const;

const REVIEW_DESCRIPTION =
  'A victorious champion character holding a golden trophy cup in a celebration pose. Check the front (south) view for anatomical part-count defects (extra or missing arms/legs/heads).';

// 정면(south) 1방향만 — 8방향 미사용(아바타는 앞모습 하나로 통일).
const DIRECTIONS = ['south'] as const;

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

/**
 * 우승자 source 캐릭터 — 현재 활성 프로필의 pixellab 캐릭터(없으면 최근 프로필).
 * ⚠️ 캐릭터는 "생성한 키"로만 조회/파생 가능(계정 귀속) → 프로필 options의 pixellabKeyIdx를
 * 함께 반환해 create-state·폴링을 반드시 같은 키로 한다(키2 라운드로빈 대응).
 */
async function getSourceChar(
  userId: string,
  serverId: number,
): Promise<{ cid: string; keyIdx: number } | null> {
  const [p] = await db
    .select({ active: characters.activeProfileId })
    .from(characters)
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .limit(1);
  if (p?.active) {
    const [ap] = await db
      .select({ cid: userProfiles.pixellabCharacterId, options: userProfiles.options })
      .from(userProfiles)
      .where(eq(userProfiles.id, p.active))
      .limit(1);
    if (ap?.cid) return { cid: ap.cid, keyIdx: keyIdxFromOptions(ap.options) };
  }
  const [anyP] = await db
    .select({ cid: userProfiles.pixellabCharacterId, options: userProfiles.options })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  return anyP?.cid ? { cid: anyP.cid, keyIdx: keyIdxFromOptions(anyP.options) } : null;
}

// 한쪽 팔만 바꾸고 나머지(얼굴·표정·머리·복장·몸·자세·바라보는 방향)는 머리부터 발끝까지
// 원본 그대로 유지 — 우승자 본인과 동일하게(2026-06-06). 모든 포즈 edit에 공통 접미.
// '완전히 동일·nothing else'가 너무 강하면 pixellab이 트로피를 안 넣고 원본 소지품을
// 유지함(검증됨, battle1 재생성) → 소지품을 트로피로 교체하도록 edit에 명시하고, 보존은
// 얼굴·복장·하반신·자세·방향 위주로 완화.
const PRESERVE =
  ", while keeping the same face, expression, hair, outfit, legs, stance and the same facing direction as the original; change only the arm(s) and hand(s) now holding the trophy";

async function createState(sourceChar: string, edit: string, keyIdx: number): Promise<string> {
  const key = pixellabKeyByIdx(keyIdx); // 소스 캐릭터를 만든 키로만 파생 가능(계정 귀속).
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

let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  _anthropic = new Anthropic({ apiKey: key });
  return _anthropic;
}

/**
 * 트로피 가시성 검사 — create-state가 무기 교체 edit을 무시하고 원본 소지품을 유지하는
 * 결함(간헐, 검증됨: battle 11)이 공용 AI 검토(해부학 전용, 미학 일치 검사 금지)를 그대로
 * 통과하므로, 전용 게이트로 "황금 트로피가 실제로 보이는가"만 판정한다. south 1장 기준.
 */
async function trophyVisible(images: ReadyImages): Promise<boolean> {
  const south = images.find((im) => im.direction === 'south')?.png;
  if (!south) return false;
  const res = await anthropic().messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 64,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: south.toString('base64') },
          },
          {
            type: 'text',
            text: 'Is this character holding a golden trophy cup that is clearly visible? A sword, staff or any other weapon instead of a trophy means NO. Answer with JSON only: {"trophy": true|false}',
          },
        ],
      },
    ],
  });
  const raw = res.content.find((b) => b.type === 'text')?.text ?? '';
  const m = raw.match(/"trophy"\s*:\s*(true|false)/);
  return m?.[1] === 'true';
}

/** pixellab 캐릭터 폴링 — 정면(south) 실파일(PNG) 완성 시 buffer 배열, 아니면 pending/gone. */
async function fetchReady(charId: string, keyIdx: number): Promise<'pending' | 'gone' | ReadyImages> {
  const key = pixellabKeyByIdx(keyIdx); // 파생 캐릭터도 소스와 같은 키에 귀속 → 같은 키로 폴링.
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

/** 정면(south) PNG를 Supabase Storage에 미러 → 영구 public URL 맵. */
async function mirror(battleId: bigint, images: ReadyImages): Promise<Record<string, string>> {
  const sb = serviceClient();
  const rotations: Record<string, string> = {};
  for (const im of images) {
    const path = `melee-trophy/${battleId.toString()}/${im.direction}.png`;
    // 후보정(픽셀 부스러기 제거) 폐지(2026-06-19) — 의도된 반짝임·미세 디테일을 지워 역효과.
    // 원본 PNG 그대로 업로드.
    const { error } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(path, im.png, { contentType: 'image/png', upsert: true, cacheControl: '604800' });
    if (error) throw new Error(`storage ${im.direction}: ${error.message}`);
    rotations[im.direction] = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }
  return rotations;
}

type TrophyBattle = {
  id: bigint;
  serverId: number;
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
    // 조건부 전이 — 크론 겹침 시 다른 인스턴스가 이미 done으로 마감한 배틀을 stale 판정으로
    // failed로 덮지 않게(읽은 상태 그대로일 때만).
    await db
      .update(meleeBattles)
      .set({ trophyStatus: 'failed', trophyUpdatedAt: new Date() })
      .where(
        and(
          eq(meleeBattles.id, b.id),
          eq(meleeBattles.trophyStatus, 'generating'),
          eq(meleeBattles.trophyAttempts, nextAttempt - 1),
        ),
      );
    console.warn(`[melee.trophy] battle ${b.id} FAILED (attempts > ${MAX_ATTEMPTS})`);
    return;
  }
  // 클레임 먼저 — 크론 실행이 주기(3분)를 넘겨 다음 틱과 겹치면 두 인스턴스가 같은
  // 배틀로 유료 생성 POST를 이중 발사한다. 시도 번호 전이를 원자 조건부로 선점하고,
  // 0행이면 다른 인스턴스가 이미 진행 중 → 조용히 물러난다.
  const claim = await db
    .update(meleeBattles)
    .set({
      trophyStatus: 'generating',
      trophyCharId: null,
      trophyAttempts: nextAttempt,
      trophyUpdatedAt: new Date(),
    })
    .where(
      and(
        eq(meleeBattles.id, b.id),
        nextAttempt === 1
          ? isNull(meleeBattles.trophyStatus)
          : and(eq(meleeBattles.trophyStatus, 'generating'), eq(meleeBattles.trophyAttempts, nextAttempt - 1)),
      ),
    )
    .returning({ id: meleeBattles.id });
  if (claim.length === 0) {
    console.log(`[melee.trophy] battle ${b.id} attempt ${nextAttempt} 선점됨 — skip`);
    return;
  }
  const source = await getSourceChar(b.championUserId, b.serverId);
  if (!source) {
    // 조건부 전이 — 방금 이 인스턴스가 선점한 상태(generating, nextAttempt)일 때만 failed.
    await db
      .update(meleeBattles)
      .set({ trophyStatus: 'failed', trophyUpdatedAt: new Date() })
      .where(
        and(
          eq(meleeBattles.id, b.id),
          eq(meleeBattles.trophyStatus, 'generating'),
          eq(meleeBattles.trophyAttempts, nextAttempt),
        ),
      );
    console.warn(`[melee.trophy] battle ${b.id} FAILED (champion has no pixellab profile)`);
    return;
  }
  const pose = POSE_POOL[(Number(b.id % BigInt(POSE_POOL.length)) + nextAttempt) % POSE_POOL.length]!;
  // 알려진 한계: createState(유료 POST) 성공 ↔ 아래 charId 저장 사이 크래시 시 고아 클레임 —
  // 20분 타임아웃 재시도가 같은 attempt를 한 번 더 발사(이중 과금 가능, MAX_ATTEMPTS=3 상한).
  // 외부 POST를 tx로 감쌀 수 없는 구조적 트레이드오프로 수용(발생 시 크레딧 소액 손실뿐).
  const charId = await createState(source.cid, pose.edit, source.keyIdx);
  await db
    .update(meleeBattles)
    .set({
      trophyCharId: charId,
      trophyPose: pose.tag,
      trophyUpdatedAt: new Date(),
    })
    .where(eq(meleeBattles.id, b.id));
  console.log(`[melee.trophy] battle ${b.id} attempt ${nextAttempt} → ${charId} (${pose.tag})`);
}

/** 통과 — 미러 + finale.trophyAvatar 저장 → done. 우승자 지급(우편/푸시) 없음 — 트로피는 대난투 표시 전용. */
async function finalize(
  b: TrophyBattle,
  _images: ReadyImages,
  _charId: string,
  aiHead: { cx: number; cy: number; h: number } | null,
): Promise<void> {
  const rotations = await mirror(b.id, _images);
  // 트로피는 항상 정면(south) — 8방향 미사용(아바타 앞모습 통일).
  const chosen = rotations.south;
  if (!chosen) throw new Error('mirror missing south');

  // 트로피 얼굴중심 크롭용 박스 — AI 비전 머리 박스(모자·뿔 무시, 정확) 우선,
  // 없으면 표시 이미지 실루엣 detectFaceBox 폴백.
  let trophyFaceBox = aiHead;
  if (!trophyFaceBox) {
    const chosenPng = _images.find((im) => im.direction === 'south')?.png ?? null;
    if (chosenPng) {
      try {
        trophyFaceBox = await detectFaceBox(chosenPng);
      } catch {
        trophyFaceBox = null;
      }
    }
  }

  // 트로피 아바타는 finale.trophyAvatar에만 저장 — 대난투 포디움/우승카드/역대우승자 표시 전용.
  // 우승자에게 아바타로 지급하지 않음(2026-06-04 피드백 — 우편/앱알림 폐기). 전투 재생은 원본 아바타.
  const finale = b.finale;
  if (finale) {
    // 스토리지 경로는 battleId 고정(재생성 시 upsert 덮어쓰기)이라, 재생성해도 URL이 같으면
    // 브라우저·CDN이 옛 이미지를 7일 캐시로 계속 보여준다(검증됨). charId를 버전 쿼리로 붙여
    // 재생성마다 URL을 바꿔 캐시를 무력화한다.
    finale.trophyAvatar = `${chosen}?v=${_charId}`;
    finale.trophyFaceBox = trophyFaceBox;
  }
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
  if (b.trophyStatus !== 'generating') return;
  if (!b.trophyCharId) {
    // 클레임 직후 생성 POST가 실패해 남은 고아 클레임 — 타임아웃 경과 시 다음 시도로.
    const ageMin = (Date.now() - (b.trophyUpdatedAt?.getTime() ?? 0)) / 60_000;
    if (ageMin > GEN_TIMEOUT_MIN) await startAttempt(b, b.trophyAttempts + 1);
    return;
  }

  // 폴링도 소스 캐릭터를 만든 키로(계정 귀속). 활성 프로필의 keyIdx 재확인(없으면 key1 폴백).
  const source = await getSourceChar(b.championUserId, b.serverId);
  const ready = await fetchReady(b.trophyCharId, source?.keyIdx ?? 1);

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

  // 정면(south) 완성 → 배경 투명 검사(결정론) + AI 해부학 검토. 둘 중 하나라도 실패면 재시도.
  // 배경 불투명(no_background 실패)은 AI 비전이 못 잡으므로 alpha 검사로 선차단.
  if (await anyBackgroundOpaque(ready.map((im) => im.png))) {
    console.warn(`[melee.trophy] battle ${b.id} 배경 불투명 → 재시도`);
    await startAttempt(b, b.trophyAttempts + 1);
    return;
  }
  let pass = false;
  // AI 비전이 잡은 정면 머리 박스(모자·뿔 무시) — 트로피 얼굴중심 크롭에 사용(실루엣보다 정확).
  let aiHead: { cx: number; cy: number; h: number } | null = null;
  try {
    // 트로피 가시성 선검사 — edit 무시(원본 무기 유지) 결함은 해부학 검토를 통과하므로 먼저 차단.
    if (!(await trophyVisible(ready))) {
      console.warn(`[melee.trophy] battle ${b.id} 트로피 미표시(edit 무시) → 재시도`);
      await startAttempt(b, b.trophyAttempts + 1);
      return;
    }
    const review = await reviewProfile({
      images: ready.map((im) => ({ direction: im.direction, png: im.png })),
      descriptionPrompt: REVIEW_DESCRIPTION,
    });
    pass = review.verdict.pass;
    aiHead = review.verdict.head ?? null;
    if (!pass) console.warn(`[melee.trophy] battle ${b.id} AI reject: ${review.verdict.notes}`);
  } catch (e) {
    console.warn(`[melee.trophy] battle ${b.id} review error`, (e as Error).message);
    return; // transient — 다음 tick 재시도(상태 유지).
  }

  if (pass) {
    await finalize(b, ready, b.trophyCharId, aiHead);
  } else {
    await startAttempt(b, b.trophyAttempts + 1);
  }
}

/** cron 진입 — 최근(오늘±1일) 챔피언 배틀 중 미완 트로피 처리. */
export async function processTrophies(): Promise<{ processed: number }> {
  const rows = await db
    .select({
      id: meleeBattles.id,
      serverId: meleeBattles.serverId,
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
