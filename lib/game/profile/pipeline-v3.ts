// PROFILE v3 — create-character-v3 호출 헬퍼. **라이브 발주 단일 경로**(drainQueue: submit after() + cron profile-poll).
// 흐름: 랜덤 외형(appearance-v3) → Claude 조합(compose-v3) → create-character-v3 POST.
// 폴링/다운로드/미러링은 pipeline.ts의 rotation_urls 처리를 재사용(v3도 동일 GET 사용).
import 'server-only';

import { and, eq, inArray, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profileGenerationJobs } from '@/lib/db/schema/avatar';
import { CATALOG_ITEMS } from '@/lib/game/equipment/catalog';
import { PROFILE_GEN_PER_KEY } from '@/lib/game/balance';

import { composeV3Description } from './compose-v3';
import { pickRandomAppearance, type Appearance } from './appearance-v3';
import { markFailedAndRefund } from './pipeline';
import { pixellabKeyByIdx, pixellabKeyCount, profileGenConcurrency } from './pixellab-keys';
import type { ProfileGender } from './refs';

const WORN_BY_KEY = new Map(CATALOG_ITEMS.map((c) => [c.key, c.wornDesc ?? c.art]));
const wornOf = (key: string | undefined): string => (key ? (WORN_BY_KEY.get(key) ?? key) : '');

const PIXELLAB_BASE = 'https://api.pixellab.ai/v2';
// 확정: 256 정사각(최대 area·디테일·기존 정사각 아바타 통합) + 전신은 프롬프트 강제.
const V3_SIZE = 256;

/**
 * queued 상태 상한(분, createdAt 기준). downloading의 PROFILE_GEN_TIMEOUT_MIN(20분)과 대칭(감사 P2).
 * createCharacterV3가 hang(throw 아님)하면 oldest queued가 매 tick 재픽업되며 큐 전체를
 * head-of-line 차단 + 활성잡 unique로 그 유저 영구락·escrow 동결. 1시간 초과 시 fail+환불해 큐 진행.
 */
const QUEUED_TIMEOUT_MIN = 60;

export interface CreateV3Input {
  gender: ProfileGender;
  /** 카탈로그 키(이미지·로어 로드용) — compose가 비전+로어로 사용. */
  weaponKey?: string;
  armorKey?: string;
  accessoryKey?: string;
  /** 키 없거나 카탈로그 미존재 시 텍스트 폴백(시그니처 묘사). */
  weapon?: string;
  armor?: string;
  accessory?: string;
  /** 미지정 시 성별 풀에서 랜덤 부여. */
  appearance?: Appearance;
  /** Pixellab 키 인덱스(1|2). 미지정 시 1. ⚠️ 폴링/다운로드도 같은 키 필수. */
  keyIdx?: number;
}

export interface CreateV3Result {
  characterId: string;
  backgroundJobId: string | null;
  /** 실제 전달한 description(재현·검수 컨텍스트용 저장). */
  description: string;
  appearance: Appearance;
  /** 생성에 사용한 키 인덱스(잡 options에 기록 → 이후 단계 동일 키). */
  keyIdx: number;
}

/**
 * v3 캐릭터 생성 요청. 외형 랜덤 + Claude(비전+로어) 조합 + POST /create-character-v3.
 * 옵션 고정: 256×256 · high detail · outline=lineless · enhance_prompt OFF · no_background.
 * (lineless = 검은 외곽선 제거(사용자 선호), high detail = 디테일, 256 = 정사각 통합.)
 * 실패(키 없음·API 오류) throw.
 */
export async function createCharacterV3(input: CreateV3Input): Promise<CreateV3Result> {
  const keyIdx = input.keyIdx ?? 1;
  const key = pixellabKeyByIdx(keyIdx);

  const appearance = input.appearance ?? pickRandomAppearance(input.gender);
  const description = await composeV3Description({
    gender: input.gender,
    appearance,
    weaponKey: input.weaponKey,
    armorKey: input.armorKey,
    accessoryKey: input.accessoryKey,
    weapon: input.weapon,
    armor: input.armor,
    accessory: input.accessory,
  });

  const res = await fetch(`${PIXELLAB_BASE}/create-character-v3`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      description,
      image_size: { width: V3_SIZE, height: V3_SIZE },
      detail: 'high detail',
      outline: 'lineless',
      enhance_prompt: false,
      no_background: true,
    }),
  });
  if (!res.ok) {
    const t = (await res.text()).slice(0, 300);
    throw new Error(`create-character-v3 HTTP ${res.status}: ${t}`);
  }
  const j = (await res.json()) as { character_id: string; background_job_id?: string };
  return {
    characterId: j.character_id,
    backgroundJobId: j.background_job_id ?? null,
    description,
    appearance,
    keyIdx,
  };
}

// drainQueue 동시성 클레임 직렬화용 advisory lock 키(임의 상수, 프로필 생성 전용).
const DRAIN_LOCK_KEY = 49_270_015;

type ClaimedJob = {
  id: bigint;
  userId: string;
  options: unknown;
  equipmentSnapshot: unknown;
  /** 클레임 시 배정된 Pixellab 키(1|2) — 이후 발주·폴링·다운로드 모두 이 키. */
  keyIdx: number;
};

/**
 * 슬롯 1개 원자 선점 — advisory lock으로 전 클레임을 전역 직렬화(외부 I/O 없이 빠름).
 * **키별 상한(PER_KEY)** 하에 여유 있는(덜 바쁜) 키를 골라 배정. 두 키 모두 가득이면 null.
 * 가장 오래된 queued 1건을 queued→starting으로 전이하며 options.pixellabKeyIdx=배정키 기록
 * (starting도 키별 카운트에 잡히도록). starting은 poll(downloading만) 대상 아님 → 안전.
 */
async function claimSlot(): Promise<ClaimedJob | null> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${DRAIN_LOCK_KEY})`);
    // 키별 활성(starting+downloading) 카운트 — options.pixellabKeyIdx 없으면 key1(레거시 정합).
    const rows = (await tx.execute(sql`
      select coalesce((options->>'pixellabKeyIdx')::int, 1) as k, count(*)::int as n
      from profile_generation_jobs
      where status in ('starting', 'downloading')
      group by 1
    `)) as unknown as Array<{ k: number; n: number }>;
    const byKey: Record<number, number> = { 1: 0, 2: 0 };
    for (const r of rows) byKey[Number(r.k)] = Number(r.n);

    // 여유 있는 키 중 가장 덜 바쁜 키 배정(동률이면 key1). 없으면 전 키 가득 → 대기.
    let target = 0;
    let best = Infinity;
    for (let k = 1; k <= pixellabKeyCount(); k++) {
      if ((byKey[k] ?? 0) < PROFILE_GEN_PER_KEY && (byKey[k] ?? 0) < best) {
        best = byKey[k] ?? 0;
        target = k;
      }
    }
    if (target === 0) return null;

    const [job] = await tx
      .select({
        id: profileGenerationJobs.id,
        userId: profileGenerationJobs.userId,
        options: profileGenerationJobs.options,
        equipmentSnapshot: profileGenerationJobs.equipmentSnapshot,
      })
      .from(profileGenerationJobs)
      .where(eq(profileGenerationJobs.status, 'queued'))
      .orderBy(profileGenerationJobs.createdAt)
      .limit(1);
    if (!job) return null;

    // queued→starting 조건부 전이 + 배정 키 기록(락 하 단독 실행이나 방어적 status 조건).
    const newOptions = { ...(job.options as Record<string, unknown>), pixellabKeyIdx: target };
    const claimed = await tx
      .update(profileGenerationJobs)
      .set({ status: 'starting', options: newOptions })
      .where(and(eq(profileGenerationJobs.id, job.id), eq(profileGenerationJobs.status, 'queued')))
      .returning({ id: profileGenerationJobs.id });
    if (claimed.length === 0) return null;
    return { ...job, keyIdx: target };
  });
}

/**
 * 선점(starting)한 잡 실제 발주 — createCharacterV3(Pixellab POST) → 'downloading' 갱신.
 * 락 밖에서 호출(느린 외부 I/O). 실패 시 markFailedAndRefund(환불+우편). starting 잔여 방지.
 */
async function launchJob(job: ClaimedJob): Promise<{ ok: boolean; reason?: string }> {
  const gender = (job.options as { gender: ProfileGender }).gender;
  const eqs = job.equipmentSnapshot as {
    weaponKey?: string;
    armorKey?: string;
    accessoryKey?: string;
  };
  try {
    // 배정 키(claimSlot에서 키별 부하로 선택) — 이후 폴링/다운로드도 같은 키 사용.
    const keyIdx = job.keyIdx;
    const out = await createCharacterV3({
      gender,
      keyIdx,
      // 키 우선(compose가 비전+로어 로드) + wornDesc 텍스트 폴백.
      weaponKey: eqs.weaponKey,
      armorKey: eqs.armorKey,
      accessoryKey: eqs.accessoryKey,
      weapon: wornOf(eqs.weaponKey),
      armor: wornOf(eqs.armorKey),
      accessory: wornOf(eqs.accessoryKey),
    });
    await db
      .update(profileGenerationJobs)
      .set({
        status: 'downloading',
        pixellabCharacterId: out.characterId,
        pixellabBackgroundJobId: out.backgroundJobId,
        // 실제 전달한 v3 description으로 덮어씀(재현·AI검수 컨텍스트). 외형 랜덤값·키 인덱스는 options에 기록.
        descriptionPrompt: out.description,
        options: { ...(job.options as Record<string, unknown>), v3Appearance: out.appearance, pixellabKeyIdx: out.keyIdx },
      })
      .where(eq(profileGenerationJobs.id, job.id));
    return { ok: true };
  } catch (e) {
    const reason = (e as Error).message;
    await markFailedAndRefund(job.id, job.userId, `v3 launch: ${reason}`);
    return { ok: false, reason };
  }
}

/**
 * 대기열 드레인 — 여유 슬롯(CONCURRENCY - 활성)만큼 queued를 발주. **라이브 발주 단일 경로**
 * (submit 직후 after() + cron profile-poll 양쪽에서 호출). 순서:
 *  1. 정체 스윕 — queued/starting이 타임아웃 초과면 fail+환불(head-of-line 차단·escrow 동결 방지).
 *  2. 클레임+발주 루프 — claimSlot(락)으로 slot 선점 후 launchJob(락 밖). null이면 종료.
 * advisory lock이 동시 호출(다중 submit·cron 겹침)을 직렬화해 CONCURRENCY 하드 캡 보장.
 */
export async function drainQueue(): Promise<{ launched: number; failed: number; swept: number }> {
  if (!process.env.PIXELLAB_API_KEY) throw new Error('PIXELLAB_API_KEY missing');

  // 1. 정체 스윕 — queued(픽업 전 hang)·starting(발주 중 crash로 downloading 전이 실패)이
  //    타임아웃 초과 시 fail+환불. starting은 슬롯·유저락을 잡으므로 방치 시 큐 정체.
  const now = Date.now();
  const stale = await db
    .select({ id: profileGenerationJobs.id, userId: profileGenerationJobs.userId, status: profileGenerationJobs.status, createdAt: profileGenerationJobs.createdAt })
    .from(profileGenerationJobs)
    .where(
      and(
        inArray(profileGenerationJobs.status, ['queued', 'starting']),
        lt(profileGenerationJobs.createdAt, new Date(now - QUEUED_TIMEOUT_MIN * 60_000)),
      ),
    );
  let swept = 0;
  for (const s of stale) {
    await markFailedAndRefund(s.id, s.userId, `${s.status} timeout/stall`);
    swept += 1;
  }

  // 2. 여유 슬롯만큼 발주(최대 전체 상한회 — 클레임이 null이면 조기 종료).
  let launched = 0;
  let failed = 0;
  const maxLaunch = profileGenConcurrency();
  for (let i = 0; i < maxLaunch; i++) {
    const job = await claimSlot();
    if (!job) break; // 여유 없음 or 큐 빔
    const r = await launchJob(job);
    if (r.ok) launched += 1;
    else failed += 1;
  }
  return { launched, failed, swept };
}
