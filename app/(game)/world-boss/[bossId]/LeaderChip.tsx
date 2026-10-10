/** 원정대장 칩 — 이름 옆 작은 알약(내 원정대 패널 헤더와 같은 색). 전투 재생 행·결과 표·출발 팝업 행에서 쓴다(10-11 사용자: 어울리는 곳엔 최대한). */
export function LeaderChip({ className = '' }: { className?: string }) {
  return <span className={`shrink-0 rounded-full bg-orange-700/90 px-1.5 text-[8.5px] font-extrabold leading-[1.6] text-orange-50 ${className}`}>원정대장</span>;
}
