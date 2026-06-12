import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';

import { createSupabaseServerClient } from '@/lib/auth/supabase-server';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { canEnterServer, createCharacterAuto, touchLastServer } from '@/lib/game/server-select';

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
    if (!error) {
      const res = NextResponse.redirect(`${origin}${next}`);
      const userId = data.session?.user.id;
      if (userId) {
        try {
          // 우선순위: 로그인 화면 선택(login_srv) > 마지막 접속(last_server_id).
          const picked = Number(request.cookies.get('login_srv')?.value);
          let sid: number | null =
            Number.isInteger(picked) && picked >= 1 && picked <= 32767 ? picked : null;
          if (sid) {
            // 선택 서버에 캐릭터 없으면 자동 생성(가입과 동일 무마찰 — SERVER.md §3).
            if (!(await canEnterServer(userId, sid))) {
              await createCharacterAuto({ userId, serverId: sid });
            }
            await touchLastServer(userId, sid);
          } else {
            const [p] = await db
              .select({ sid: profiles.lastServerId })
              .from(profiles)
              .where(eq(profiles.id, userId))
              .limit(1);
            sid = p?.sid ?? null;
          }
          if (sid) {
            res.cookies.set('srv', String(sid), {
              httpOnly: true,
              sameSite: 'lax',
              path: '/',
              maxAge: 60 * 60 * 24 * 365,
            });
          }
          res.cookies.delete('login_srv');
        } catch (e) {
          console.warn('[auth.callback] srv select skipped', (e as Error).message);
        }
      }
      return res;
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
}
