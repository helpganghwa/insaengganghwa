'use client';

import { useState, useTransition } from 'react';

import { setMaintenanceAction } from './actions';

type Current = {
  mode: string;
  active: boolean;
  fromIso: string | null;
  untilIso: string | null;
  note: string | null;
};

const MODE_LABEL: Record<string, string> = {
  live: '정상 운영',
  maintenance: '점검',
  read_only: '읽기 전용',
  emergency_stop: '긴급 정지',
};
const MODES = ['live', 'maintenance', 'emergency_stop'] as const;

/** ISO → datetime-local 값(KST 'YYYY-MM-DDThh:mm'). */
function isoToKstLocal(iso: string | null): string {
  if (!iso) return '';
  const kst = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 16);
}

export function MaintenanceClient({ current }: { current: Current }) {
  const [mode, setMode] = useState(current.mode);
  const [fromVal, setFromVal] = useState(isoToKstLocal(current.fromIso)); // 비우면 즉시 시작
  const [indefinite, setIndefinite] = useState(current.untilIso === null);
  const [until, setUntil] = useState(isoToKstLocal(current.untilIso));
  const [note, setNote] = useState(current.note ?? '');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const apply = () => {
    setMsg(null);
    start(async () => {
      const r = await setMaintenanceAction(mode, fromVal, indefinite ? '' : until, note);
      setMsg(r.status === 'success' ? '적용됨 ✓ (타 인스턴스는 최대 20초 내 반영)' : `실패: ${r.code}`);
    });
  };

  const blocking = mode !== 'live';

  return (
    <div className="space-y-4">
      {/* 현재 상태 */}
      <div
        className={`rounded-xl border p-3 text-sm ${
          current.active
            ? 'border-red-700/60 bg-red-950/30 text-red-200'
            : 'border-emerald-800/50 bg-emerald-950/20 text-emerald-200'
        }`}
      >
        현재: <b>{MODE_LABEL[current.mode] ?? current.mode}</b>
        {current.active ? ' · 점검 적용 중' : current.mode === 'live' ? ' · 정상' : ' · 예약/대기'}
        {current.fromIso ? ` · 시작 ${isoToKstLocal(current.fromIso).replace('T', ' ')}` : ''}
        {current.untilIso ? ` · 종료 ${isoToKstLocal(current.untilIso).replace('T', ' ')} KST` : ''}
      </div>

      {/* 모드 선택 */}
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg border px-3 py-2 text-sm font-bold ${
              mode === m
                ? m === 'live'
                  ? 'border-emerald-500 bg-emerald-900/40 text-emerald-200'
                  : 'border-red-500 bg-red-900/40 text-red-200'
                : 'border-zinc-700 text-zinc-400'
            }`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {blocking && (
        <div className="space-y-3 rounded-xl border border-zinc-800 p-3">
          <div>
            <div className="mb-1 text-xs text-zinc-500">시작 시각 (KST · 비우면 즉시)</div>
            <input
              type="datetime-local"
              value={fromVal}
              onChange={(e) => setFromVal(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={indefinite}
              onChange={(e) => setIndefinite(e.target.checked)}
            />
            무기한 (종료 시각 미정)
          </label>
          {!indefinite && (
            <div>
              <div className="mb-1 text-xs text-zinc-500">종료 예정 (KST)</div>
              <input
                type="datetime-local"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base"
              />
            </div>
          )}
          <div>
            <div className="mb-1 text-xs text-zinc-500">안내 문구(선택)</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="점검 화면에 표시할 안내 (예: 긴급 패치 적용 중)"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base"
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={apply}
        disabled={pending}
        className="w-full rounded-xl bg-amber-600 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {pending ? '적용 중…' : mode === 'live' ? '점검 해제(정상 전환)' : '점검 적용'}
      </button>
      {msg && <p className="text-center text-xs text-zinc-400">{msg}</p>}
    </div>
  );
}
