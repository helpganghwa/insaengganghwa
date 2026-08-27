/**
 * PROFILE §2 핵심 흐름 — Pixellab v2 큐 등록 + 폴링 + south 정면 다운로드 + Supabase
 * Storage 미러링 + Claude vision 자동 검토 + 분기(accepted/rejected_ai/failed).
 *
 * cron(`/api/cron/profile-poll`)에서 호출:
 *  - 발주(queued→starting→downloading)는 v3(pipeline-v3.ts drainQueue)가 담당.
 *  - pollAndProcessDownloading(): status='downloading' N건 → 폴링 → 완료시 process(이 파일).
 *
 * 외부 의존:
 *  - Pixellab v2 API (PIXELLAB_API_KEY) — GET /characters/{id} 폴링
 *  - Supabase Storage bucket `profiles` (public, 사용자 수동 생성)
 *  - Claude vision (ANTHROPIC_API_KEY) — ai-review.ts (모델 ID는 ai-review.ts MODEL_ID 단일 출처)
 */
import 'server-only';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { walletAdd } from '@/lib/game/wallet';
import { profileGenerationJobs, userProfiles } from '@/lib/db/schema/avatar';
import { mailbox } from '@/lib/db/schema/mailbox';

import { filterByActiveServer, sendPushToUser } from '@/lib/push/send';

import { reviewProfile, ReviewVerdictSchema, type ReviewVerdict } from './ai-review';
import { pixellabKeyByIdx, keyIdxFromOptions } from './pixellab-keys';
import { anyBackgroundOpaque } from './bg-alpha';
import { detectFullBodyCrop } from './crop-check';
import { detectFaceBox, reconcileFaceBox, type FaceBox } from './face-box';
import { renderFaceThumb } from './face-thumb';
import { generationAgeMin } from './gen-age';

/** 검토 결과 push — 실패는 무시(전체 흐름 막지 않음). 토글·구독은 sendPushToUser가 처리. */
async function safePush(
  userId: string,
  serverId: number,
  title: string,
  body: string,
  url = '/me',
): Promise<void> {
  try {
    // 경계규칙 1 — 잡의 서버가 활성(last_server_id)인 유저에게만.
    const [target] = await filterByActiveServer([userId], serverId);
    if (!target) return;
    await sendPushToUser(userId, {
      category: 'profile',
      title,
      body,
      url,
      tag: 'profile',
    });
  } catch (e) {
    console.error('[profile-poll] push failed:', (e as Error).message);
  }
}

/**
 * Storage write·read는 service_role 클라이언트 사용. cron/script context엔
 * Next request scope(cookies)가 없으므로 `createSupabaseServerClient()` 사용 불가.
 * RLS 우회 + cookies 의존 X.
 */
let _serviceClient: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE service env missing');
  _serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}

// ─── 상수 ───

/**
 * 머리 높이 상한(전신 대비) — 이 값 이상이면 인체 비율 붕괴로 리젝(전액 환불 후 재생성 유도).
 *
 * ⚠ 이 값은 검수기(Claude vision)의 **추정치**라 잡음이 크다. A/B 실측(2026-08-06):
 * 눈으로 멀쩡한 이미지가 0.17~0.19를 오갔고, 같은 이미지를 실루엣으로 재면 7.3등신인데
 * 검수기는 0.22(4.5등신)를 냈다 — 검수기는 머리+머리카락 덩어리를 재기 때문이다.
 * 그래서 임계는 **눈에 띄게 무너진 것만** 걸리도록 보수적으로 잡는다. 0.19로 잡으면
 * 정상 산출물(0.19)까지 리젝해 유저에게 재생성 왕복을 강요한다.
 * 0.21 = 실측 분포(n=580) 상위 0.3%. 제보 사례(0.22)는 걸리고 정상군은 통과한다.
 */
const HEAD_RATIO_MAX = 0.21;
const PIXELLAB_BASE = 'https://api.pixellab.ai/v2';
export const STORAGE_BUCKET = 'profiles';

/**
 * downloading 상태 상한(분). **발주 시각 기준**(gen-age.ts — 큐 대기는 별도 예산이다).
 * pixellab pro 평균 ~6분이라 3배 여유. 초과 시 rotation 완성 여부와 무관하게 fail+환불 —
 * rotation_urls는 떴지만 실제 파일이 영원히 404인 부분 실패(검증된 케이스)까지 잡기 위해
 * length 조건과 분리.
 */
const PROFILE_GEN_TIMEOUT_MIN = 20;

/**
 * 폴링 한 번의 벽시계 예산(ms). 크론 maxDuration 90초를 drainQueue(35초)와 나눠 쓴다.
 * 한 건이 다운로드 + vision 검토 + sharp + 업로드 + 트랜잭션이라 완성 잡이 몰리면 5건만으로도
 * 이 예산을 넘긴다. 절단은 무해하다 — 남은 잡은 downloading으로 남아 다음 tick(2분)이 잇고,
 * 검토 결과는 이미 잡에 기록돼 재호출이 무료다.
 *
 * ⚠ drainQueue의 예산과 같은 한계 — 검사가 **각 건 시작 전**에만 이뤄져 진행 중이던 한 건만큼은
 * 넘칠 수 있다. 정확한 상한이 아니라 무한정 돌지 않게 하는 장치다.
 */
const POLL_BUDGET_MS = 45_000;

/** PNG 매직 넘버(89 50 4E 47) 검증 — pixellab이 404 JSON/빈 파일을 줄 때 깨진 업로드 방지. */
function isPng(buf: Buffer): boolean {
  return (
    buf.length >= 67 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  );
}

interface PixellabCharacterDetail {
  id: string;
  rotation_urls: Record<string, string | null>;
}

// ─── 폴링 + 처리 — status='downloading' N건 ───

/**
 * 동시성 — 이 함수는 잡을 잠그지 않고 select 후 느린 외부 호출(폴링·다운로드·AI검토)을 거쳐 terminal
 * 전이(accept/reject/fail)한다. 두 방어선이 동시처리 시 프로필 중복생성·이중환불을 막는다:
 *  ① 구조적(주방어, 감사 #2): accept/reject/markFailed 모두 **claim-first 조건부 전이**
 *     (`update … where status IN(...) returning` → 0행이면 즉시 종료)라, 두 워커가 같은 잡을 잡아도
 *     지급·환불·프로필생성은 **정확히 1회**만 일어난다.
 *  ② 운영적(보조): 유일 호출자가 profile-poll cron(2분=120s)이고 maxDuration=90s라 연속 invocation이
 *     절대 겹치지 않으며 루프 내 처리도 순차 — 애초에 동시 진입이 거의 없다.
 *
 * 🔒 새 호출자/병렬 처리를 추가하더라도 ①의 조건부 전이가 멱등을 보장하나, ②가 깨지면 락 경합·중복
 *    외부호출(Pixellab/AI 비용) 증가가 따르므로 동시 실행은 여전히 지양할 것.
 */
export async function pollAndProcessDownloading(limit = 5): Promise<{
  polled: number;
  accepted: number;
  rejected: number;
  failed: number;
  stillProcessing: number;
  /** 예산에 걸려 남은 잡을 다음 tick으로 넘겼는지 — 조용한 절단이 되지 않도록 응답에 싣는다. */
  budgetHit: boolean;
}> {
  if (!process.env.PIXELLAB_API_KEY) throw new Error('PIXELLAB_API_KEY missing');

  const started = Date.now();
  let budgetHit = false;

  const due = await db
    .select({
      id: profileGenerationJobs.id,
      userId: profileGenerationJobs.userId,
      characterId: profileGenerationJobs.pixellabCharacterId,
      backgroundJobId: profileGenerationJobs.pixellabBackgroundJobId,
      description: profileGenerationJobs.descriptionPrompt,
      options: profileGenerationJobs.options,
      equipmentSnapshot: profileGenerationJobs.equipmentSnapshot,
      diamondEscrow: profileGenerationJobs.diamondEscrow,
      serverId: profileGenerationJobs.serverId,
      createdAt: profileGenerationJobs.createdAt,
      aiVerdict: profileGenerationJobs.aiVerdict,
    })
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.status, 'downloading'))
    .orderBy(profileGenerationJobs.createdAt)
    .limit(limit);

  let accepted = 0;
  let rejected = 0;
  let failed = 0;
  let stillProcessing = 0;

  for (const job of due) {
    // 예산 초과 — 남은 잡은 downloading으로 남아 다음 tick이 잇는다(검토 결과가 이미 기록돼 재개가 싸다).
    if (Date.now() - started > POLL_BUDGET_MS) {
      budgetHit = true;
      break;
    }
    if (!job.characterId) {
      // 한 건의 환불 실패가 폴링 배치 전체를 죽이지 않게 격리(전수 감사 2026-08-21).
      await markFailedAndRefund(job.id, job.userId, 'Pixellab character_id missing').catch((e) =>
        console.error('[profile-poll] refund failed', String(job.id), e),
      );
      failed += 1;
      continue;
    }

    // Timeout 가드 — 반드시 fetch/분기보다 **앞**. charRes가 지속 5xx/429거나 throw(네트워크)여도
    // 아래에 도달 못해 escrow(다이아)가 영구 동결되고 활성 UNIQUE로 재생성까지 막히던 회귀 차단.
    // rotation_urls는 떴으나 실파일이 영원히 404인 부분 실패까지 포함해 20분 초과 잡을 환불·정리.
    // ⚠ 기준은 created_at이 아니라 **발주 시각**이다 — 큐 대기가 이 예산을 잠식하면 안 된다(gen-age.ts).
    const ageMin = generationAgeMin(job.options, job.createdAt, Date.now());
    if (ageMin > PROFILE_GEN_TIMEOUT_MIN) {
      await markFailedAndRefund(job.id, job.userId, `Pixellab timeout/stall ${ageMin.toFixed(0)}min`).catch(
        (e) => console.error('[profile-poll] refund failed', String(job.id), e),
      );
      failed += 1;
      continue;
    }

    // character endpoint로 polling — rotation_urls 완성도가 완료 신호.
    // (background-jobs는 만료/404 가능, v2 character 응답엔 status 필드 없음 —
    //  rotation_urls의 string 갯수 8이면 completed, 미만이면 pending.)
    // ⚠️ 생성에 쓴 키로만 조회 가능 → 잡 options의 keyIdx로 키 선택(레거시=key1).
    const jobKey = pixellabKeyByIdx(keyIdxFromOptions(job.options));
    let charRes: Response;
    try {
      charRes = await fetch(`${PIXELLAB_BASE}/characters/${job.characterId}`, {
        headers: { authorization: `Bearer ${jobKey}` },
      });
    } catch {
      // 네트워크/DNS/reset — 이 잡만 다음 tick 재시도(위 타임아웃 가드가 20분 후 정리).
      // throw가 배치 전체를 중단시켜 선두 잡이 뒤 잡을 head-of-line 블록하던 것도 방지.
      stillProcessing += 1;
      continue;
    }
    if (!charRes.ok) {
      if (charRes.status === 404) {
        await markFailedAndRefund(job.id, job.userId, `Pixellab character not found (${charRes.status})`).catch(
          (e) => console.error('[profile-poll] refund failed', String(job.id), e),
        );
        failed += 1;
      } else {
        stillProcessing += 1;
      }
      continue;
    }
    let char: PixellabCharacterDetail;
    try {
      char = (await charRes.json()) as PixellabCharacterDetail;
    } catch {
      // 200이지만 본문 파싱 실패(잘림 등) — 배치 중단 없이 다음 tick 재시도(20분 초과 시 타임아웃 가드가 정리).
      stillProcessing += 1;
      continue;
    }

    if (!char.rotation_urls) {
      stillProcessing += 1;
      continue;
    }
    // 정면(south)만 사용 — v3 8방향 중 측/후면 품질이 낮아 정면만 저장·표시(회전 미사용, 2026-06-22).
    const southUrl = (typeof char.rotation_urls.south === 'string' && char.rotation_urls.south) || '';
    if (!southUrl) {
      stillProcessing += 1;
      continue;
    }

    try {
      const r = await fetch(southUrl);
      if (!r.ok) {
        // rotation_urls는 떴지만 실파일 아직 404(검증된 케이스) — 다음 tick 재시도.
        stillProcessing += 1;
        continue;
      }
      const png = Buffer.from(await r.arrayBuffer());
      if (!isPng(png)) {
        stillProcessing += 1;
        continue;
      }

      // 유상 vision 재호출 차단 — 아래 저장·전이(Storage 업로드·DB tx)가 던지면 catch가 이 잡을
      // downloading으로 남겨 2분 뒤 여기로 다시 온다. 그때마다 검토를 다시 부르면 같은 이미지에
      // 20분 예산 안에서 열 번까지 과금된다. 받아 둔 판정이 있으면 그대로 쓴다.
      // (배경 불투명·잘림·비율 같은 로컬 판정은 png로 매번 다시 계산 — 무료다.)
      const cachedVerdict = ReviewVerdictSchema.safeParse(job.aiVerdict);
      let reviewed: ReviewVerdict;
      if (cachedVerdict.success) {
        reviewed = cachedVerdict.data;
      } else {
        reviewed = (
          await reviewProfile({
            images: [{ direction: 'south', png }],
            descriptionPrompt: job.description,
          })
        ).verdict;
        // 분기보다 **먼저** 기록해야 재시도가 주워 쓸 수 있다. downloading일 때만 —
        // 그 사이 종단으로 갔다면 남의 결과를 덮어쓰지 않는다.
        await db
          .update(profileGenerationJobs)
          .set({ aiVerdict: reviewed })
          .where(
            and(eq(profileGenerationJobs.id, job.id), eq(profileGenerationJobs.status, 'downloading')),
          );
      }

      // 결정론 선차단 — AI 비전이 못 잡는 두 결함을 alpha로 직접 검사:
      //  ① 불투명 배경(no_background 실패)  ② 전신 잘림(하반신이 프레임 밖으로 잘림).
      // 검수기(ai-review)는 안전+해부학 모더레이터라 프레이밍/잘림을 판정하지 않는다.
      const [bgOpaque, cropResult] = await Promise.all([anyBackgroundOpaque([png]), detectFullBodyCrop(png)]);
      const cropped = cropResult.cropped;
      // ③ 인체 비율 붕괴(2026-08-06) — 프롬프트는 7~7.5등신을 요구하는데 생성기가 5등신 이하로
      // 뽑는 경우가 있다(실측: 중앙 6.5등신, 상위 3%가 5.3등신 이하). 검수기는 "비율로는 실패시키지
      // 말라"는 안전 모더레이터라 이 결함을 통과시키므로, 검수기가 남긴 머리 박스 높이로 수치 판정한다.
      // 임계는 잡음을 감안해 보수적으로(HEAD_RATIO_MAX 주석 참조) — 리젝=전액 환불.
      const headH = reviewed.head?.h ?? null;
      const badRatio = headH !== null && headH >= HEAD_RATIO_MAX;

      if (reviewed.pass && !bgOpaque && !cropped && !badRatio) {
        // south 1장만 storage 미러 → rotations={south} (회전 미사용).
        const supabase = serviceClient();
        const path = `${job.userId}/${job.characterId}/south.png`;
        const up = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, png, { contentType: 'image/png', upsert: true, cacheControl: '604800' });
        if (up.error) throw new Error(`storage upload south: ${up.error.message}`);
        const rotations: Record<string, string> = {
          south: supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl,
        };
        // 얼굴 크롭 박스 — 실루엣 감지·AI 머리 박스 교차검증 + cx 런 스냅(2026-07-21 쩌내·SEB).
        const faceBox = await reconcileFaceBox(png, await detectFaceBox(png), reviewed.head ?? null);
        // 얼굴 썸네일 사전 생성(face-thumb.ts) — 실패해도 지급은 진행(클라가 CSS 크롭 폴백).
        try {
          const fpath = `${job.userId}/${job.characterId}/face.png`;
          const fup = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(fpath, await renderFaceThumb(png, faceBox), { contentType: 'image/png', upsert: true, cacheControl: '604800' });
          if (!fup.error) rotations.face = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fpath).data.publicUrl;
        } catch (fe) {
          console.warn('[profile-poll] face thumb 생성 실패(폴백 크롭 유지)', String(job.id), fe);
        }
        await acceptJob(job.id, job.serverId, job.userId, rotations, job.characterId, job.options, job.equipmentSnapshot, job.description, reviewed, faceBox);
        accepted += 1;
      } else {
        let verdict: ReviewVerdict = reviewed;
        if (bgOpaque)
          verdict = { ...verdict, pass: false, reasons: [...new Set([...verdict.reasons, 'quality' as const])], notes: verdict.notes || '배경이 투명하지 않습니다(불투명 배경 검출).' };
        if (cropped)
          verdict = { ...verdict, pass: false, reasons: [...new Set([...verdict.reasons, 'quality' as const])], notes: verdict.notes || '전신이 아닌 잘린 캐릭터입니다(하반신이 프레임에서 잘림).' };
        if (badRatio)
          verdict = { ...verdict, pass: false, reasons: [...new Set([...verdict.reasons, 'quality' as const])], notes: verdict.notes || `인체 비율이 무너졌습니다(머리 높이 ${(headH! * 100).toFixed(0)}% — 약 ${(1 / headH!).toFixed(1)}등신).` };
        await rejectJob(job.id, job.userId, job.serverId, job.diamondEscrow, verdict);
        rejected += 1;
      }
    } catch (e) {
      // Storage·Review 실패 — transient 가능성이라 status 유지 (다음 iteration에 재시도).
      // 다만 너무 많은 재시도는 별도 처리 필요 (v1 단순).
      console.error(`[profile-poll] job ${job.id} processing error:`, (e as Error).message);
      stillProcessing += 1;
    }
  }

  if (budgetHit) {
    console.warn(
      `[profile-poll] budget hit after ${Date.now() - started}ms — polled=${accepted + rejected + failed + stillProcessing}/${due.length}, 나머지는 다음 tick`,
    );
  }
  return { polled: due.length, accepted, rejected, failed, stillProcessing, budgetHit };
}

// ─── helpers ───

async function acceptJob(
  jobId: bigint,
  serverId: number,
  userId: string,
  rotations: Record<string, string>,
  characterId: string,
  options: unknown,
  equipmentSnapshot: unknown,
  descriptionPrompt: string,
  verdict: ReviewVerdict,
  faceBox: FaceBox | null,
): Promise<void> {
  // 얼굴 크롭 박스(원본 south 결정론 검출)를 options.faceBox로 동봉 — 헤더/친구 썸네일 정밀 크롭.
  // apexAtCreation은 잡 전용 판정 플래그 — 프로필 options(공개 직렬화 대상)에는 싣지 않는다
  // (히든 칭호 트리거 노출 방지). 지급 판정은 아래에서 잡 options로 한다.
  const { apexAtCreation: _apex, ...baseOptions } = (options ?? {}) as Record<string, unknown>;
  const optionsWithFace = faceBox ? { ...baseOptions, faceBox } : baseOptions;
  await db.transaction(async (tx) => {
    // 조건부 클레임 먼저(감사 #2) — downloading인 경우만 accepted로 전이. 0행이면 다른 워커가
    // 이미 처리한 것(P1 불변식 위반 시) → 프로필 중복생성 방지로 즉시 종료. userProfileId는
    // 프로필 insert 후 backfill.
    const claimed = await tx
      .update(profileGenerationJobs)
      .set({ status: 'accepted', aiVerdict: verdict, resolvedAt: sql`now()` })
      .where(
        and(eq(profileGenerationJobs.id, jobId), eq(profileGenerationJobs.status, 'downloading')),
      )
      .returning({ id: profileGenerationJobs.id });
    if (claimed.length === 0) return;

    const [profile] = await tx
      .insert(userProfiles)
      .values({
        userId,
        serverId,
        rotations,
        activeDirection: 'south',
        pixellabCharacterId: characterId,
        options: optionsWithFace,
        equipmentSnapshot,
        descriptionPrompt,
      })
      .returning({ id: userProfiles.id });

    await tx
      .update(profileGenerationJobs)
      .set({ userProfileId: profile!.id })
      .where(eq(profileGenerationJobs.id, jobId));

    // 칭호 '전성기의 초상'(0166 해소) — 생성 시점 +100×3 장착 플래그(createProfileJob 스냅샷)가
    // 있으면 수락 순간 지급. 거절·실패는 "생성"이 아니므로 미지급 — cond와 1:1.
    if ((options as Record<string, unknown> | null)?.apexAtCreation === true) {
      await tx.execute(sql`
        insert into user_titles (user_id, server_id, title_code)
        values (${userId}::uuid, ${serverId}, 'apex_shoot')
        on conflict do nothing
      `);
    }

    // 첫 프로필이면 자동 active — escrow 차감 서버의 캐릭터에. 대표가 바뀌는 것이므로
    // 유지 시작(0166, 한결같은 얼굴 판정)도 함께 리셋.
    await tx
      .update(characters)
      .set({ activeProfileId: profile!.id, activeProfileSince: sql`now()` })
      .where(
        and(
          eq(characters.userId, userId),
          eq(characters.serverId, serverId),
          sql`${characters.activeProfileId} IS NULL`,
        ),
      );

    await tx.insert(mailbox).values({
      userId,
      serverId,
      type: 'profile_accepted',
      title: '아바타 생성 완료',
      body: '새 아바타가 목록에 추가되었습니다. 아바타 목록에서 확인해 보세요.',
      senderLabel: '인생강화',
      payload: {},
    });
  });
  await safePush(userId, serverId, '프로필 생성 완료', '새 프로필이 목록에 추가되었어요. 확인해 보세요!', '/me/profiles');
}

/**
 * 운영자 분쟁 처리 — AI가 거절했지만 실제로 문제 없는 아바타를 직접 지급(다이아 차감 없음).
 * Pixellab 캐릭터에서 정면(south)을 Storage로 미러링 → user_profiles 생성 → 목록 추가 + 우편.
 * AI 거절 시 escrow는 이미 환불됐으므로 추가 차감/환불 없음(순수 지급).
 */
export async function adminGrantAvatarForJob(jobId: bigint): Promise<{ ok: boolean; msg?: string }> {
  const [job] = await db
    .select()
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.id, jobId))
    .limit(1);
  if (!job) return { ok: false, msg: '작업을 찾을 수 없습니다.' };
  if (job.userProfileId) return { ok: false, msg: '이미 아바타가 지급되어 있습니다.' };
  if (!job.pixellabCharacterId) return { ok: false, msg: 'Pixellab 캐릭터 정보가 없어 지급할 수 없습니다.' };

  if (!process.env.PIXELLAB_API_KEY) return { ok: false, msg: 'PIXELLAB_API_KEY 미설정' };
  // ⚠️ 생성에 쓴 키로만 조회 가능 → 잡 options의 keyIdx로 키 선택(레거시=key1).
  const key = pixellabKeyByIdx(keyIdxFromOptions(job.options));

  const charRes = await fetch(`${PIXELLAB_BASE}/characters/${job.pixellabCharacterId}`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!charRes.ok) return { ok: false, msg: `Pixellab 캐릭터 조회 실패 (HTTP ${charRes.status})` };
  const char = (await charRes.json()) as PixellabCharacterDetail;

  // 정면(south)만 사용 — 회전 미사용(2026-06-22).
  const southUrl = (typeof char.rotation_urls?.south === 'string' && char.rotation_urls.south) || '';
  if (!southUrl) return { ok: false, msg: '정면 이미지가 완성되지 않아 지급할 수 없습니다.' };
  const sres = await fetch(southUrl);
  if (!sres.ok) return { ok: false, msg: `정면 이미지 다운로드 실패 (HTTP ${sres.status})` };
  const spng = Buffer.from(await sres.arrayBuffer());
  if (!isPng(spng)) return { ok: false, msg: '정면 이미지가 유효하지 않습니다.' };
  const supabase = serviceClient();
  const spath = `${job.userId}/${job.pixellabCharacterId}/south.png`;
  const sup = await supabase.storage.from(STORAGE_BUCKET).upload(spath, spng, { contentType: 'image/png', upsert: true, cacheControl: '604800' });
  if (sup.error) return { ok: false, msg: `이미지 미러링 실패: ${sup.error.message}` };
  const rotations: Record<string, string> = {
    south: supabase.storage.from(STORAGE_BUCKET).getPublicUrl(spath).data.publicUrl,
  };
  const faceBox = await reconcileFaceBox(spng, await detectFaceBox(spng), null);
  // 얼굴 썸네일 — accept 경로와 동일(실패는 무시, 클라 CSS 크롭 폴백).
  try {
    const fpath = `${job.userId}/${job.pixellabCharacterId}/face.png`;
    const fup = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(fpath, await renderFaceThumb(spng, faceBox), { contentType: 'image/png', upsert: true, cacheControl: '604800' });
    if (!fup.error) rotations.face = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fpath).data.publicUrl;
  } catch (fe) {
    console.warn('[admin-grant] face thumb 생성 실패(폴백 크롭 유지)', String(jobId), fe);
  }
  // apexAtCreation은 잡 전용 판정 플래그 — 프로필 options에는 싣지 않는다(acceptJob과 동일).
  const { apexAtCreation: _apex, ...adminBase } = (job.options ?? {}) as Record<string, unknown>;
  const adminOptions = faceBox ? { ...adminBase, faceBox } : adminBase;

  const granted = await db.transaction(async (tx) => {
    // 조건부 클레임 먼저(회수 경로와 동일 패턴) — 위 게이트(:377)는 비잠금 read인 데다 그 뒤로
    // 외부 I/O 4단계(Pixellab 조회·다운로드·Storage 업로드·얼굴 검출)가 있어 창이 넓다. 동시
    // 두 요청이 둘 다 통과하면 user_profiles에 두 행이 생기고(커스텀 아바타엔 유니크가 없다 —
    // uq_default_avatar_per_char는 기본 아바타 전용), 뒤엣것이 user_profile_id를 덮어써 앞엣것은
    // 어떤 잡에도 안 묶인 고아가 된다(회수로도 못 지운다).
    // backfill이 같은 tx라, 진 쪽은 커밋된 non-null을 보고 0행이 된다.
    const claimed = await tx
      .update(profileGenerationJobs)
      .set({ adminDecision: 'grant', adminReviewedAt: new Date() })
      .where(and(eq(profileGenerationJobs.id, jobId), isNull(profileGenerationJobs.userProfileId)))
      .returning({ id: profileGenerationJobs.id });
    if (claimed.length === 0) return false;

    const [profile] = await tx
      .insert(userProfiles)
      .values({
        userId: job.userId,
        serverId: job.serverId,
        rotations,
        activeDirection: 'south',
        pixellabCharacterId: job.pixellabCharacterId!,
        options: adminOptions,
        equipmentSnapshot: job.equipmentSnapshot,
        descriptionPrompt: job.descriptionPrompt,
      })
      .returning({ id: userProfiles.id });

    // 상태(rejected_ai 등)는 분쟁 이력 보존을 위해 유지 — 지급 사실은 adminDecision으로 기록.
    await tx
      .update(profileGenerationJobs)
      .set({ userProfileId: profile!.id })
      .where(eq(profileGenerationJobs.id, jobId));

    // 칭호 '전성기의 초상' — 어드민 구제 지급도 "생성 성공"이므로 동일 적용(잡 스냅샷 기준).
    if ((job.options as Record<string, unknown> | null)?.apexAtCreation === true) {
      await tx.execute(sql`
        insert into user_titles (user_id, server_id, title_code)
        values (${job.userId}::uuid, ${job.serverId}, 'apex_shoot')
        on conflict do nothing
      `);
    }

    // 첫 프로필이면 자동 active. 대표 변경이므로 유지 시작(0166)도 리셋.
    await tx
      .update(characters)
      .set({ activeProfileId: profile!.id, activeProfileSince: sql`now()` })
      .where(
        and(
          eq(characters.userId, job.userId),
          eq(characters.serverId, job.serverId),
          sql`${characters.activeProfileId} IS NULL`,
        ),
      );

    await tx.insert(mailbox).values({
      userId: job.userId,
      serverId: job.serverId,
      type: 'admin',
      title: '아바타 지급 안내',
      body: '안녕하세요, 운영팀입니다.\n\n생성하신 아바타를 운영팀이 직접 확인한 결과 문제가 없어 정상 지급해 드렸습니다.\n다이아 추가 차감 없이 아바타 목록에 추가되었으니 확인해 보세요.\n\n불편을 드려 죄송합니다. 감사합니다.',
      senderLabel: '운영자',
      payload: {},
    });
    return true;
  });
  // 운영자 결정은 우편으로만 통지 — 푸시 없음(사용자 결정).
  if (!granted) return { ok: false, msg: '이미 아바타가 지급되어 있습니다(동시 요청).' };
  return { ok: true };
}

async function rejectJob(
  jobId: bigint,
  userId: string,
  serverId: number,
  escrow: bigint,
  verdict: ReviewVerdict,
): Promise<void> {
  // 상세 사유(notes)는 운영자 분쟁처리(admin)·감사용으로 rejectReason/aiVerdict에만 보존하고,
  // 유저 우편은 운영자 리젝과 동일한 공통 안내문구로 표시(상세 결함 미노출).
  const notes = verdict.notes || '검토 기준에 부합하지 않습니다.';
  const userBody =
    '생성하신 아바타가 검토 기준에 부합하지 않아 적용되지 않았어요.\n사용하신 다이아는 전액 환불해 드렸으니, 환불 다이아로 언제든 다시 생성하실 수 있습니다.\n\n불편을 드려 죄송합니다.';
  const did = await db.transaction(async (tx) => {
    // 조건부 클레임 먼저(감사 #2, money path) — downloading일 때만 rejected_ai로 전이. 0행이면
    // 다른 워커가 이미 처리(P1 불변식 위반 시) → 환불 skip해 이중환불 방지.
    const claimed = await tx
      .update(profileGenerationJobs)
      .set({
        status: 'rejected_ai',
        aiVerdict: verdict,
        rejectReason: notes,
        resolvedAt: sql`now()`,
      })
      .where(
        and(eq(profileGenerationJobs.id, jobId), eq(profileGenerationJobs.status, 'downloading')),
      )
      .returning({ id: profileGenerationJobs.id });
    if (claimed.length === 0) return false;

    // 환불 — escrow가 차감된 서버(잡 행 기록)로 반환.
    // ref는 잡 단위로 — 분쟁 조사는 '이 생성이 받아간 것과 되돌려준 것'을 맞춰보는 일이라
    // 차감(avatar_create)·환불(avatar_refund)이 같은 축으로 묶여야 한다(어드민 회수 경로와 동일 형식).
    await walletAdd(tx, userId, serverId, escrow, 'avatar_refund', `job:${jobId}`);

    await tx.insert(mailbox).values({
      userId,
      serverId,
      type: 'profile_rejected_ai',
      title: '아바타 검토 미통과',
      body: userBody,
      senderLabel: '인생강화',
      payload: {},
    });
    return true;
  });
  if (did) {
    await safePush(userId, serverId, '아바타 검토 미통과', '검토를 통과하지 못해 다이아를 환불했어요. 우편함을 확인하세요.', '/mail');
  }
}

export async function markFailedAndRefund(jobId: bigint, userId: string, reason: string): Promise<void> {
  // 작업 정보 조회.
  const [job] = await db
    .select({
      escrow: profileGenerationJobs.diamondEscrow,
      status: profileGenerationJobs.status,
      serverId: profileGenerationJobs.serverId,
    })
    .from(profileGenerationJobs)
    .where(eq(profileGenerationJobs.id, jobId));
  if (!job || job.status === 'failed' || job.status === 'rejected_ai' || job.status === 'accepted') return;

  const did = await db.transaction(async (tx) => {
    // 조건부 클레임 먼저(감사 #2, money path) — 비종단(queued/starting/downloading)일 때만 failed로 전이.
    // 0행이면 다른 워커가 이미 처리(P1 불변식 위반·동시 P2 타임아웃 등) → 환불 skip해 이중환불 방지.
    // 호출처: queued(P2 타임아웃)·starting(발주 실패/스윕)·downloading(poll 실패).
    const claimed = await tx
      .update(profileGenerationJobs)
      .set({
        status: 'failed',
        rejectReason: reason.slice(0, 500),
        resolvedAt: sql`now()`,
      })
      .where(
        and(
          eq(profileGenerationJobs.id, jobId),
          inArray(profileGenerationJobs.status, ['queued', 'starting', 'downloading']),
        ),
      )
      .returning({ id: profileGenerationJobs.id });
    if (claimed.length === 0) return false;

    await walletAdd(tx, userId, job.serverId, job.escrow, 'avatar_refund', `job:${jobId}`);

    await tx.insert(mailbox).values({
      userId,
      serverId: job.serverId,
      type: 'profile_failed',
      title: '아바타 생성 시스템 오류',
      body: '생성 도중 시스템 오류가 발생해 다이아가 전액 환불되었습니다.\n다시 시도해 주세요.',
      senderLabel: '인생강화',
      payload: {},
    });
    return true;
  });
  if (did) {
    await safePush(userId, job.serverId, '아바타 생성 실패', '시스템 오류로 다이아를 환불했어요. 다시 시도해 주세요.', '/mail');
  }
}
