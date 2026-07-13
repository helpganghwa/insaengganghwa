/**
 * 내 코드(#publicCode) 표시 — 설정·계정 섹션(2026-07-13 요청).
 * 친구 검색·문의 식별에 쓰는 코드를 유저가 직접 조회할 수 있게(복사 버튼은 미도입 — 사용자 결정).
 */
export function CodeRow({ code }: { code: string }) {
  return (
    <span className="font-mono text-sm tabular-nums text-zinc-600 dark:text-zinc-300">#{code}</span>
  );
}
