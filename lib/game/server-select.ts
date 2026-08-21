import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { servers, characters } from '@/lib/db/schema/server';
import { zones } from '@/lib/db/schema/guild';
import { userSupplyBoxes } from '@/lib/db/schema/supply';
import { userProfiles } from '@/lib/db/schema/avatar';
import { profiles } from '@/lib/db/schema/profiles';
import { TEST_REWARD_MULTIPLIER } from '@/lib/game/test-mode';
import { recordDiamondLedger } from '@/lib/game/ledger';
import { isUniqueViolation, pgConstraintName } from '@/lib/db/errors';
import {
  NICKNAME_MIN_LEN,
  NICKNAME_MAX_LEN,
  NICKNAME_CHAR_REGEX,
  nicknameLen,
  sanitizeNicknameInput,
} from '@/lib/game/nickname';

/**
 * 서버 선택·캐릭터 생성(SERVER.md §3·P6) — 풀 아이솔레이션: 새 서버 = 새 캐릭터(새 닉네임).
 * 가입 보너스·기본 아바타·거주지의 **단일 출처**(0067 이후 트리거는 계정 행만 만들고 캐릭터/
 * 보너스를 만들지 않음 — 신규 가입·새 서버 합류 모두 이 함수가 고른 서버에 1개 생성).
 */
const SIGNUP_DIAMOND = 500 * TEST_REWARD_MULTIPLIER;
const SIGNUP_BOX_PER_SLOT = 10 * TEST_REWARD_MULTIPLIER;
/** 기본 아바타(대장장이 남/여) — 트리거와 동일 정적 에셋. */
const DEFAULT_AVATARS = [
  // v3 스타일 재생성(2026-06-20) — 대장장이 견습생 미소년/미소녀, 풀프레임·lineless·7등신.
  { charId: 'fd767516-0af6-43f7-b6ed-398289e7d54f', gender: 'male' },
  { charId: '6c079398-6ccf-4610-8f39-f666688ff941', gender: 'female' },
] as const;
// 기본 아바타 정적 파일 버전 — 재생성 시 올려 캐시 버스트(7일 장기캐시 우회). v2=v3 스타일 재생성.
const DEFAULT_AVATAR_VER = 2;
const rotationsFor = (g: 'male' | 'female') =>
  Object.fromEntries(
    ['south', 'south_east', 'east', 'north_east', 'north', 'north_west', 'west', 'south_west'].map(
      (d) => [d, `/sprites/default/${g}/${d}.png?v=${DEFAULT_AVATAR_VER}`],
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

/**
 * 닉네임 자동 제안 — '대장장이' + 4자리 영숫자 난수(정확히 8자 = NICKNAME_MAX_LEN).
 * 숫자만(9,000조합)이면 포화 시 자동 생성이 막히므로 [0-9a-z] 36⁴ ≈ 168만 조합으로 확장.
 * 로컬 생성(DB 무접촉): 전역 유일은 characters_nickname_uq가 최종 방어하고 호출부가 재추첨.
 */
const NICK_SUFFIX_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
export function suggestNickname(): string {
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += NICK_SUFFIX_CHARS[Math.floor(Math.random() * NICK_SUFFIX_CHARS.length)];
  }
  return `대장장이${suffix}`;
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
      .select({ id: zones.id, region: zones.region })
      .from(zones)
      .where(eq(zones.serverId, input.serverId))
      .orderBy(sql`random()`)
      .limit(1);

    // 진짜 신규(다른 서버에도 캐릭터가 사실상 없음 — 가입 트리거 직후 1개뿐이고 그 캐릭터를
    // 아직 안 키움)면 코어 튜토리얼 노출, 기존 유저의 서버 이동이면 스킵.
    const [other] = await tx
      .select({ tut: characters.tutorialStep })
      .from(characters)
      .where(and(eq(characters.userId, input.userId), sql`${characters.serverId} <> ${input.serverId}`))
      .orderBy(characters.createdAt)
      .limit(1);
    const isFresh = !other || other.tut === 1; // 트리거 생성분이 미진행(step 1)이면 신규로 간주
    try {
      await tx.insert(characters).values({
        userId: input.userId,
        serverId: input.serverId,
        nickname,
        diamond: BigInt(SIGNUP_DIAMOND),
        tutorialStep: isFresh ? 1 : 9,
        residenceZoneId: rz?.id ?? null,
        // 칭호 이력(0166) — 거주·대표 아바타 유지 시작 = 생성 시각, 첫 지역 방문 기록.
        residenceSince: rz ? new Date() : null,
        visitedRegions: rz ? [rz.region] : [],
        activeProfileSince: new Date(),
        lastSeenAt: new Date(),
      });
    } catch (e) {
      // ⚠ message 문자열 매칭 금지 — drizzle 0.45 래퍼 message에는 쿼리 전문이 들어가
      // "nickname" 컬럼명 때문에 **이 INSERT의 어떤 에러든**(FK·PK·문장 타임아웃·소켓 절단)
      // NICKNAME_TAKEN으로 오인됐다(2026-08-12 실측, dbbe95ce가 놓친 9번째이자 마지막 자리).
      // 그 오인이 createCharacterAuto의 10회 재추첨을 태워, 출시 버스트의 풀 포화를 장애가
      // 지속되는 동안 증폭시키는 구조였다. SQLSTATE 판별은 반드시 lib/db/errors.ts 경유.
      if (isUniqueViolation(e)) {
        // 이 문장이 23505를 낼 제약은 정확히 둘 — PK(더블서밋)와 닉 유니크. 구분해야
        // 더블서밋이 닉 재추첨을 낭비하지 않고 즉시 ALREADY_EXISTS로 끝난다.
        if (pgConstraintName(e) === 'characters_pkey') throw new CharacterError('ALREADY_EXISTS');
        throw new CharacterError('NICKNAME_TAKEN'); // characters_nickname_uq
      }
      throw e; // 그 외(타임아웃·FK 등)는 전파 — 재시도 루프를 타면 안 된다.
    }
    // 가입 보너스는 지갑을 **만드는** INSERT라 walletAdd(=UPDATE + 원장)를 탈 수 없다.
    // 원장을 직접 남기지 않으면 이 경로만 유입 집계에서 통째로 빠진다.
    await recordDiamondLedger(tx, {
      userId: input.userId,
      serverId: input.serverId,
      delta: BigInt(SIGNUP_DIAMOND),
      reason: 'signup',
    });

    for (const slot of ['weapon', 'armor', 'accessory'] as const) {
      await tx
        .insert(userSupplyBoxes)
        .values({ userId: input.userId, serverId: input.serverId, slot, count: BigInt(SIGNUP_BOX_PER_SLOT) })
        .onConflictDoNothing();
    }

    // 반쪽 계정 복구 재진입 안전 — 캐릭터만 유실된 계정엔 이전 기본 아바타(isDefault)가 남아
    // uq_default_avatar_per_char(0092, user_id+server_id+pixellab_character_id where isDefault)와
    // 충돌해 캐릭터 재생성이 영구 실패한다(자가복구 무한 실패의 실제 원인, 2026-07-07). 새 캐릭터가
    // 기본 아바타를 새로 소유하므로 기존 기본 아바타를 먼저 비운다(정상 신규는 없어 무해, 커스텀 유지).
    await tx
      .delete(userProfiles)
      .where(
        and(
          eq(userProfiles.userId, input.userId),
          eq(userProfiles.serverId, input.serverId),
          sql`(${userProfiles.options} ->> 'isDefault') = 'true'`,
        ),
      );

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
    // 재가입(탈퇴 후 새 시작) — 탈퇴 마킹 해제. 신규 유저는 이미 null이라 무해.
    await tx.update(profiles).set({ withdrawnAt: null }).where(eq(profiles.id, input.userId));
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
    const candidate = suggestNickname();
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


/** 공개 서버 목록(비로그인 — 로그인 화면 셀렉터용). 이름·상태만. */
export async function listServersPublic(): Promise<{ id: number; name: string; status: string }[]> {
  return db
    .select({ id: servers.id, name: servers.name, status: servers.status })
    .from(servers)
    .orderBy(servers.id);
}

/** 최신 open 서버 id — 신규 기본 선택(가입 트리거와 동일 규칙). */
export async function latestOpenServerId(): Promise<number> {
  const [r] = await db
    .select({ id: sql<number>`coalesce(max(${servers.id}), 1)` })
    .from(servers)
    .where(eq(servers.status, 'open'));
  return r?.id ?? 1;
}
