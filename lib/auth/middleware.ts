import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * 세션 쿠키 자동 갱신 — Supabase SSR 패턴의 **조건부** 변형(감사 P7, 2026-07-07).
 *
 * 표준 패턴은 매 요청 `getUser()`(Auth 서버 원격 호출)지만, 이 미들웨어는 인가 결정을
 * 하지 않고(세션 식별은 각 페이지의 로컬 JWT `getClaims`) 오직 **토큰 리프레시**만
 * 담당하므로, 토큰 만료가 임박했을 때만 원격 호출하면 충분하다:
 *  - 만료까지 여유(≥10분): 쿠키 로컬 파싱(getSession)만 — 네트워크 0회.
 *    전 내비게이션의 Auth RTT 제거 + Auth 장애가 전 사이트 지연으로 번지는 결합 차단.
 *  - 만료 임박/파싱 실패: 기존대로 getUser()로 갱신(타임아웃 가드 유지).
 * 갱신을 놓쳐도 안전한 이유(기존과 동일): refresh 누락은 다음 요청에서 자연 복구되고,
 * 위조 쿠키는 어차피 하류의 서명 검증(getClaims)이 거른다 — 여기서 통과시켜도 무해.
 */
// SDK(auth-js)의 실제 회전 마진은 90초 — 마진을 그보다 크게 잡으면 (마진−90초) 구간은
// 매 요청 원격 getUser RTT만 내고 회전은 안 일어난다(리뷰 2026-07-07: 10분→2분 축소).
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // 1) 만료 판정 — getSession은 유효 세션이면 쿠키 로컬 파싱만(무네트워크).
  //    만료 세션이면 SDK가 자체 refresh를 시도할 수 있어 동일하게 타임아웃 가드.
  //    파싱 실패·비로그인·판정 불가는 전부 "갱신 필요" 취급(기존 동작으로 폴백).
  let needRefresh = true;
  try {
    const { data } = await Promise.race([
      supabase.auth.getSession(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SESSION_READ_TIMEOUT')), 1500),
      ),
    ]);
    if (!data.session) {
      needRefresh = false; // 비로그인 — 갱신할 세션 자체가 없음.
    } else {
      const expMs = (data.session.expires_at ?? 0) * 1000;
      needRefresh = expMs - Date.now() < REFRESH_MARGIN_MS;
    }
  } catch {
    needRefresh = true;
  }

  // 2) 임박 시에만 원격 갱신 — Auth 원격 호출이 콜드/지연 시 미들웨어가 통째로 hang하면
  //    전 사이트가 about:blank 무한로딩이 되므로 타임아웃 가드 필수(2026-05-29).
  //    실패/지연 시 그대로 통과 — refresh 누락은 다음 요청에서 자연 복구.
  if (needRefresh) {
    try {
      await Promise.race([
        supabase.auth.getUser(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SESSION_REFRESH_TIMEOUT')), 2500),
        ),
      ]);
    } catch {
      // best-effort — 통과.
    }
  }
  return response;
}
