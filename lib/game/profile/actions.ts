'use server';

/**
 * PROFILE §2 핵심 흐름 — 유저 "생성" 클릭 진입점.
 *
 * 단일 트랜잭션:
 *  1. 본인 장착 3슬롯 조회 (NO_EQUIPMENT 검증)
 *  2. 옵션 zod 검증
 *  3. description 합성(서버 합성 — 클라 텍스트 절대 안 받음, PROFILE §10)
 *  4. 다이아 escrow 차감(조건부 update — INSUFFICIENT_DIAMOND)
 *  5. profile_generation_jobs INSERT — UNIQUE 부분 인덱스로 활성 큐 1건 보장
 *
 * Pixellab v2 큐 등록은 별도 cron(`/api/cron/profile-poll`)이 `status='queued'`
 * 행을 잡아서 처리 — Server Action은 빠른 응답 우선.
 */
import 'server-only';

import { and, count, eq, isNotNull } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/lib/db/client';
import { walletTrySpend } from '@/lib/game/wallet';
import { profileGenerationJobs, userProfiles } from '@/lib/db/schema/avatar';
import { catalogItems, userEquipment } from '@/lib/db/schema/equipment';
import { PROFILE_GENERATION_DIAMOND, PROFILE_MAX } from '@/lib/game/balance';
import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';

import { pickRandomHairLength, pickRandomPose, pickRandomRace } from './compose';
import { CreateProfileJobError } from './errors';

// 유저 입력은 gender만 (2026-05-28). hair color/style·pose 폐기, expression·race는 서버 random.
// 개성은 장비 3종 모티프 + 서버 random(표정·종족)으로 — 머리색도 모티프 팔레트를 따름.
const ProfileOptionsSchema = z.object({
  gender: z.enum(['male', 'female']),
});

export type CreateProfileJobResult = {
  jobId: string;
  /** UI 안내용 — Pixellab Pro mode 평균 (~6분). */
  estimatedMinutes: number;
};

export async function createProfileJob(
  rawOptions: unknown,
): Promise<CreateProfileJobResult> {
  const userId = await getSessionUserId();
  if (!userId) throw new CreateProfileJobError('UNAUTHORIZED');
  const serverId = await getActiveServerId();

  // 프로필 최대 PROFILE_MAX개 — 초과 시 생성 차단(기본 2개 포함).
  const [pc] = await db
    .select({ n: count() })
    .from(userProfiles)
    .where(and(eq(userProfiles.userId, userId), eq(userProfiles.serverId, serverId)));
  if ((pc?.n ?? 0) >= PROFILE_MAX) throw new CreateProfileJobError('PROFILE_LIMIT');

  const parsed = ProfileOptionsSchema.safeParse(rawOptions);
  if (!parsed.success) throw new CreateProfileJobError('INVALID_OPTIONS');
  // expression·hairLength·race 서버 random 부여 (race는 gender 제약 — nekomimi/fairy=여, dragonkin=남).
  const opts = {
    gender: parsed.data.gender,
    hairLength: pickRandomHairLength(),
    pose: pickRandomPose(),
    race: pickRandomRace(parsed.data.gender),
  };

  // 1. 본인 장착 3슬롯 조회 — equippedSlot이 set된 instances만. (읽기 전용 — tx 밖)
  const equipped = await db
    .select({
      slot: userEquipment.equippedSlot,
      code: catalogItems.code,
    })
    .from(userEquipment)
    .innerJoin(catalogItems, eq(userEquipment.catalogItemId, catalogItems.id))
    .where(
      and(
        eq(userEquipment.userId, userId),
        eq(userEquipment.serverId, serverId),
        isNotNull(userEquipment.equippedSlot),
      ),
    );

  const bySlot = new Map(equipped.map((e) => [e.slot ?? '', e.code]));
  const weaponKey = bySlot.get('weapon');
  const armorKey = bySlot.get('armor');
  const accessoryKey = bySlot.get('accessory');
  if (!weaponKey || !armorKey || !accessoryKey) {
    throw new CreateProfileJobError('NO_EQUIPMENT');
  }
  const equipmentSnapshot = { weaponKey, armorKey, accessoryKey };

  // description은 생성 시점(cron enqueueOneV3)에 compose-v3가 비전+로어로 만들어 채운다.
  // 여기서는 빈 값으로 enqueue만 — v3가 descriptionPrompt를 덮어씀.
  const description = '';

  return db.transaction(async (tx) => {
    // 3. 다이아 escrow — 조건부 차감(서버별 지갑). 부족 시 미차감.
    const paid = await walletTrySpend(tx, userId, serverId, PROFILE_GENERATION_DIAMOND);
    if (!paid) {
      throw new CreateProfileJobError('INSUFFICIENT_DIAMOND');
    }

    // 4. Job INSERT — UNIQUE 부분 인덱스(profile_gen_one_active_per_user)가
    //    유저당 활성 큐 1건 보장. 위반 시 Postgres 23505.
    try {
      const [job] = await tx
        .insert(profileGenerationJobs)
        .values({
          serverId,
          userId,
          descriptionPrompt: description,
          options: opts,
          equipmentSnapshot,
          diamondEscrow: BigInt(PROFILE_GENERATION_DIAMOND),
          status: 'queued',
        })
        .returning({ id: profileGenerationJobs.id });
      return { jobId: String(job!.id), estimatedMinutes: 6 };
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === '23505') {
        throw new CreateProfileJobError('PROFILE_GEN_IN_PROGRESS');
      }
      throw e;
    }
  });
}
