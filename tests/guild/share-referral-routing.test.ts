import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { GET } from '@/app/s/[shareCode]/route';

/**
 * 공유 링크(/s/[code]) 라우팅 + 추천(pending_referral) 쿠키 보존 검증.
 * 인앱브라우저 탈출(/go) 시 쿠키가 유실되지 않도록, 게임시작(start)은 쿠키를 세팅하지 않고
 * /go로 보내고, 탈출 후 외부 브라우저가 다시 때리는 go=1에서만 쿠키를 세팅한다(2026-07-25).
 * publicCode는 대소문자 혼합이라 raid 정규식(^[a-z0-9]{10}$)에 안 걸려 DB 조회 없이 분기된다.
 */
const CODE = 'AbCdEf12'; // 8자 대소문자 혼합 — raid 코드 아님(DB 미조회)
const params = Promise.resolve({ shareCode: CODE });
const req = (url: string) => new NextRequest(new URL(url, 'https://ganghwa.app'));

describe('공유 링크 추천 라우팅(인앱 탈출 대응)', () => {
  it('[start=1] 쿠키 없이 /go?next=/s?go=1 로 탈출시킨다(인앱 유실 방지)', async () => {
    const res = await GET(req(`/s/${CODE}?start=1&s=5`), { params });
    expect(res.status).toBe(307);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('/go?next=');
    // next 안에 /s/[code]?go=1&s=5 가 인코딩되어 들어있다.
    const next = decodeURIComponent(new URL(loc).searchParams.get('next')!);
    expect(next).toBe(`/s/${CODE}?go=1&s=5`);
    // ⚠ 핵심: start 단계에선 추천 쿠키를 세팅하지 않는다(탈출 시 유실되므로).
    expect(res.cookies.get('pending_referral')).toBeUndefined();
  });

  it('[go=1] 외부 브라우저에서 추천 쿠키를 세팅하고 /login으로 보낸다(추천 보존 핵심)', async () => {
    const res = await GET(req(`/s/${CODE}?go=1&s=5`), { params });
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login');
    expect(res.cookies.get('pending_referral')?.value).toBe(CODE);
    expect(res.cookies.get('pending_referral_at')?.value).toBeTruthy();
    expect(res.cookies.get('pending_server')?.value).toBe('5');
  });

  it('[카드 클릭] 쿠키 세팅 + 공개 프로필(/u/[code])로 보낸다(기존 동작 유지)', async () => {
    const res = await GET(req(`/s/${CODE}?s=5`), { params });
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get('location')!).pathname).toBe(`/u/${CODE}`);
    expect(res.cookies.get('pending_referral')?.value).toBe(CODE);
  });
});
