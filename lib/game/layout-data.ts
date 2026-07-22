import 'server-only';

import { pgGuard } from '@/lib/db/guarded';
import { createCharacterAuto } from '@/lib/game/server-select';
import { pieceCombatPower } from '@/lib/game/balance';
import { parseFaceBox, type FaceBox } from '@/components/faceCrop';

// 반쪽 계정 자가복구 — 콜백의 createCharacterAuto가 실패하면 profiles만 있고 characters가
// 없는 계정이 생기고, 콜백은 재실행되지 않아 유저 스스로 복구할 방법이 없다(재로그인뿐).
// 셸 데이터 로드에서 감지(left join이라 nickname null == 캐릭터 부재) 시 1회 생성 후 재조회.
// 인스턴스당 유저별 재시도 간격을 두어 지속 실패 시 요청마다 생성 tx가 반복되는 것을 막는다.
const healAttemptAt = new Map<string, number>();
const HEAL_RETRY_MS = 5 * 60 * 1000;

/**
 * (game) 셸(헤더·하단 네비)에 필요한 최소 데이터.
 * 콜드/hang 시에도 셸이 즉시 200으로 나가도록, 이 로더는 layout에서 await하지 않고
 * Suspense 경계 안에서 소비한다(2026-05-28). 절대 throw 안 함 — 실패 시 기본값.
 */
export interface LayoutData {
  nickname: string;
  /** 닉네임 변경 횟수 — 헤더 이름 클릭 변경 팝업(첫 변경 무료/이후 과금) 계산용. */
  nicknameChangedCount: number;
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
  /** 집행관 구역명·지역 — 집행관이 아니면 null(미표시). 헤더 닉네임 줄 우측 노출(2026-07-22). */
  executorZone: string | null;
  executorZoneRegion: string | null;
  /** 닉네임 아래 서브라인(2026-07-21 문의 반영) — 전투력·최고강화·합산강화. 로드 실패 시 null(미표시). */
  stats: { combat: number; maxEnhance: number; sumEnhance: number } | null;
}

const DEFAULTS: LayoutData = {
  nickname: '플레이어',
  nicknameChangedCount: 0,
  diamond: 0n,
  hasUnreadMail: false,
  hasCompletedEnhance: false,
  hasFriendRequest: false,
  profileSouth: null,
  profileFaceBox: null,
  guildEmblemUrl: null,
  executorZone: null,
  executorZoneRegion: null,
  stats: null,
};

/**
 * 프로필(닉네임·다이아) + 우편 미수령 dot + 강화완료 dot을 단일 왕복(Promise.all)으로.
 * 4s 가드 + catch — 콜드 DB 커넥션이 풀에서 hang해도 기본값으로 graceful degrade.
 */
export async function loadLayoutData(userId: string, serverId: number): Promise<LayoutData> {
  try {
    // pgGuard: 타임아웃 시 쿼리 취소 → 풀 커넥션 즉시 회수(모든 페이지가 호출하는 핫패스).
    const [profileRows, mailRows, enhRows, friendReqRows, equipRows] = await Promise.all([
      pgGuard(
        (sql) => sql`
          select c.nickname, c.nickname_changed_count, c.diamond, up.rotations, up.options as profile_options,
                 g.emblem_url as guild_emblem_url,
                 z.name as executor_zone, z.region::text as executor_zone_region
          from profiles p
          left join characters c on c.user_id = p.id and c.server_id = ${serverId}
          left join user_profiles up on up.id = c.active_profile_id
          left join guild_members gm on gm.user_id = p.id and gm.server_id = ${serverId}
          left join guilds g on g.id = gm.guild_id
          left join zones z on z.executor_user_id = p.id and z.server_id = ${serverId}
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
      // 헤더 서브라인 스탯 — 전투력은 조각별 수식(pieceCombatPower)이라 행을 가져와 JS 합산
      // (채팅 프로필 팝업과 동일 산식·동일 소스 = 수치 일치).
      pgGuard(
        (sql) => sql`
          select enhance_level as e, transcend_level as t, max_enhance_level as mx
          from user_equipment
          where user_id = ${userId}::uuid and server_id = ${serverId}`,
        4000,
        'layout.stats',
      ),
    ]);
    const p = profileRows[0] as
      | {
          nickname?: string;
          nickname_changed_count?: number | string;
          diamond?: string | number | bigint;
          rotations?: unknown;
          profile_options?: unknown;
          guild_emblem_url?: string | null;
          executor_zone?: string | null;
          executor_zone_region?: string | null;
        }
      | undefined;
    // 캐릭터 부재(반쪽 계정) 자가복구 — 생성 성공 시 재조회로 이번 응답부터 정상 데이터.
    // 재귀는 1단으로 끝난다: 스로틀 맵이 직후 재시도를 차단하고, 성공 경로는 nickname이 채워진다.
    if (profileRows.length > 0 && p?.nickname == null) {
      const last = healAttemptAt.get(userId) ?? 0;
      if (Date.now() - last > HEAL_RETRY_MS) {
        healAttemptAt.set(userId, Date.now());
        try {
          await createCharacterAuto({ userId, serverId });
          console.warn('[layout] half-account healed — character created', { userId, serverId });
          return await loadLayoutData(userId, serverId);
        } catch (e) {
          console.warn('[layout] half-account heal failed', (e as Error).message);
        }
      }
    }
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
      nicknameChangedCount: Number(p?.nickname_changed_count ?? 0),
      diamond: p?.diamond != null ? BigInt(p.diamond as string) : 0n,
      hasUnreadMail: mailRows.length > 0,
      hasCompletedEnhance: Number((enhRows[0] as { n?: number | string } | undefined)?.n ?? 0) > 0,
      hasFriendRequest: friendReqRows.length > 0,
      profileSouth: (rot as Record<string, string> | null)?.south ?? null,
      profileFaceBox: faceBox,
      guildEmblemUrl: p?.guild_emblem_url ?? null,
      executorZone: p?.executor_zone ?? null,
      executorZoneRegion: p?.executor_zone_region ?? null,
      stats: (() => {
        const eq = equipRows as { e: number; t: number; mx: number }[];
        return {
          combat: eq.reduce((acc, r) => acc + pieceCombatPower(r.e, r.t), 0),
          maxEnhance: eq.reduce((acc, r) => Math.max(acc, r.mx), 0),
          sumEnhance: eq.reduce((acc, r) => acc + r.e, 0),
        };
      })(),
    };
  } catch (e) {
    console.warn('[layout] data load failed — defaults', (e as Error).message);
    return DEFAULTS;
  }
}
