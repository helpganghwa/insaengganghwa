'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { userProfiles, profileReports } from '@/lib/db/schema/avatar';
import { characters } from '@/lib/db/schema/server';
import { profiles } from '@/lib/db/schema/profiles';
import { mailbox } from '@/lib/db/schema/mailbox';
import { guilds } from '@/lib/db/schema/guild';
import { adminActions } from '@/lib/db/schema/ops';
import { NICKNAME_CHANGE_COST_DIAMOND, PROFILE_GENERATION_DIAMOND } from '@/lib/game/balance';
import { GUILD_NAME_MAX_LEN, GUILD_NAME_MIN_LEN } from '@/lib/game/guild/balance';
import { GUILD_NAME_CHAR_REGEX, normalizeGuildName } from '@/lib/game/guild/create';
import { containsProfanity } from '@/lib/game/moderation/profanity';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Result = { status: 'success' } | { status: 'error'; code: string };

async function ownerOf(tx: Tx, profileId: string) {
  const [p] = await tx
    .select({ userId: userProfiles.userId, serverId: userProfiles.serverId, options: userProfiles.options })
    .from(userProfiles)
    .where(eq(userProfiles.id, profileId))
    .limit(1);
  return p ?? null;
}

async function mail(
  tx: Tx,
  userId: string,
  serverId: number,
  type: 'notice' | 'reward',
  title: string,
  body: string,
  diamond = 0,
) {
  await tx.insert(mailbox).values({
    userId,
    serverId,
    type,
    title,
    body,
    senderLabel: '운영팀',
    payload: diamond > 0 ? { diamond } : {},
  });
}

async function clearReports(tx: Tx, profileId: string) {
  await tx.delete(profileReports).where(eq(profileReports.profileId, profileId));
  await tx.update(userProfiles).set({ reportCount: 0 }).where(eq(userProfiles.id, profileId));
}

function randomBlacksmithNick(): string {
  const n = (crypto.getRandomValues(new Uint32Array(1))[0]! % 900000) + 100000;
  return `대장장이${n}`;
}

/**
 * 닉네임 신고 처리 — '대장장이N'으로 강제 변경 + 변경비 지급 + 신고 정리.
 * 제재는 계정 단위(SERVER.md 경계규칙 2, 감사 B4) — 신고된 서버만 바꾸면 위반 닉네임이
 * 타 서버 캐릭터에 그대로 남으므로 이 계정의 **전 서버 캐릭터**를 초기화한다.
 * 닉네임은 전 서버 전역 유일이라 충돌 체크도 전역, 새 닉도 서버마다 서로 다르게 뽑는다.
 * 변경비 우편은 초기화된 서버마다 각각 — 서버별 지갑이라 그 서버에서 재변경할 비용.
 */
export async function resetReportedNickname(profileId: string): Promise<Result> {
  await requireAdmin();
  return db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    if (!owner) return { status: 'error', code: 'NOT_FOUND' };
    const chars = await tx
      .select({ serverId: characters.serverId })
      .from(characters)
      .where(eq(characters.userId, owner.userId));
    const used = new Set<string>();
    for (const c of chars) {
      // 전역 유니크 — 충돌 회피 재시도(같은 트랜잭션 내 배정분은 used로 회피).
      let nick = randomBlacksmithNick();
      for (let i = 0; i < 5; i++) {
        if (!used.has(nick)) {
          const [dup] = await tx
            .select({ uid: characters.userId })
            .from(characters)
            .where(eq(characters.nickname, nick))
            .limit(1);
          if (!dup) break;
        }
        nick = randomBlacksmithNick();
      }
      used.add(nick);
      await tx
        .update(characters)
        .set({ nickname: nick })
        .where(and(eq(characters.userId, owner.userId), eq(characters.serverId, c.serverId)));
      await mail(
        tx,
        owner.userId,
        c.serverId,
        'reward',
        '닉네임 초기화 안내',
        `운영정책 위반으로 닉네임이 "${nick}"(으)로 초기화되었습니다. 닉네임 변경 비용을 지급해 드리니 적절한 닉네임으로 변경해 주세요.`,
        NICKNAME_CHANGE_COST_DIAMOND,
      );
    }
    await clearReports(tx, profileId);
    revalidatePath('/admin/reports');
    return { status: 'success' };
  });
}

/** 아바타 신고 처리 — 기본 아바타로 전환(위반 아바타 삭제) + 생성비 지급 + 신고 정리. 기본 아바타는 삭제 안 함. */
export async function resetReportedAvatar(profileId: string): Promise<Result> {
  await requireAdmin();
  return db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    if (!owner) return { status: 'error', code: 'NOT_FOUND' };
    const isDefault = (owner.options as { isDefault?: boolean } | null)?.isDefault === true;

    if (isDefault) {
      // 기본 아바타가 신고됨 — 삭제 불가, 안내만 후 정리.
      await mail(tx, owner.userId, owner.serverId, 'notice', '신고 처리 안내', '신고가 검토되었습니다.');
      await clearReports(tx, profileId);
      revalidatePath('/admin/reports');
      return { status: 'success' };
    }

    // 이 유저의 기본 아바타로 active 전환(없으면 null=코드 폴백) 후 위반 아바타 삭제.
    const [def] = await tx
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(
        and(
          eq(userProfiles.userId, owner.userId),
          eq(userProfiles.serverId, owner.serverId),
          sql`(${userProfiles.options} ->> 'isDefault') = 'true'`,
        ),
      )
      .limit(1);
    await tx
      .update(characters)
      // 대표가 실제로 바뀌므로 유지 시작(0166, 한결같은 얼굴 판정)도 리셋.
      .set({ activeProfileId: def?.id ?? null, activeProfileSince: sql`now()` })
      // serverId 명시(감사 P-A3) — activeProfileId가 UUID 유니크라 실무상 안전하나, 모더레이션
      // 경로의 잠재 오타깃 방지로 서버 스코프 고정.
      .where(
        and(
          eq(characters.userId, owner.userId),
          eq(characters.serverId, owner.serverId),
          eq(characters.activeProfileId, profileId),
        ),
      );
    // 신고 cascade로 함께 삭제되지만, 명시적으로 먼저 정리(카운트 0 갱신은 삭제 전 대상 존재 시).
    await tx.delete(profileReports).where(eq(profileReports.profileId, profileId));
    await tx.delete(userProfiles).where(eq(userProfiles.id, profileId));
    await mail(
      tx,
      owner.userId,
      owner.serverId,
      'reward',
      '아바타 변경 안내',
      '운영정책 위반으로 아바타가 기본 아바타로 변경되었습니다. 아바타 생성 비용을 지급해 드리니 적절한 아바타로 다시 만들어 주세요.',
      PROFILE_GENERATION_DIAMOND,
    );
    revalidatePath('/admin/reports');
    return { status: 'success' };
  });
}

/** 경고 — 비공개·변경 없이 경고 우편만(신고 기록 유지). 모든 사유 공통. */
export async function warnProfile(profileId: string): Promise<Result> {
  await requireAdmin();
  return db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    if (!owner) return { status: 'error', code: 'NOT_FOUND' };
    await mail(
      tx,
      owner.userId,
      owner.serverId,
      'notice',
      '운영 경고',
      '회원님에 대한 신고가 접수되었습니다. 운영정책 위반(부적절한 닉네임·아바타, 버그 악용 등)은 닉네임 초기화·아바타 변경·계정 정지로 이어질 수 있으니 유의해 주세요.',
    );
    revalidatePath('/admin/reports');
    return { status: 'success' };
  });
}

/** 계정 정지 — banned 마킹 + 사유(노출). 게임 접근 차단은 (game) 레이아웃 게이트가 enforce. */
export async function banReportedUser(
  profileId: string,
  reason: string,
  untilIso: string | null,
): Promise<Result> {
  await requireAdmin();
  if (!reason.trim()) return { status: 'error', code: 'NO_REASON' };
  let until: Date | null = null;
  if (untilIso) {
    // datetime-local('YYYY-MM-DDThh:mm', TZ 없음)을 KST로 해석.
    const d = new Date(`${untilIso}:00+09:00`);
    if (Number.isNaN(d.getTime())) return { status: 'error', code: 'BAD_UNTIL' };
    until = d;
  }
  return db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    if (!owner) return { status: 'error', code: 'NOT_FOUND' };
    await tx
      .update(profiles)
      .set({ bannedAt: new Date(), banReason: reason.trim().slice(0, 500), banUntil: until })
      .where(eq(profiles.id, owner.userId));
    await clearReports(tx, profileId);
    revalidatePath('/admin/reports');
    return { status: 'success' };
  });
}

/** 정지 해제 — profileId의 소유자 banned 해제. */
export async function unbanReportedUser(profileId: string): Promise<Result> {
  await requireAdmin();
  return db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    if (!owner) return { status: 'error', code: 'NOT_FOUND' };
    await tx
      .update(profiles)
      .set({ bannedAt: null, banReason: null, banUntil: null })
      .where(eq(profiles.id, owner.userId));
    revalidatePath('/admin/reports');
    return { status: 'success' };
  });
}

type RenameGuildResult =
  | { status: 'success'; guildId: string; from: string; to: string; mailed: boolean }
  | { status: 'error'; code: string };

/**
 * 길드 이름 변경(운영자 전용) — 부적절한 길드명 대응 유일 경로.
 * 길드명은 유저가 바꿀 수 없고(결성 시 확정) 월드맵·랭킹·연대기·채팅·우편에 계속 노출되므로,
 * 운영 통보(우편) → 길드장 희망 이름 접수(문의) → 여기서 적용의 마지막 단계.
 *
 * 검증은 결성(lib/game/guild/create.ts)과 **같은 규칙**을 그대로 재사용한다 — 운영자가 넣은 이름이
 * 유저가 만들 수 있는 이름의 집합을 벗어나면 안 되기 때문(정본 하나 유지).
 * newName이 비면 `길드{id}`로 초기화 — 희망 이름을 받기 전 즉시 노출을 끊어야 하는 경우.
 */
export async function renameGuildAction(input: {
  currentName: string;
  newName: string;
  sendMail: boolean;
  mailTitle: string;
  mailBody: string;
}): Promise<RenameGuildResult> {
  const adminUserId = await requireAdmin();

  const current = normalizeGuildName(input.currentName);
  if (!current) return { status: 'error', code: 'NO_CURRENT_NAME' };
  const title = input.mailTitle.trim();
  const body = input.mailBody.trim();
  // 이름은 바뀌었는데 빈 우편만 나가는 상태를 막으려 변경 전에 검사한다.
  if (input.sendMail && (!title || !body)) return { status: 'error', code: 'MAIL_EMPTY' };

  return db.transaction(async (tx): Promise<RenameGuildResult> => {
    const [g] = await tx
      .select({ id: guilds.id, name: guilds.name, serverId: guilds.serverId, leaderUserId: guilds.leaderUserId })
      .from(guilds)
      .where(eq(guilds.name, current))
      .for('update');
    if (!g) return { status: 'error', code: 'GUILD_NOT_FOUND' };

    const requested = normalizeGuildName(input.newName);
    // 초기화 이름은 한글+숫자라 문자셋을 만족한다(길이·비속어 검사 대상 아님).
    const next = requested || `길드${g.id.toString()}`;
    if (requested) {
      if (next.length < GUILD_NAME_MIN_LEN || next.length > GUILD_NAME_MAX_LEN) {
        return { status: 'error', code: 'NAME_INVALID' };
      }
      if (!GUILD_NAME_CHAR_REGEX.test(next)) return { status: 'error', code: 'NAME_CHARSET' };
      if (containsProfanity(next)) return { status: 'error', code: 'PROFANITY' };
    }
    if (next === g.name) return { status: 'error', code: 'SAME_NAME' };

    // guilds.name은 전역 unique — 사전 체크로 친절한 코드를 돌려주고, 제약이 최종 방어.
    const [dup] = await tx.select({ id: guilds.id }).from(guilds).where(eq(guilds.name, next)).limit(1);
    if (dup && dup.id !== g.id) return { status: 'error', code: 'NAME_TAKEN' };

    await tx.update(guilds).set({ name: next }).where(eq(guilds.id, g.id));

    if (input.sendMail) {
      // 길드장에게만 — 이름 조정 사유·재신청 안내를 받아야 하는 유일한 당사자.
      await mail(tx, g.leaderUserId, g.serverId, 'notice', title, body);
    }

    await tx.insert(adminActions).values({
      adminUserId,
      action: 'guild.rename',
      targetType: 'guild',
      targetId: g.id.toString(),
      payload: { from: g.name, to: next, mailed: input.sendMail },
    });

    revalidatePath('/admin/reports');
    return {
      status: 'success',
      guildId: g.id.toString(),
      from: g.name,
      to: next,
      mailed: input.sendMail,
    };
  });
}

/** 기각 — 신고 무효(기록 삭제 + count 0). 제재·우편 없음. */
export async function dismissReports(profileId: string): Promise<Result> {
  await requireAdmin();
  await db.transaction(async (tx) => {
    await clearReports(tx, profileId);
  });
  revalidatePath('/admin/reports');
  return { status: 'success' };
}
