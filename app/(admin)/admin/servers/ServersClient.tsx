'use client';

import { useState, useTransition } from 'react';

import {
  setRecommendedServerAction,
  setServerStatusAction,
  type ServerRow,
  type ServerStatus,
} from './actions';

const LABEL: Record<ServerStatus, string> = { open: '정상', full: '포화', closed: '닫힘' };
const DESC: Record<ServerStatus, string> = {
  open: '신규 캐릭터를 만들 수 있고 크론도 정상',
  full: '신규 캐릭터 생성만 막음 — 기존 유저·크론은 그대로',
  closed: '크론 순회에서 빠짐. 점령전·대난투·정산이 멈춘다',
};

export function ServersClient({ rows }: { rows: ServerRow[] }) {
  const [flash, setFlash] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, start] = useTransition();
  const [state, setState] = useState(rows);
  // 렌더 중 state 조정 — 액션 뒤 서버가 새 목록을 내려 주면 그 값으로 맞춘다('신규가 여기로' 표시는
  // 서버에서 다시 계산해야 정확하다: 추천 서버를 포화로 돌리면 최신 서버가 그 자리를 넘겨받는다).
  const sig = rows.map((r) => `${r.id}:${r.status}:${r.recommended}:${r.effective}`).join(',');
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    setState(rows);
  }

  const apply = (id: number, next: ServerStatus) => {
    const before = state.find((r) => r.id === id)?.status;
    if (!before || before === next) return;
    if (!confirm(`${id}서버를 '${LABEL[next]}'으로 바꿀까요?\n${DESC[next]}`)) return;
    setState((rs) =>
      rs.map((r) => (r.id === id ? { ...r, status: next, recommended: next === 'open' && r.recommended } : r)),
    );
    start(async () => {
      const r = await setServerStatusAction(id, next).catch(() => null);
      if (!r || r.status !== 'success') {
        setState((rs) => rs.map((x) => (x.id === id ? { ...x, status: before } : x)));
        setFlash({ ok: false, msg: r && 'message' in r ? r.message : '전환에 실패했습니다.' });
        return;
      }
      setFlash({ ok: true, msg: `${id}서버 → ${LABEL[next]}` });
    });
  };

  const recommend = (id: number) => {
    const before = state;
    if (!confirm(`${id}서버를 추천 서버로 지정할까요?\n이제부터 새로 가입하는 사람은 이 서버에서 시작합니다(초대 링크로 온 사람은 초대한 사람의 서버).`)) return;
    setState((rs) => rs.map((r) => ({ ...r, recommended: r.id === id, effective: r.id === id })));
    start(async () => {
      const r = await setRecommendedServerAction(id).catch(() => null);
      if (!r || r.status !== 'success') {
        setState(before);
        setFlash({ ok: false, msg: r && 'message' in r ? r.message : '지정에 실패했습니다.' });
        return;
      }
      setFlash({ ok: true, msg: `${id}서버를 추천 서버로 지정했습니다` });
    });
  };

  return (
    <div className="space-y-3">
      {flash && (
        <p className={`text-sm font-semibold ${flash.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {flash.msg}
        </p>
      )}
      {state.map((r) => (
        <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-bold">
              {r.id}. {r.name}
            </span>
            {r.effective && (
              <span className="rounded bg-amber-500 px-1.5 py-px text-[10px] font-bold text-zinc-900">
                {r.recommended ? '추천 · 신규가 여기로' : '신규가 여기로(지정 없음 → 최신 서버)'}
              </span>
            )}
            <span className="text-[11px] text-zinc-500 tabular-nums">
              캐릭터 {r.characters.toLocaleString('ko-KR')} · 최근 7일{' '}
              {r.active7.toLocaleString('ko-KR')}
            </span>
          </div>
          <div className="mt-2 flex gap-1.5">
            {(['open', 'full', 'closed'] as ServerStatus[]).map((st) => (
              <button
                key={st}
                type="button"
                disabled={pending}
                onClick={() => apply(r.id, st)}
                className={`rounded-lg px-3 py-1.5 text-[12px] font-bold disabled:opacity-60 ${
                  r.status === st
                    ? 'bg-amber-500 text-zinc-900'
                    : 'border border-zinc-700 text-zinc-300'
                }`}
              >
                {LABEL[st]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-zinc-500">{DESC[r.status]}</p>
          {r.status === 'open' && !r.recommended && (
            <button
              type="button"
              disabled={pending}
              onClick={() => recommend(r.id)}
              className="mt-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] font-semibold text-zinc-300 disabled:opacity-60"
            >
              추천 서버로 지정
            </button>
          )}
        </div>
      ))}
      <p className="text-[11px] leading-relaxed text-zinc-500">
        새 서버를 여는 것은 여기서 하지 않는다 — 구역·간선 시드가 필요해{' '}
        <code>scripts/open-server.ts</code>로 연다(SERVER.md §6).
      </p>
    </div>
  );
}
