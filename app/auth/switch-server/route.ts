import { NextResponse } from 'next/server';

import { getSessionUserId } from '@/lib/auth/session';
import { hasCharacterOn, correctServerFor } from '@/lib/game/server-guard';
import { touchLastServer } from '@/lib/game/server-select';

export const dynamic = 'force-dynamic';

/**
 * 활성 서버 교정(2026-09-21 ④) — RSC 렌더 중엔 쿠키를 못 바꾸므로, 레이아웃이 "쿠키가 내
 * 캐릭터가 없는 서버를 가리킨다"를 알아채면 헤더가 이 라우트로 보낸다(signout 라우트와 같은 패턴).
 *
 * 스스로 정한 서버로만 간다 — `to`는 **내 캐릭터가 있는 서버**만 허용하므로 이 라우트로는
 * 새 캐릭터가 생기지 않는다(새로 시작할지는 로그인 화면의 서버 선택이 묻는다).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.redirect(new URL('/login', origin));

  const raw = Number(url.searchParams.get('to'));
  const asked = Number.isInteger(raw) && raw >= 1 && raw <= 32767 ? raw : null;
  // 요청 값이 내 것이 아니면 계정이 실제로 쓰는 서버로 대신 보낸다(임의 값으로 못 넘어간다).
  // -1은 어느 캐릭터와도 겹치지 않는 값 — "지금 서버는 쓸 수 없다"로 두고 돌아갈 곳만 받는다.
  const to =
    asked != null && (await hasCharacterOn(userId, asked))
      ? asked
      : await correctServerFor(userId, -1);
  if (to == null) return NextResponse.redirect(new URL('/login', origin));

  await touchLastServer(userId, to).catch(() => undefined);
  const res = NextResponse.redirect(new URL('/', origin));
  res.cookies.set('srv', String(to), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
