/**
 * 서버 표시 배지 — 관리자 목록에서 각 행의 소속 서버를 일관 표기(srv{N}).
 * 운영은 전 서버를 한 화면에서 보므로(서버 전환 없음) 행마다 출처 서버를 항상 명시한다.
 */
export function ServerBadge({ serverId, className = '' }: { serverId: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-400 ${className}`}
    >
      srv{serverId}
    </span>
  );
}
