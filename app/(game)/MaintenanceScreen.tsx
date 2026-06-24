import type { MaintenanceState } from '@/lib/game/system-mode';

/**
 * 서버 점검 풀사이즈 화면 — 점검 유효 시 (game) 레이아웃이 children 대신 렌더.
 * 로그인 페이지는 (game) 그룹 밖이라 점검 중에도 접속 가능. isAdmin은 게이트에서 예외.
 */
function fmtUntil(until: Date | null): string {
  if (!until) return '점검 종료 시각 미정';
  const kst = new Date(until.getTime() + 9 * 3600 * 1000);
  const mm = `${kst.getUTCMonth() + 1}`.padStart(2, '0');
  const dd = `${kst.getUTCDate()}`.padStart(2, '0');
  const hh = `${kst.getUTCHours()}`.padStart(2, '0');
  const mi = `${kst.getUTCMinutes()}`.padStart(2, '0');
  return `${mm}월 ${dd}일 ${hh}:${mi} 종료 예정 (KST)`;
}

export function MaintenanceScreen({ state }: { state: MaintenanceState }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950 px-8 text-center text-zinc-100">
      <div className="text-6xl" aria-hidden>
        🔧
      </div>
      <h1 className="text-xl font-extrabold">서버 점검 중</h1>
      <p className="max-w-xs text-sm leading-relaxed text-zinc-400">
        {state.note?.trim() || '더 나은 서비스를 위해 점검을 진행하고 있어요. 잠시 후 다시 찾아와 주세요.'}
      </p>
      <div className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-amber-300">
        {fmtUntil(state.until)}
      </div>
    </div>
  );
}
