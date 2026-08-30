'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * 위키 외부 열기 링크 — PWA(standalone)에서만 cross-origin 주소로 연다(2026-08-21 버그 수정).
 *
 * 같은 오리진의 /wiki는 PWA 스코프 안이라 target=_blank여도 iOS standalone이 앱 안에서
 * 열어버린다(390 고정 스케일과 위키 device-width viewport가 섞이는 원인 증상). cross-origin
 * URL은 OS가 브라우저 뷰(iOS in-app Safari·Android CCT)로 강제 분리해 연다 — Vercel 기본
 * 도메인이 같은 배포를 서빙하므로 콘텐츠 동일. 일반 브라우저는 기존처럼 ganghwa.app 새 탭
 * (브랜드 주소 유지 — 첫 페인트는 서버 렌더와 동일한 /wiki라 하이드레이션 불일치 없음).
 */
// ⚠ 프로젝트 기본 도메인(insaengganghwa.vercel.app)은 alias가 스테이징(master-dev)을 가리킨 적이 있어(2026-08-30 사고 —
// PWA 유저가 스테이징 위키를 봄) **프로덕션 전용 자동 alias**를 쓴다. 프로덕션 배포마다 자동 갱신되는 주소.
const PWA_WIKI_ORIGIN = 'https://insaengganghwa-insaengganghwa.vercel.app';

export function WikiLink({ className, children }: { className?: string; children: ReactNode }) {
  const [href, setHref] = useState('/wiki');
  useEffect(() => {
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (standalone) setHref(`${PWA_WIKI_ORIGIN}/wiki`);
  }, []);
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
