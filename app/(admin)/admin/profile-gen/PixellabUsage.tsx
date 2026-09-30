import { pixellabBalances } from '@/lib/game/profile/pixellab-balance';

/** Pixellab 키 3개의 남은 생성 횟수·충전 잔액·다음 리셋 — 서버에서만 조회(키는 브라우저로 가지 않는다). */
export async function PixellabUsage() {
  const rows = await pixellabBalances();
  return (
    <div className="grid grid-cols-3 gap-2">
      {rows.map((b) => {
        const pct = b.remaining != null && b.total ? Math.max(0, Math.min(100, (b.remaining / b.total) * 100)) : 0;
        const low = pct < 15;
        return (
          <div key={b.idx} className="rounded-lg border border-zinc-700 bg-zinc-900 p-2.5 text-xs">
            <div className="flex items-baseline justify-between">
              <b className="text-sm">key{b.idx}</b>
              <span className="text-[10px] text-zinc-500">{b.plan ? b.plan.replace(/:.*/, '') : ''}</span>
            </div>
            {!b.configured ? (
              <p className="mt-2 text-zinc-500">이 배포에 키 없음</p>
            ) : !b.ok ? (
              <p className="mt-2 text-red-300">조회 실패</p>
            ) : (
              <>
                <div className="mt-1.5 tabular-nums">
                  <b className={`text-base ${low ? 'text-red-300' : 'text-zinc-50'}`}>{(b.remaining ?? 0).toLocaleString('ko-KR')}</b>
                  <span className="text-zinc-500"> / {(b.total ?? 0).toLocaleString('ko-KR')}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className={`h-full ${low ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1.5 text-zinc-400">충전 잔액 ${(b.usd ?? 0).toFixed(2)}</div>
              </>
            )}
            <div className="mt-0.5 text-zinc-400">
              리셋 {b.resetDate.slice(5).replace('-', '/')}{' '}
              <span className="text-zinc-500">({b.resetInDays === 0 ? '오늘' : `D-${b.resetInDays}`})</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
