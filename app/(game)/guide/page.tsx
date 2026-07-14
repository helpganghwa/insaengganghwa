import { GuideClient } from './GuideClient';

/**
 * 게임 안내 — 전 콘텐츠 설명(2026-07-14, 페이지별 투어 대체).
 * 본문은 GuideClient(4×3 카테고리 그리드 sticky + 선택 카테고리만 표시, 해시 동기화).
 * GNB 위 GuideTicker 탭·/me 메뉴에서 진입. 정적 콘텐츠(DB 무접촉).
 */
export const dynamic = 'force-static';

export default function GuidePage() {
  return <GuideClient />;
}
