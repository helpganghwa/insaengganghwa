// PROFILE v3 — create-character-v3 호출 헬퍼. **라이브 큐 등록의 단일 경로**(cron profile-poll → enqueueOneV3).
// 흐름: 랜덤 외형(appearance-v3) → Claude 조합(compose-v3) → create-character-v3 POST.
// 폴링/다운로드/미러링은 pipeline.ts의 rotation_urls 처리를 재사용(v3도 동일 GET 사용).
import 'server-only';

import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profileGenerationJobs } from '@/lib/db/schema/avatar';
import { CATALOG_ITEMS } from '@/lib/game/equipment/catalog';

import { composeV3Description } from './compose-v3';
import { pickRandomAppearance, type Appearance } from './appearance-v3';
import { markFailedAndRefund } from './pipeline';
import type { ProfileGender } from './refs';

const WORN_BY_KEY = new Map(CATALOG_ITEMS.map((c) => [c.key, c.wornDesc ?? c.art]));
const wornOf = (key: string | undefined): string => (key ? (WORN_BY_KEY.get(key) ?? key) : '');

const PIXELLAB_BASE = 'https://api.pixellab.ai/v2';
// 확정: 256 정사각(최대 area·디테일·기존 정사각 아바타 통합) + 전신은 프롬프트 강제.
const V3_SIZE = 256;

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
}

export interface CreateV3Result {
  characterId: string;
  backgroundJobId: string | null;
  /** 실제 전달한 description(재현·검수 컨텍스트용 저장). */
  description: string;
  appearance: Appearance;
}

/**
 * v3 캐릭터 생성 요청. 외형 랜덤 + Claude(비전+로어) 조합 + POST /create-character-v3.
 * 옵션 고정: 256×256 · high detail · outline=lineless · enhance_prompt OFF · no_background.
 * (lineless = 검은 외곽선 제거(사용자 선호), high detail = 디테일, 256 = 정사각 통합.)
 * 실패(키 없음·API 오류) throw.
 */
export async function createCharacterV3(input: CreateV3Input): Promise<CreateV3Result> {
  const key = process.env.PIXELLAB_API_KEY;
  if (!key) throw new Error('PIXELLAB_API_KEY missing');

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
  };
}

/**
 * queued 작업 1건 선점 → 장비 wornDesc 조회 → createCharacterV3 → 'downloading' 갱신.
 * 이후 다운로드/미러링/AI검수는 기존 pipeline.pollAndProcessDownloading가 그대로 처리
 * (v3도 GET /characters/{id} rotation_urls 동일). create-character-state 대체용 enqueue.
 * 실패 시 markFailedAndRefund(환불+우편).
 */
export async function enqueueOneV3(): Promise<
  | { kind: 'noop' }
  | { kind: 'enqueued'; jobId: bigint; characterId: string }
  | { kind: 'failed'; jobId: bigint; reason: string }
> {
  if (!process.env.PIXELLAB_API_KEY) throw new Error('PIXELLAB_API_KEY missing');

  const [job] = await db
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
  if (!job) return { kind: 'noop' };

  const gender = (job.options as { gender: ProfileGender }).gender;
  const eqs = job.equipmentSnapshot as {
    weaponKey?: string;
    armorKey?: string;
    accessoryKey?: string;
  };

  try {
    const out = await createCharacterV3({
      gender,
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
        // 실제 전달한 v3 description으로 덮어씀(재현·AI검수 컨텍스트). 외형 랜덤값은 options에 기록.
        descriptionPrompt: out.description,
        options: { ...(job.options as Record<string, unknown>), v3Appearance: out.appearance },
      })
      .where(eq(profileGenerationJobs.id, job.id));
    return { kind: 'enqueued', jobId: job.id, characterId: out.characterId };
  } catch (e) {
    const reason = (e as Error).message;
    await markFailedAndRefund(job.id, job.userId, `v3 enqueue: ${reason}`);
    return { kind: 'failed', jobId: job.id, reason };
  }
}
