import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { servers, characters } from '@/lib/db/schema/server';
import { zones } from '@/lib/db/schema/guild';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { userProfiles } from '@/lib/db/schema/avatar';
import { profiles } from '@/lib/db/schema/profiles';
import { TEST_REWARD_MULTIPLIER } from '@/lib/game/test-mode';
import {
  NICKNAME_MIN_LEN,
  NICKNAME_MAX_LEN,
  NICKNAME_CHAR_REGEX,
  nicknameLen,
  sanitizeNicknameInput,
} from '@/lib/game/nickname';

/**
 * 서버 선택·캐릭터 생성(SERVER.md §3·P6) — 풀 아이솔레이션: 새 서버 = 새 캐릭터(새 닉네임).
 * 가입 보너스·기본 아바타는 가입 트리거(handle_new_user)와 동일 수치 — 변경 시 양쪽 동기.
 */
const SIGNUP_DIAMOND = 1000 * TEST_REWARD_MULTIPLIER;
const SIGNUP_BOX_PER_SLOT = 10 * TEST_REWARD_MULTIPLIER;
/** 기본 아바타(대장장이 남/여) — 트리거와 동일 정적 에셋. */
const DEFAULT_AVATARS = [
  { charId: 'ada89510-cb31-49f5-a5ff-94422d4443f0', gender: 'male' },
  { charId: '8197894c-b042-4f8a-9c8b-6532e6c5c6b5', gender: 'female' },
] as const;
const rotationsFor = (g: 'male' | 'female') =>
  Object.fromEntries(
    ['south', 'south_east', 'east', 'north_east', 'north', 'north_west', 'west', 'south_west'].map(
      (d) => [d, `/sprites/default/${g}/${d}.png`],
    ),
  );

export type ServerListItem = {
  id: number;
  name: string;
  status: string;
  /** 이 서버의 내 캐릭터(없으면 null) — 선택 화면 표시용. */
  my: { nickname: string; diamond: string } | null;
};

/** 서버 목록 + 내 캐릭터 유무 — 선택 화면. */
export async function listServersForUser(userId: string): Promise<ServerListItem[]> {
  const rows = await db
    .select({
      id: servers.id,
      name: servers.name,
      status: servers.status,
      nickname: characters.nickname,
      diamond: characters.diamond,
    })
    .from(servers)
    .leftJoin(characters, and(eq(characters.serverId, servers.id), eq(characters.userId, userId)))
    .orderBy(servers.id);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    my: r.nickname != null ? { nickname: r.nickname, diamond: (r.diamond ?? 0n).toString() } : null,
  }));
}

/** 열려 있는 서버 수 — 1이면 선택 UI 자체를 숨김(SERVER.md §3). */
export async function countServers(): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(servers);
  return r?.n ?? 1;
}

export type CreateCharacterError =
  | 'SERVER_NOT_OPEN'
  | 'ALREADY_EXISTS'
  | 'NICKNAME_INVALID'
  | 'NICKNAME_TAKEN';
export class CharacterError extends Error {
  constructor(public code: CreateCharacterError) {
    super(code);
    this.name = 'CharacterError';
  }
}

/** 닉네임 자동 제안 — 가입 트리거와 동일 생성기(전역 유일 충돌 시 클라 재시도). */
export async function suggestNickname(): Promise<string> {
  const rows = (await db.execute(
    sql`select public.generate_korean_nickname() as n`,
  )) as unknown as { n: string }[];
  return rows[0]?.n ?? '모험가';
}

/**
 * 캐릭터 생성 — 새 서버 진입(가입 보너스 + 기본 아바타 2종 + active 랜덤).
 * 닉네임은 전 캐릭터 전역 유일(characters_nickname_uq가 최종 방어).
 */
export async function createCharacter(input: {
  userId: string;
  serverId: number;
  nickname: string;
}): Promise<void> {
  const nickname = sanitizeNicknameInput(input.nickname);
  const len = nicknameLen(nickname);
  if (len < NICKNAME_MIN_LEN || len > NICKNAME_MAX_LEN || !NICKNAME_CHAR_REGEX.test(nickname)) {
    throw new CharacterError('NICKNAME_INVALID');
  }

  await db.transaction(async (tx) => {
    const [srv] = await tx
      .select({ status: servers.status })
      .from(servers)
      .where(eq(servers.id, input.serverId))
      .limit(1);
    if (!srv || srv.status !== 'open') throw new CharacterError('SERVER_NOT_OPEN');

    const [dup] = await tx
      .select({ uid: characters.userId })
      .from(characters)
      .where(and(eq(characters.userId, input.userId), eq(characters.serverId, input.serverId)))
      .limit(1);
    if (dup) throw new CharacterError('ALREADY_EXISTS');

    // 거주지 랜덤 배정(GUILD §5.5 — 생성 시점) — 그 서버의 구역 중 하나.
    const [rz] = await tx
      .select({ id: zones.id })
      .from(zones)
      .where(eq(zones.serverId, input.serverId))
      .orderBy(sql`random()`)
      .limit(1);

    try {
      await tx.insert(characters).values({
        userId: input.userId,
        serverId: input.serverId,
        nickname,
        diamond: BigInt(SIGNUP_DIAMOND),
        tutorialStep: 9, // 신서버 재시작 — 코어 튜토리얼 재노출 없음(기존 유저)
        residenceZoneId: rz?.id ?? null,
        lastSeenAt: new Date(),
      });
    } catch (e) {
      if (e instanceof Error && /nickname/i.test(e.message)) throw new CharacterError('NICKNAME_TAKEN');
      throw e;
    }

    for (const slot of ['weapon', 'armor', 'accessory'] as const) {
      await tx
        .insert(userSupplyBoxes)
        .values({ userId: input.userId, serverId: input.serverId, slot, count: BigInt(SIGNUP_BOX_PER_SLOT) })
        .onConflictDoNothing();
    }

    // 기본 아바타 2종(서버 자산) + active 랜덤.
    const inserted = await tx
      .insert(userProfiles)
      .values(
        DEFAULT_AVATARS.map((a) => ({
          userId: input.userId,
          serverId: input.serverId,
          rotations: rotationsFor(a.gender),
          activeDirection: 'south' as const,
          pixellabCharacterId: a.charId,
          options: { gender: a.gender, isDefault: true },
          equipmentSnapshot: {},
          descriptionPrompt: `기본 프로필(대장장이 ${a.gender === 'male' ? '남' : '여'})`,
        })),
      )
      .returning({ id: userProfiles.id });
    const pick = inserted[Math.floor(Math.random() * inserted.length)];
    if (pick) {
      await tx
        .update(characters)
        .set({ activeProfileId: pick.id })
        .where(and(eq(characters.userId, input.userId), eq(characters.serverId, input.serverId)));
    }
  });
}

/** 서버 선택 검증 — 존재 + 캐릭터 보유 시에만 통과(생성은 별도 플로우). */
export async function canEnterServer(userId: string, serverId: number): Promise<boolean> {
  const [r] = await db
    .select({ uid: characters.userId })
    .from(characters)
    .innerJoin(servers, eq(servers.id, characters.serverId))
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
    .limit(1);
  return !!r;
}

/** 활성 서버 추적(푸시 필터, 경계규칙1). */
export async function touchLastServer(userId: string, serverId: number): Promise<void> {
  await db
    .update(profiles)
    .set({ lastServerId: serverId })
    .where(eq(profiles.id, userId));
}


/**
 * 자동 닉네임으로 캐릭터 생성 — 가입 플로우와 동일(자동 한글 닉, 충돌 시 재추첨).
 * 서버 이동 시 무마찰 시작(SERVER.md §3): 닉이 마음에 안 들면 첫 닉변 무료로 교체.
 */
export async function createCharacterAuto(input: {
  userId: string;
  serverId: number;
}): Promise<{ nickname: string }> {
  for (let i = 0; i < 10; i++) {
    const candidate =
      i < 8
        ? await suggestNickname()
        : `${(await suggestNickname()).slice(0, 4)}${Math.floor(Math.random() * 9000) + 1000}`;
    try {
      await createCharacter({ userId: input.userId, serverId: input.serverId, nickname: candidate });
      return { nickname: candidate };
    } catch (e) {
      if (e instanceof CharacterError && e.code === 'NICKNAME_TAKEN') continue; // 재추첨
      if (e instanceof CharacterError && e.code === 'NICKNAME_INVALID') continue; // 생성기 이상치 방어
      throw e;
    }
  }
  throw new CharacterError('NICKNAME_TAKEN');
}
