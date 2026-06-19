import 'server-only';

import { pgGuard } from '@/lib/db/guarded';
import { parseFaceBox, type FaceBox } from '@/components/faceCrop';

/**
 * (game) 셸(헤더·하단 네비)에 필요한 최소 데이터.
 * 콜드/hang 시에도 셸이 즉시 200으로 나가도록, 이 로더는 layout에서 await하지 않고
 * Suspense 경계 안에서 소비한다(2026-05-28). 절대 throw 안 함 — 실패 시 기본값.
 */
export interface LayoutData {
  nickname: string;
  diamond: bigint;
  hasUnreadMail: boolean;
  hasCompletedEnhance: boolean;
  /** 친구 받은 요청 있음(프로필 탭 빨간점). */
  hasFriendRequest: boolean;
  /** 헤더 머리 아이콘용 — 활성 프로필 south rotation URL. 없으면 null(폴백 아이콘). */
  profileSouth: string | null;
  /** 활성 프로필 얼굴 박스(검수 산출) — 헤더 썸네일 정밀 크롭. 없으면 null(폴백 크롭). */
  profileFaceBox: FaceBox | null;
  /** 헤더 우측 길드 문양 — 미소속/생성중이면 null(미표시). */
  guildEmblemUrl: string | null;
}

const DEFAULTS: LayoutData = {
  nickname: '플레이어',
  diamond: 0n,
  hasUnreadMail: false,
  hasCompletedEnhance: false,
  hasFriendRequest: false,
  profileSouth: null,
  profileFaceBox: null,
  guildEmblemUrl: null,
};

/**
 * 프로필(닉네임·다이아) + 우편 미수령 dot + 강화완료 dot을 단일 왕복(Promise.all)으로.
 * 4s 가드 + catch — 콜드 DB 커넥션이 max:1 풀에서 hang해도 기본값으로 graceful degrade.
 */
export async function loadLayoutData(userId: string, serverId: number): Promise<LayoutData> {
  try {
    // pgGuard: 타임아웃 시 쿼리 취소 → 풀 커넥션 즉시 회수(모든 페이지가 호출하는 핫패스).
    const [profileRows, mailRows, enhRows, friendReqRows] = await Promise.all([
      pgGuard(
        (sql) => sql`
          select c.nickname, c.diamond, up.rotations, up.options as profile_options, g.emblem_url as guild_emblem_url
          from profiles p
          left join characters c on c.user_id = p.id and c.server_id = ${serverId}
          left join user_profiles up on up.id = c.active_profile_id
          left join guild_members gm on gm.user_id = p.id and gm.server_id = ${serverId}
          left join guilds g on g.id = gm.guild_id
          where p.id = ${userId}::uuid
          limit 1`,
        4000,
        'layout.profile',
      ),
      pgGuard(
        (sql) => sql`
          select 1 from mailbox
          where user_id = ${userId}::uuid
            and server_id = ${serverId}
            and claimed_at is null
            and (expires_at is null or expires_at > now())
          limit 1`,
        4000,
        'layout.mail',
      ),
      pgGuard(
        (sql) => sql`
          select count(*)::int as n from enhancement_jobs
          where user_id = ${userId}::uuid and server_id = ${serverId}
            and status = 'running' and complete_at <= now()`,
        4000,
        'layout.enhance',
      ),
      // 친구 받은 요청 존재 여부.
      pgGuard(
        (sql) => sql`
          select 1 from friend_links
          where addressee_id = ${userId}::uuid and server_id = ${serverId} and status = 'pending'
          limit 1`,
        4000,
        'layout.friendreq',
      ),
    ]);
    const p = profileRows[0] as
      | {
          nickname?: string;
          diamond?: string | number | bigint;
          rotations?: unknown;
          profile_options?: unknown;
          guild_emblem_url?: string | null;
        }
      | undefined;
    // options(jsonb)도 문자열일 수 있어 방어 파싱 후 faceBox 추출.
    let opts = p?.profile_options as Record<string, unknown> | string | null | undefined;
    if (typeof opts === 'string') {
      try { opts = JSON.parse(opts) as Record<string, unknown>; } catch { opts = null; }
    }
    const faceBox = parseFaceBox((opts as Record<string, unknown> | null)?.faceBox);
    // rotations(jsonb)는 postgres.js 기본 파서가 객체로 파싱하나, 문자열일 경우 방어적 파싱.
    let rot = p?.rotations as Record<string, string> | string | null | undefined;
    if (typeof rot === 'string') {
      try {
        rot = JSON.parse(rot) as Record<string, string>;
      } catch {
        rot = null;
      }
    }
    return {
      nickname: p?.nickname ?? '플레이어',
      diamond: p?.diamond != null ? BigInt(p.diamond as string) : 0n,
      hasUnreadMail: mailRows.length > 0,
      hasCompletedEnhance: Number((enhRows[0] as { n?: number | string } | undefined)?.n ?? 0) > 0,
      hasFriendRequest: friendReqRows.length > 0,
      profileSouth: (rot as Record<string, string> | null)?.south ?? null,
      profileFaceBox: faceBox,
      guildEmblemUrl: p?.guild_emblem_url ?? null,
    };
  } catch (e) {
    console.warn('[layout] data load failed — defaults', (e as Error).message);
    return DEFAULTS;
  }
}
