'use client';

import Link from 'next/link';

import { faceCropStyle, type FaceBox } from '@/components/faceCrop';
import { profileHref } from '@/lib/game/profile/href';
import type { ChatMention } from '@/lib/game/chat/service';

/**
 * 채팅 본문·썸네일 공용 렌더 — 전체·길드·귓속말이 같은 멘션 표기와 같은 얼굴 크롭을 쓴다.
 */

/**
 * 멘션 렌더(0128) — 서버가 검증한 유효 멘션만 @ 제거 + 은은한 강조, 닉 클릭 시 프로필 상세.
 * 무효 @토큰은 입력한 그대로 일반 텍스트. 색은 절제(내 닉만 약간 진하게).
 */
export function renderMentionBody(
  body: string,
  mentions: ChatMention[] | null,
  meCode: string | null,
  serverId: number,
) {
  return body.split(/(@[^\s@]{1,12})/g).map((part, i) => {
    const nick = part.startsWith('@') ? part.slice(1) : null;
    const hit = nick ? mentions?.find((mm) => mm.n === nick) : null;
    if (nick && hit) {
      // '나를 지목한 멘션' 판정은 불변 코드로(2026-08-07 이름 감사 H2). 닉 문자열로 비교하면
      // 남이 쓰던 닉을 물려받은 순간, 그 사람을 부른 과거 멘션이 전부 내 것으로 강조된다.
      const cls =
        meCode && hit.c === meCode
          ? 'font-bold text-amber-600 dark:text-amber-400'
          : 'font-semibold text-amber-600/85 dark:text-amber-400/85';
      if (hit.c) {
        return (
          <Link
            prefetch={false}
            key={i}
            href={profileHref(hit.c, serverId)}
            className={`${cls} hover:underline`}
          >
            {nick}
          </Link>
        );
      }
      return (
        <span key={i} className={cls}>
          {nick}
        </span>
      );
    }
    return part;
  });
}

/**
 * 유저 썸네일 — 정면 아바타 + faceBox 얼굴 크롭. size는 레이아웃 클래스(h-6 w-6 등).
 * loading="lazy" 금지(모바일 위 스크롤 버벅임, 2026-08-24) — 행이 content-visibility로
 * 지연 페인트되는 구조라, lazy까지 겹치면 위로 스크롤해 행이 실체화되는 순간에 네트워크
 * 로드+디코드+픽셀 확대 래스터가 한꺼번에 몰렸다. 즉시 로드(대부분 브라우저 캐시 적중)
 * + decoding="async"로 디코드만 비동기 유지.
 */
export function avatarBox(m: { avatar: string | null; faceBox: FaceBox | null }, size: string) {
  return (
    <span className={`${size} shrink-0 overflow-hidden`}>
      {m.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.avatar}
          alt=""
          decoding="async"
          className="h-full w-full"
          style={faceCropStyle(m.faceBox)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[11px]">👤</span>
      )}
    </span>
  );
}
