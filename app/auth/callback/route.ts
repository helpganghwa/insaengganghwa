import { NextResponse, after, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import {
  canEnterServer,
  createCharacterAuto,
  touchLastServer,
  latestOpenServerId,
} from '@/lib/game/server-select';
import { attributeReferralFromShare } from '@/lib/game/referral/redeem';
import {
  PENDING_REFERRAL_COOKIE,
  PENDING_REFERRAL_AT_COOKIE,
} from '@/lib/game/referral/auto-attribute';

// 콜백 시점 profiles.createdAt이 이 윈도 안이면 "방금 가입"으로 판정(신규 가입 전환).
// handle_new_user 트리거~콜백 간격은 ms 단위라 5분은 시계 스큐까지 흡수하는 안전폭이다.
const REFERRAL_NEW_SIGNUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Kakao OAuth 콜백 — Supabase 토큰 교환 후 이 경로로 리다이렉트.
 * code → 세션 쿠키 변환 후 next(기본 '/')로 이동.
 *
 * srv 쿠키 복원(SERVER.md §3): 활성 서버는 쿠키 기반(기본 1)이라 신규 가입(최신 서버 자동
 * 배정)·기기 변경 시 쿠키가 비어 1서버로 떨어진다 — 로그인 시 last_server_id로 복원해
 * 항상 마지막(또는 배정된) 서버에서 게임이 시작되게 한다. 실패해도 로그인은 진행(기본 1).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // 내부 경로만 허용 — open-redirect 방지(절대 URL·//호스트 차단).
  const rawNext = searchParams.get('next') ?? '/';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[auth.callback] exchange failed', {
        status: error.status,
        code: (error as { code?: string }).code,
        message: error.message,
      });
    }
    if (!error) {
      const userId = data.session?.user.id;
      // 카카오 픽셀 전환 파라미터 — 신규 가입=회원가입(signup), 그 외=로그인(login).
      // 클라 로더(KakaoPixel)가 이 파라미터를 보고 completeRegistration/login을 1회 발화한다.
      // 신규 판정은 추천인 보상과 동일 신호(createdAt이 윈도 이내 = 방금 가입). 실패해도 로그인은 진행.
      let kakaoEv: 'signup' | 'login' | null = null;
      if (userId) {
        try {
          const [acct] = await db
            .select({ createdAt: profiles.createdAt })
            .from(profiles)
            .where(eq(profiles.id, userId))
            .limit(1);
          const isNew =
            !!acct && Date.now() - acct.createdAt.getTime() <= REFERRAL_NEW_SIGNUP_WINDOW_MS;
          kakaoEv = isNew ? 'signup' : 'login';
        } catch (e) {
          console.warn('[auth.callback] pixel ev skipped', (e as Error).message);
        }
      }
      const dest = new URL(`${origin}${next}`);
      if (kakaoEv) dest.searchParams.set('kakao_ev', kakaoEv);
      const res = NextResponse.redirect(dest.toString());
      if (userId) {
        try {
          // 대상 서버 확정(2026-07-10 R1 조정): 명시 클릭(login_srv) > **공유 링크 의도
          // (pending_server — 초대 링크를 타고 왔으면 기존 유저도 그 서버 우선, 사용자 확정)**
          // > 마지막 접속(last_server_id) > 최신 open. pending_server는 소비 후 즉시 소거되는
          // 1회성이고, 로그인 화면 셀렉터 기본값도 같은 서버를 표시하므로 유저가 보고 로그인한다.
          // login_srv는 셀렉터 **클릭 시에만** 기록됨(마운트 자동 기록이 복원을 가리던 R1 수정).
          const asSid = (raw: string | undefined): number | null => {
            const n = Number(raw);
            return Number.isInteger(n) && n >= 1 && n <= 32767 ? n : null;
          };
          let sid: number | null = asSid(request.cookies.get('login_srv')?.value);
          if (!sid) sid = asSid(request.cookies.get('pending_server')?.value);
          if (!sid) {
            const [p] = await db
              .select({ sid: profiles.lastServerId })
              .from(profiles)
              .where(eq(profiles.id, userId))
              .limit(1);
            sid = p?.sid ?? null;
          }
          if (!sid) sid = await latestOpenServerId();
          // 그 서버에 캐릭터가 없으면 생성(가입 보너스 + 기본 아바타 + 거주지 포함).
          // 가입 트리거(0067)는 더 이상 캐릭터를 만들지 않으므로, 신규 가입·새 서버 합류 모두
          // 여기서 "고른 서버에 정확히 1개"만 생성된다(유령 캐릭터·중복 보너스 제거).
          if (sid) {
            if (!(await canEnterServer(userId, sid))) {
              await createCharacterAuto({ userId, serverId: sid });
            }
            await touchLastServer(userId, sid);
            res.cookies.set('srv', String(sid), {
              httpOnly: true,
              sameSite: 'lax',
              path: '/',
              maxAge: 60 * 60 * 24 * 365,
            });
          }
          res.cookies.delete('login_srv');
          // 공유 링크 서버 의도는 1회성 — 소비 후 소거(F7: 7일 잔존 시 이후 재로그인의
          // 기본 선택을 계속 오염시키던 문제).
          res.cookies.delete('pending_server');
        } catch (e) {
          console.warn('[auth.callback] srv select skipped', (e as Error).message);
        }

        // ── 초대 보상 — 가입 성공(이 콜백)이 정확한 지급 시점 ──
        // 트리거가 방금 만든 profiles.createdAt이 최근(≤윈도)이면 신규 가입 → 추천인 보상.
        // 기존 유저가 공유 링크를 타도 createdAt이 오래돼 제외. 멱등(redeem new_user_id UNIQUE).
        const refCode = request.cookies.get(PENDING_REFERRAL_COOKIE)?.value;
        if (refCode) {
          try {
            const [acct] = await db
              .select({ createdAt: profiles.createdAt })
              .from(profiles)
              .where(eq(profiles.id, userId))
              .limit(1);
            const isNewSignup =
              !!acct && Date.now() - acct.createdAt.getTime() <= REFERRAL_NEW_SIGNUP_WINDOW_MS;
            if (isNewSignup) {
              const atRaw = request.cookies.get(PENDING_REFERRAL_AT_COOKIE)?.value;
              const clickedAtMs = atRaw && /^\d+$/.test(atRaw) ? Number(atRaw) : undefined;
              // after — 리다이렉트 지연 0, 응답 후 보장 실행(보상 누락 방지). 쿠키는 유지해
              // (game) layout 멱등 백스톱이 드문 after 실패 시 재시도하게 둔다.
              after(() =>
                attributeReferralFromShare(userId, refCode, clickedAtMs).catch((e) =>
                  console.warn('[auth.callback] referral attribute failed', (e as Error).message),
                ),
              );
            } else {
              // 기존 유저가 링크를 탄 경우 — 귀속 없음. 쿠키 소비(백스톱 무의미한 재시도 제거).
              res.cookies.set(PENDING_REFERRAL_COOKIE, '', { path: '/', maxAge: 0 });
              res.cookies.set(PENDING_REFERRAL_AT_COOKIE, '', { path: '/', maxAge: 0 });
            }
          } catch (e) {
            console.warn('[auth.callback] referral skipped', (e as Error).message);
          }
        }
      }
      return res;
    }
  } else {
    console.error('[auth.callback] no code param', { params: searchParams.toString() });
    // 사용자가 카카오 동의를 취소하면 code 없이 error=access_denied로 복귀 — 실패가 아니라
    // 취소이므로 조용한 안내로 구분(붉은 '오류'가 아닌 회색 안내).
    const oauthErr = searchParams.get('error');
    if (oauthErr === 'access_denied') {
      return NextResponse.redirect(`${origin}/login?error=cancelled`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
