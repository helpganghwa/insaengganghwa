'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { applyEraProposalAction, dismissEraProposalAction, lockEraAction, regenerateEraAction, saveEraAction, syncErasAction } from './actions';

const SOURCE_KO: Record<string, string> = { ai: '이야기꾼(적용함)', code: '집계 문장', manual: '운영자 수정', none: '미저장(화면은 집계 문장)' };

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '-';
}

export function SyncAllButton({ serverId }: { serverId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2 text-[11px]">
      {msg ? <span className="text-zinc-400">{msg}</span> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncErasAction(serverId);
            setMsg(r.status === 'success' ? (r.note ?? '완료') : `실패: ${r.code}`);
            router.refresh();
          })
        }
        className="rounded-md border border-zinc-700 px-2.5 py-1 font-semibold hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? '제안 받는 중…' : '바뀐 시대 제안 받기'}
      </button>
    </div>
  );
}

export function EraEditor(props: {
  serverId: number;
  index: number;
  leader: string;
  from: string;
  to: string;
  days: number;
  ongoing: boolean;
  summary: string;
  closing: string;
  source: string;
  locked: boolean;
  updatedAt: string | null;
  fallback: { summary: string; closing: string };
  /** 적용을 기다리는 이야기꾼 제안(0203). 없으면 null. */
  proposal: { summary: string; closing: string; at: string | null } | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [summary, setSummary] = useState(props.summary);
  const [closing, setClosing] = useState(props.closing);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = summary !== props.summary || closing !== props.closing;
  const run = (fn: () => Promise<{ status: 'success'; note?: string } | { status: 'error'; code: string }>, okMsg: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.status === 'success' ? okMsg : `실패: ${r.code}`);
      router.refresh();
    });
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[13px] font-bold">
          제{props.index}장 「{props.leader}」의 시대{' '}
          <span className="text-[11px] font-normal text-zinc-400">
            {props.from} ~ {props.ongoing ? '진행 중' : props.to} · {props.days}일
          </span>
        </div>
        <div className="text-[11px] text-zinc-400">
          {SOURCE_KO[props.source] ?? props.source} · {props.locked ? '🔒 제안 받지 않음' : '제안 받음'} · {fmt(props.updatedAt)}
        </div>
      </div>
      {props.proposal ? (
        <div className="mt-2 rounded-md border border-amber-700/60 bg-amber-950/30 p-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[11px]">
            <span className="font-bold text-amber-400">이야기꾼 제안 · 적용 전</span>
            <span className="text-zinc-400">{fmt(props.proposal.at)}</span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-zinc-200">{props.proposal.summary}</p>
          {props.proposal.closing ? <p className="mt-1.5 text-[12.5px] text-zinc-300">맺음: {props.proposal.closing}</p> : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => applyEraProposalAction(props.serverId, props.from), '제안을 적용했습니다')}
              className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white disabled:opacity-40"
            >
              제안 적용
            </button>
            <button
              type="button"
              disabled={pending}
              title="제안을 아래 편집기로 가져옵니다. 고친 뒤 [저장]을 눌러야 반영됩니다."
              onClick={() => {
                setSummary(props.proposal!.summary);
                setClosing(props.proposal!.closing);
                setMsg('편집기로 가져왔습니다. 고친 뒤 저장하세요.');
              }}
              className="rounded-md border border-zinc-700 px-2.5 py-1 font-semibold hover:bg-zinc-800 disabled:opacity-40"
            >
              고쳐서 쓰기
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => dismissEraProposalAction(props.serverId, props.from), '제안을 버렸습니다')}
              className="rounded-md border border-zinc-700 px-2.5 py-1 font-semibold hover:bg-zinc-800 disabled:opacity-40"
            >
              제안 버리기
            </button>
          </div>
        </div>
      ) : null}
      <label className="mt-2 block text-[11px] text-zinc-400">지금 역사 페이지에 나가는 요약(마커 {'{g|길드}'} 유지)</label>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={5}
        className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 text-[12.5px] leading-relaxed"
      />
      <label className="mt-2 block text-[11px] text-zinc-400">맺음(시대가 끝났을 때만)</label>
      <input
        value={closing}
        onChange={(e) => setClosing(e.target.value)}
        className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 p-2 text-[12.5px]"
      />
      <details className="mt-2 text-[11px] text-zinc-500">
        <summary className="cursor-pointer">집계 문장(사실 대조용)</summary>
        <p className="mt-1 whitespace-pre-wrap">{props.fallback.summary}</p>
        {props.fallback.closing ? <p className="mt-1">{props.fallback.closing}</p> : null}
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() => run(() => saveEraAction(props.serverId, props.from, summary, closing), '저장했습니다')}
          className="rounded-md bg-amber-600 px-2.5 py-1 font-semibold text-white disabled:opacity-40"
        >
          저장
        </button>
        <button
          type="button"
          disabled={pending || props.locked}
          title={props.locked ? '잠금을 풀어야 제안을 받을 수 있습니다' : '이야기꾼이 새 제안을 씁니다. 적용 전까지 역사 페이지는 그대로입니다.'}
          onClick={() => run(() => regenerateEraAction(props.serverId, props.from), '새 제안이 왔습니다')}
          className="rounded-md border border-zinc-700 px-2.5 py-1 font-semibold hover:bg-zinc-800 disabled:opacity-40"
        >
          새 제안 받기
        </button>
        {props.source !== 'none' ? (
          <button
            type="button"
            disabled={pending}
            title="잠그면 이 시대에는 이야기꾼 제안이 오지 않습니다."
            onClick={() => run(() => lockEraAction(props.serverId, props.from, !props.locked), props.locked ? '잠금 해제' : '잠금')}
            className="rounded-md border border-zinc-700 px-2.5 py-1 font-semibold hover:bg-zinc-800 disabled:opacity-40"
          >
            {props.locked ? '잠금 해제' : '잠그기'}
          </button>
        ) : null}
        {msg ? <span className="text-zinc-400">{msg}</span> : null}
      </div>
    </div>
  );
}
