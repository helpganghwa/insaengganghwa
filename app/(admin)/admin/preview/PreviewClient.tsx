'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { updateChronicleAction, regenTrophyAction } from './actions';

/** 연대기 편집 폼 — 자정 공개 전 교정(공개 후 수정도 즉시 반영). */
export function ChronicleEditor({
  serverId,
  kstDay,
  headline: initialHeadline,
  todayText: initialText,
}: {
  serverId: number;
  kstDay: string;
  headline: string;
  todayText: string;
}) {
  const router = useRouter();
  const [headline, setHeadline] = useState(initialHeadline);
  const [text, setText] = useState(initialText);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = headline !== initialHeadline || text !== initialText;

  const save = () => {
    start(async () => {
      const r = await updateChronicleAction({ serverId, kstDay, headline, todayText: text });
      setFlash(r.status === 'success' ? '저장됨' : r.message);
      if (r.status === 'success') router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <input
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-bold"
        placeholder="헤드라인"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[13px] leading-relaxed"
        placeholder="본문 — {g|길드} {z|구역} {u|인물} 토큰은 유저 화면에서 칩으로 렌더됨"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {pending ? '저장 중…' : '수정 저장'}
        </button>
        {flash ? <span className="text-[12px] text-zinc-400">{flash}</span> : null}
      </div>
    </div>
  );
}

/** 트로피 재생성 버튼 — 3초 재탭 컨펌(기존 결과물이 지워지므로). */
export function TrophyRegenButton({ battleId }: { battleId: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const click = () => {
    if (!armed) {
      setArmed(true);
      window.setTimeout(() => setArmed(false), 3000);
      return;
    }
    setArmed(false);
    start(async () => {
      const r = await regenTrophyAction(battleId);
      setFlash(r.status === 'success' ? '재생성 시작 — 1~5분 뒤 완료' : r.message);
      if (r.status === 'success') router.refresh();
    });
  };

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={click}
        disabled={pending}
        className={`rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40 ${
          armed ? 'bg-red-600' : 'bg-zinc-700'
        }`}
      >
        {pending ? '요청 중…' : armed ? '한 번 더 눌러 확정' : '트로피 재생성'}
      </button>
      {flash ? <span className="text-[11px] text-zinc-400">{flash}</span> : null}
    </span>
  );
}
