import { NextResponse } from 'next/server';

import { and, eq, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { getChatBlocks, getMyGuildChannel, getRecentChat, isChatEnabled } from '@/lib/game/chat/service';
import { memoryRateLimited } from '@/lib/memory-ratelimit';
import { chatTopic } from '@/lib/game/chat/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 채널별 최신 항목 id(문자열 직렬화 — bigint는 JSON에 실을 수 없다). null=그 채널에 항목 없음. */
type LatestIds = { all: string | null; guild: string | null; whisper: string | null };

/**
 * 미니바 노티점(0155) — 전체/길드/귓속말의 '가장 최근 항목 id'를 한 문(스칼라 서브셀렉트 3개)으로.
 * 왕복을 1회로 고정한다(각 채널 인덱스의 max 스캔이라 비용은 사실상 상수).
 *
 * gid(길드 id)는 클라가 준 값을 검증 없이 쓴다 — 이 응답이 노출하는 것은 id 하나뿐이라
 * 본문·소속 어느 것도 새지 않는다. 실제 길드 메시지 조회 경로(getMyGuildChannel)는 그대로
 * 소속 검증을 거치므로, 여기 검증 1쿼리는 폴링 비용만 늘리고 얻는 게 없다.
 */
async function latestChannelIds(
  userId: string,
  serverId: number,
  gidRaw: string | null,
): Promise<LatestIds> {
  const gid = gidRaw && /^\d{1,19}$/.test(gidRaw) ? BigInt(gidRaw) : null;
  const [row] = (await db.execute(sql`
    select
      (select max(id)::text from chat_messages
        where server_id = ${serverId} and guild_id is null) as all_id,
      ${
        gid === null
          ? sql`null::text`
          : sql`(select max(id)::text from chat_messages
                  where server_id = ${serverId} and guild_id = ${gid})`
      } as guild_id,
      (select max(id)::text from whisper_messages
        where server_id = ${serverId} and to_user_id = ${userId}::uuid and hidden_at is null) as whisper_id
  `)) as unknown as { all_id: string | null; guild_id: string | null; whisper_id: string | null }[];
  return { all: row?.all_id ?? null, guild: row?.guild_id ?? null, whisper: row?.whisper_id ?? null };
}

/**
 * 최근 채팅 조회(0125) — ChatDock 초기 로드·폴링 폴백 공용.
 * GET /api/chat/recent?limit=1|200&channel=all|guild — 세션 필수(스크래핑 방지).
 * 길드 채널은 소속 검증 후에만 조회(미가입=길드 메시지 미노출). disabled면 UI가 도크 숨김.
 */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // 조회 리밋(인메모리, 2026-08-06) — 정상 클라는 분당 최대 ~8회(15s 폴링+탭 전환).
  // 30/분이면 실사용에 안 걸리고 스크래핑·폭주만 막는다. 감사: 조회 3라우트 리밋 0 지적.
  if (memoryRateLimited(`chatRecent:${userId}`, 30, 60_000)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  if (!(await isChatEnabled())) return NextResponse.json({ disabled: true, messages: [] });
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get('limit'));
  // 상한 200 — 유저 화면은 '최신 200건 고정'(페이지네이션 없음)이라 한 번에 받는 최대치가 200.
  const limit = Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 200 ? limitRaw : 200;
  const channel = url.searchParams.get('channel') === 'guild' ? 'guild' : 'all';
  const serverId = await getActiveServerId();

  // 경량 모드(2026-07-21) — 닫힌 미니바의 15초 상시 폴링용. 차단목록·닉네임·(전체 채널이면)
  // 길드 조회를 생략해 폴링당 DB 왕복을 최소화(세션당 하루 수천 회 × 전 세션 누적 절감).
  // 차단 필터·채널 토픽은 클라이언트가 초기/전체 조회에서 받은 상태를 유지한다.
  // 증분 폴링(2026-08-06, 동접 1천 대비) — 클라가 마지막으로 본 항목 id를 after로 보내면
  // 그 이후 항목만 돌려준다(평시 0~3건, ~1-2KB). after 항목이 목록에 없으면(오래 자리 비움·
  // 정리됨) 전체를 돌려주고 mode='full'로 알린다 — 클라는 델타면 append, full이면 치환.
  const after = url.searchParams.get('after');
  const slice = (msgs: { id: string }[]) => {
    if (!after) return { mode: 'full' as const, messages: msgs };
    const i = msgs.findIndex((m) => m.id === after);
    if (i < 0) return { mode: 'full' as const, messages: msgs };
    return { mode: 'delta' as const, messages: msgs.slice(i + 1) };
  };

  // 폴링(열림 포함)은 전부 lite — 차단목록·닉네임·토픽은 열기/탭 전환의 전체 조회가 담당.
  // 월드 채널 lite + 캐시 히트 = DB 0쿼리(길드는 소속 검증 1쿼리만 — 보안상 생략 불가).
  if (url.searchParams.get('lite') === '1') {
    const guild = channel === 'guild' ? await getMyGuildChannel(userId, serverId) : null;
    const guildId = channel === 'guild' && guild ? BigInt(guild.guildId) : null;
    const [full, latestIds] = await Promise.all([
      channel === 'guild' && !guild ? Promise.resolve([]) : getRecentChat(serverId, limit, guildId),
      latestChannelIds(userId, serverId, url.searchParams.get('gid')),
    ]);
    const { mode, messages } = slice(full);
    return NextResponse.json({ mode, messages, latestIds });
  }

  const [blocked, [meChar], guild] = await Promise.all([
    getChatBlocks(userId, serverId),
    db
      .select({ nickname: characters.nickname })
      .from(characters)
      .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)))
      .limit(1),
    getMyGuildChannel(userId, serverId),
  ]);

  const guildId = channel === 'guild' && guild ? BigInt(guild.guildId) : null;
  // 길드 탭인데 미가입 → 메시지 없이 가입 안내만(UI가 처리).
  // latestIds를 전체 조회에도 동봉(2026-08-07) — lite 폴링(60초)만 실으면 새로고침 직후
  // 첫 폴링까지 노티점 판정 자체가 불가능한 공백이 생긴다. 길드 id는 여기서 이미 해소됨.
  const [full, latestIds] = await Promise.all([
    channel === 'guild' && !guild ? Promise.resolve([]) : getRecentChat(serverId, limit, guildId),
    latestChannelIds(userId, serverId, guild ? guild.guildId : null),
  ]);
  const { mode, messages } = slice(full);

  return NextResponse.json({
    channel: chatTopic(serverId, guildId),
    // 길드 실시간 토픽(HMAC 토큰 포함) — 소속 검증된 응답으로만 전달(비길드원 도청 차단).
    guildChannel: guild ? chatTopic(serverId, BigInt(guild.guildId)) : null,
    me: userId,
    meNickname: meChar?.nickname ?? null,
    guild: guild ? { id: guild.guildId, name: guild.guildName } : null,
    mode,
    messages,
    blocked,
    latestIds,
  });
}
