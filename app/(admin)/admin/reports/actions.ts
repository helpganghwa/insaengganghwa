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

/**
 * 운영 조치 기록(2026-09-12) — 종전엔 경고·길드명 변경만 남고 닉네임 초기화·아바타 삭제·정지·해제·
 * 기각은 아무 흔적도 남기지 않았다. 유저가 이의를 제기하면 "누가·언제·왜"를 댈 근거가 없다.
 * 조치와 같은 트랜잭션이라 롤백되면 기록도 같이 사라진다(조치 없는 기록이 남지 않는다).
 */
function logAction(
  tx: Tx,
  adminUserId: string,
  action: string,
  profileId: string,
  payload: Record<string, unknown> | null,
) {
  return tx.insert(adminActions).values({ adminUserId, action, targetType: 'profile', targetId: profileId, payload });
}

/**
 * 계정 축 기록 — 신고 화면의 targetId는 **아바타 프로필 id**라 계정 id가 아니다(2026-09-12 6차 검수).
 * `target_id = <userId>`로 한 유저의 조치 이력을 뽑으면 신고 경유 조치가 통째로 빠지므로,
 * 계정에 가해진 조치(정지·해제)는 users 화면과 **같은 축**(targetType 'user')으로도 남긴다.
 */
function logUserAction(
  tx: Tx,
  adminUserId: string,
  action: string,
  userId: string,
  payload: Record<string, unknown> | null,
) {
  return tx.insert(adminActions).values({ adminUserId, action, targetType: 'user', targetId: userId, payload });
}
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
  const adminUserId = await requireAdmin();
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
    await logAction(tx, adminUserId, 'report.nickname_reset', profileId, {
      servers: chars.map((c) => c.serverId),
      nicknames: [...used],
    });
    revalidatePath('/admin/reports');
    return { status: 'success' };
  });
}

/** 아바타 신고 처리 — 기본 아바타로 전환(위반 아바타 삭제) + 생성비 지급 + 신고 정리. 기본 아바타는 삭제 안 함. */
export async function resetReportedAvatar(profileId: string): Promise<Result> {
  const adminUserId = await requireAdmin();
  return db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    if (!owner) return { status: 'error', code: 'NOT_FOUND' };
    const isDefault = (owner.options as { isDefault?: boolean } | null)?.isDefault === true;

    if (isDefault) {
      // 기본 아바타가 신고됨 — 삭제 불가, 안내만 후 정리.
      await mail(tx, owner.userId, owner.serverId, 'notice', '신고 처리 안내', '신고가 검토되었습니다.');
      await clearReports(tx, profileId);
      await logAction(tx, adminUserId, 'report.avatar_reset', profileId, { defaultAvatar: true });
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
    // 아바타 행 자체를 지우는 조치라 되돌릴 수 없다 — 어느 아바타였는지만이라도 남긴다.
    await logAction(tx, adminUserId, 'report.avatar_reset', profileId, {
      userId: owner.userId,
      serverId: owner.serverId,
      deleted: true,
      grantedDiamond: PROFILE_GENERATION_DIAMOND,
    });
    revalidatePath('/admin/reports');
    return { status: 'success' };
  });
}

/**
 * 경고 우편 문구(2026-09-09) — 신고 사유별. 뭉뚱그린 한 문장이면 받는 사람이 무엇을 고쳐야 할지 모른다는
 * 지적으로 분리했다. 사유는 **가장 많이 접수된 하나만** 쓴다(여러 개를 나열하면 결국 예전의 뭉뚱그린 문장이 된다).
 * 신고 건수·신고자는 넣지 않는다 — 누가 신고했는지 추측하게 되어 보복으로 이어진다.
 * 닉네임 변경 비용(💎300)은 지급하지 않는다: 신고만으로 재화가 나가면 악용 여지가 생긴다. 스스로 바꾸라고
 * 요구하지 않고 '확인해 달라'까지만 말한다(사용자 확정).
 */
const WARN_MAIL: Record<string, { title: string; body: string }> = {
  nickname: {
    title: '운영 경고 · 닉네임',
    body: '회원님의 닉네임에 대한 신고가 접수되었습니다.\n\n다른 이용자가 불쾌감을 느낄 수 있는 닉네임은 운영정책 위반에 해당합니다. 지금 사용 중인 닉네임을 다시 한 번 확인해 주세요.\n\n확인 후에도 조치가 필요하다고 판단되면 닉네임이 임의의 이름으로 초기화될 수 있습니다.',
  },
  avatar: {
    title: '운영 경고 · 아바타',
    body: '회원님의 아바타에 대한 신고가 접수되었습니다.\n\n선정적이거나 폭력적인 아바타, 타인을 불쾌하게 하는 아바타는 운영정책 위반에 해당합니다. 현재 대표로 설정하신 아바타를 다시 한 번 확인해 주세요.\n\n확인 후에도 조치가 필요하다고 판단되면 대표 아바타가 기본 아바타로 변경될 수 있습니다.',
  },
  bug_abuse: {
    title: '운영 경고 · 버그 악용',
    body: '회원님에 대해 버그 악용 신고가 접수되었습니다.\n\n의도되지 않은 동작을 알고도 반복해서 이용하는 행위는 운영정책 위반에 해당합니다. 문제가 되는 동작을 발견하셨다면 이용하지 마시고 고객센터로 알려 주세요.\n\n악용이 확인되면 획득한 재화 회수와 계정 정지로 이어질 수 있습니다.',
  },
};

/** 사유 없는 신고(other 등)·신고 기록이 사라진 경우의 기본 문구. */
const WARN_MAIL_DEFAULT = {
  title: '운영 경고',
  body: '회원님에 대한 신고가 접수되었습니다.\n\n운영정책 위반이 확인되면 닉네임 초기화, 아바타 변경, 계정 정지로 이어질 수 있습니다. 게임 내 활동을 다시 한 번 확인해 주세요.',
};

/**
 * 경고 — 비공개·변경 없이 경고 우편만(신고 기록 유지). 문구는 최다 접수 사유 하나로 고른다.
 * 경고는 아무것도 바꾸지 않아 화면에 흔적이 남지 않는다 → 눌렀는지 몰라 중복 발송하기 쉬웠다(2026-09-10).
 * admin_actions에 'report.warn'으로 남겨 신고 목록이 마지막 발송 시각·사유를 보여준다.
 */
export async function warnProfile(profileId: string): Promise<Result> {
  const adminUserId = await requireAdmin();
  return db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    if (!owner) return { status: 'error', code: 'NOT_FOUND' };
    // 최다 사유 1개 — 동수면 최근 접수가 앞선다(마지막에 무엇이 문제였는지가 더 현재에 가깝다).
    const [top] = await tx
      .select({ reason: profileReports.reason })
      .from(profileReports)
      .where(eq(profileReports.profileId, profileId))
      .groupBy(profileReports.reason)
      .orderBy(sql`count(*) desc`, sql`max(${profileReports.createdAt}) desc`)
      .limit(1);
    const m = (top && WARN_MAIL[top.reason]) || WARN_MAIL_DEFAULT;
    await mail(tx, owner.userId, owner.serverId, 'notice', m.title, m.body);
    await tx.insert(adminActions).values({
      adminUserId,
      action: 'report.warn',
      targetType: 'profile',
      targetId: profileId,
      payload: { reason: top?.reason ?? null },
    });
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
  const adminUserId = await requireAdmin();
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
    await logUserAction(tx, adminUserId, 'user.ban', owner.userId, {
      via: 'report',
      profileId,
      reason: reason.trim().slice(0, 500),
      until: until?.toISOString() ?? null,
    });
    revalidatePath('/admin/reports');
    return { status: 'success' };
  });
}

/** 정지 해제 — profileId의 소유자 banned 해제. */
export async function unbanReportedUser(profileId: string): Promise<Result> {
  const adminUserId = await requireAdmin();
  return db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    if (!owner) return { status: 'error', code: 'NOT_FOUND' };
    await tx
      .update(profiles)
      .set({ bannedAt: null, banReason: null, banUntil: null })
      .where(eq(profiles.id, owner.userId));
    await logUserAction(tx, adminUserId, 'user.unban', owner.userId, { via: 'report', profileId });
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
  const adminUserId = await requireAdmin();
  await db.transaction(async (tx) => {
    const owner = await ownerOf(tx, profileId);
    await clearReports(tx, profileId);
    await logAction(tx, adminUserId, 'report.dismiss', profileId, { userId: owner?.userId ?? null });
  });
  revalidatePath('/admin/reports');
  return { status: 'success' };
}
