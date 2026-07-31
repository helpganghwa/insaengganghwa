'use client';

import { BackButton } from '@/components/BackNav';

/**
 * 공용 페이지 헤더 — 하단 탭에 없는 화면이 **같은 자리·같은 모양**으로 제목과 뒤로가기를 갖는다.
 *
 * 길드에서 먼저 자리잡은 형태(GuildPageHeader, 2026-07-30)를 그대로 승격했다. 길드 밖에는
 * 퍼지지 않아 깊은 화면 20곳에 뒤로가기가 없었고, 그중 절반은 제목조차 없었다 — 상점에
 * 들어가도 화면 어디에도 '상점'이라는 글자가 없는 식이다(2026-07-31 전 라우트 조사).
 *
 * 제목과 맥락을 **한 줄**에 둔다 — 두 줄이면 상세 화면이 많은 곳에서 세로 낭비가 크다.
 * 폭이 모자라면 맥락부터 줄어든다(제목은 끝까지 보인다).
 *
 * ⚠ 이미지가 상단을 덮는 화면(대난투 무대·세계지도)에는 쓰지 않는다 — 이미지가 잘리고
 * 제목이 두 번 나온다. 그쪽은 이미지 위에 띄우는 `BackFab`을 쓴다.
 *
 * icon = 문양·아이템처럼 대상을 식별하는 이미지(선택). right = 카운트·액션 슬롯(선택).
 * fallback = **히스토리가 없을 때만** 쓰는 목적지(딥링크·푸시·새로고침). 의미상 상위 화면을
 * 준다 — 전부 '/'로 두면 푸시로 들어온 유저가 홈으로 튕긴다.
 */
export function PageHeader({
  title,
  kicker,
  icon,
  right,
  fallback,
}: {
  title: React.ReactNode;
  /** 제목 옆 맥락 — 개수·소속 등. */
  kicker?: React.ReactNode;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  /**
   * 히스토리가 없을 때만 쓰는 목적지(딥링크·푸시·새로고침). 의미상 상위 화면을 준다 —
   * 전부 '/'로 두면 푸시로 들어온 유저가 홈으로 튕긴다.
   *
   * **생략하면 뒤로가기를 렌더하지 않고 제목만 남는다.** 세로 한 칸이 아까운 피드형 화면
   * (월드 로그·길드 로그)이 이쪽이다 — 진입 경로가 홈·길드홈 하나뿐이라 하단 탭으로
   * 충분하다는 판단(2026-07-31 사용자 결정).
   */
  fallback?: string;
}) {
  /**
   * ⚠ 여백은 이 컴포넌트가 갖지 않는다 — 호출부 컨테이너가 **`px-4 pb-4 pt-3` + 헤더 아래
   * `mb-3`** 규약을 지킨다(길드 10곳이 쓰던 규약). 헤더에 패딩을 넣으면 이미 pt-3을 주고
   * 있는 길드 화면이 두 배가 된다. 규약을 어기면 화면마다 헤더 높이가 달라 보인다
   * (2026-07-31 실기기 확인: py-1~py-6이 섞여 상단 여백이 제각각이었다).
   */
  return (
    <div className="flex items-center gap-1.5 px-0.5">
      {fallback ? <BackButton fallback={fallback} compact /> : null}
      {icon ? (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-zinc-100 dark:bg-zinc-900">
          {icon}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <h1 className="shrink-0 text-[14.5px] font-extrabold leading-none">{title}</h1>
        {kicker ? (
          <p className="min-w-0 truncate text-[10px] font-medium leading-none text-zinc-400">{kicker}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}
