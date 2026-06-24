import { signOut } from '@/lib/auth/actions';
import type { BanState } from '@/lib/game/account/ban';

/** 계정 정지 풀사이즈 화면 — (game) 레이아웃이 banned 유저에게 children 대신 렌더. */
function fmtUntil(until: Date | null): string {
  if (!until) return '영구 정지';
  const kst = new Date(until.getTime() + 9 * 3600 * 1000);
  const mm = `${kst.getUTCMonth() + 1}`.padStart(2, '0');
  const dd = `${kst.getUTCDate()}`.padStart(2, '0');
  const hh = `${kst.getUTCHours()}`.padStart(2, '0');
  const mi = `${kst.getUTCMinutes()}`.padStart(2, '0');
  return `${mm}월 ${dd}일 ${hh}:${mi}까지 (KST)`;
}

export function BanScreen({ state }: { state: BanState }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950 px-8 text-center text-zinc-100">
      <div className="text-6xl" aria-hidden>
        🚫
      </div>
      <h1 className="text-xl font-extrabold">이용이 제한된 계정입니다</h1>
      <p className="max-w-xs whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
        {state.reason?.trim() || '운영정책 위반으로 계정 이용이 제한되었습니다.'}
      </p>
      <div className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-amber-300">
        {fmtUntil(state.until)}
      </div>
      <p className="max-w-xs text-[11px] text-zinc-500">
        이의가 있으면 고객센터(help@ganghwa.app)로 문의해 주세요.
      </p>
      <form action={signOut}>
        <button type="submit" className="mt-2 rounded-xl border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-300">
          로그아웃
        </button>
      </form>
    </div>
  );
}
