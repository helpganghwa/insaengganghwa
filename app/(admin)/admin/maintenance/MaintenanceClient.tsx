'use client';

import { useState, useTransition } from 'react';

import { rerunConquestAction, setMaintenanceAction } from './actions';

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

const RERUN_ERROR: Record<string, string> = {
  BAD_DAY: '날짜 형식이 올바르지 않다 (YYYY-MM-DD).',
  FUTURE_DAY: '미래 날짜는 재정산할 수 없다.',
  TOO_OLD_DAY: '오늘과 어제만 재정산할 수 있다.',
  BAD_SERVER: '운영 중인 서버가 아니다.',
};

export function MaintenanceClient({
  current,
  serverIds,
  todayKst,
}: {
  current: Current;
  serverIds: number[];
  /** 서버 컴포넌트가 계산한 오늘(KST) — 클라 시계로 초기화하면 자정 경계에서 하이드레이션 불일치. */
  todayKst: string;
}) {
  const [mode, setMode] = useState(current.mode);
  const [fromVal, setFromVal] = useState(isoToKstLocal(current.fromIso)); // 비우면 즉시 시작
  const [indefinite, setIndefinite] = useState(current.untilIso === null);
  const [until, setUntil] = useState(isoToKstLocal(current.untilIso));
  const [note, setNote] = useState(current.note ?? '');
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // 점령전 재정산 — 23시 cron이 실패한 날의 유일한 복구 수단.
  const [rrServer, setRrServer] = useState(serverIds[0] ?? 1);
  const [rrDay, setRrDay] = useState(todayKst);
  // 선택 하한 = 어제(KST) — 서버의 TOO_OLD_DAY와 같은 범위를 입력에서도 막는다(정오 기준 산술, DST 무관).
  const rrMinDay = (() => {
    const d = new Date(`${todayKst}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const [rrPending, rrStart] = useTransition();
  const [rrMsg, setRrMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = () => {
    setMsg(null);
    start(async () => {
      const r = await setMaintenanceAction(mode, fromVal, indefinite ? '' : until, note);
      setMsg(r.status === 'success' ? '적용됨 ✓ (타 인스턴스는 최대 20초 내 반영)' : `실패: ${r.code}`);
    });
  };

  const rerun = () => {
    setRrMsg(null);
    rrStart(async () => {
      try {
        const r = await rerunConquestAction(rrServer, rrDay);
        if (r.status === 'error') {
          setRrMsg({ ok: false, text: RERUN_ERROR[r.code] ?? `실패: ${r.code}` });
          return;
        }
        setRrMsg({
          ok: true,
          text:
            `${r.resolved}개 구역 재정산` +
            (r.already > 0 ? ` (기존 ${r.already}개는 유지)` : '') +
            (r.resolved === 0 && r.already === 0 ? ' — 그날 공격 배치가 없었다' : ''),
        });
      } catch (e) {
        setRrMsg({ ok: false, text: `실패: ${(e as Error).message}` });
      }
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

      {/* 점령전 재정산 — 23시 정산 cron이 실패한 날 복구 */}
      <div className="space-y-3 rounded-xl border border-zinc-800 p-3">
        <div>
          <h2 className="text-sm font-bold text-zinc-200">점령전 재정산</h2>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            23시 정산이 실패해 전투 기록이 없는 날을 다시 산출한다. 이미 산출된 구역은 덮어쓰지 않고
            그대로 둔다. 공개(소유권 이전·결과 우편)는 자정 크론이 처리하므로 여기서는 산출만 한다.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="w-28">
            <div className="mb-1 text-xs text-zinc-500">서버</div>
            <select
              value={String(rrServer)}
              onChange={(e) => setRrServer(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base"
            >
              {serverIds.map((sid) => (
                <option key={sid} value={String(sid)}>
                  {sid}서버
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <div className="mb-1 text-xs text-zinc-500">전투일 (KST)</div>
            <input
              type="date"
              value={rrDay}
              min={rrMinDay}
              max={todayKst}
              onChange={(e) => setRrDay(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-base"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={rerun}
          disabled={rrPending}
          className="w-full rounded-xl border border-amber-700/60 bg-amber-900/30 py-3 text-sm font-bold text-amber-200 disabled:opacity-50"
        >
          {rrPending ? '재정산 중…' : '재정산 실행'}
        </button>
        {rrMsg && (
          <p className={`text-center text-xs ${rrMsg.ok ? 'text-zinc-400' : 'text-red-300'}`}>
            {rrMsg.text}
          </p>
        )}
      </div>
    </div>
  );
}
