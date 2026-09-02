'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { MeleeHeadlinePick, MeleeHeadlines } from '@/lib/db/schema/melee';

import { generateMeleeHeadlinesAction, saveMeleeHeadlinesAction } from './melee-actions';

const CAT_KO: Record<string, string> = {
  crown: '우승', upset: '이변', survive: '생존', record: '기록', drama: '드라마', guild: '길드', growth: '성장', custom: '직접',
};
const MAX_PICKS = 4;

/**
 * 대난투 헤드라인 검수(0184) — 규칙 엔진이 만든 후보 전부를 보여주고, 운영자가 최대 4줄을 고르고
 * 순서·문장을 손본 뒤 저장한다. 우편 미리보기는 실제 본문 형식과 같다(순위 줄만 유저별).
 * 생성 전이면 생성 버튼만, 발표된 배틀은 저장해도 우편엔 영향 없음(결과 화면에만 반영).
 */
export function MeleeHeadlineEditor({
  serverId,
  battleDate,
  status,
  participantCount,
  podium,
  headlines,
}: {
  serverId: number;
  battleDate: string;
  status: 'running' | 'computed' | 'revealed';
  participantCount: number;
  podium: string[];
  headlines: MeleeHeadlines | null;
}) {
  const router = useRouter();
  const [picks, setPicks] = useState<MeleeHeadlinePick[]>(headlines?.picks ?? []);
  const [flash, setFlash] = useState<string | null>(null);
  const [regenAsk, setRegenAsk] = useState(false);
  const [pending, start] = useTransition();
  const initial = JSON.stringify(headlines?.picks ?? []);
  const dirty = JSON.stringify(picks) !== initial;
  const tooLong = picks.some((p) => p.text.trim().length > 80);
  const empty = picks.some((p) => p.text.trim().length === 0);

  const generate = (force: boolean) => {
    setRegenAsk(false);
    start(async () => {
      const r = await generateMeleeHeadlinesAction({ serverId, battleDate, force });
      setFlash(r.status === 'success' ? (force ? '재생성됨' : '생성됨') : r.message);
      if (r.status === 'success') router.refresh();
    });
  };
  const save = () => {
    start(async () => {
      const r = await saveMeleeHeadlinesAction({ serverId, battleDate, picks });
      setFlash(r.status === 'success' ? '저장됨' : r.message);
      if (r.status === 'success') router.refresh();
    });
  };
  const toggle = (c: MeleeHeadlines['candidates'][number]) => {
    const idx = picks.findIndex((p) => p.code === c.code && p.text === c.text);
    if (idx >= 0) setPicks(picks.filter((_, i) => i !== idx));
    else if (picks.length < MAX_PICKS) setPicks([...picks, { code: c.code, text: c.text, subjects: c.subjects }]);
    else setFlash(`최대 ${MAX_PICKS}줄입니다`);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= picks.length) return;
    const next = [...picks];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setPicks(next);
  };
  const podiumLine = podium.length ? `🏆우승 ${podium[0]}${podium[1] ? ` · 2등 ${podium[1]}` : ''}${podium[2] ? ` · 3등 ${podium[2]}` : ''}` : '🏆우승 챔피언';
  const sampleRank = Math.max(1, Math.ceil(participantCount / 2));
  const mailBody = `오늘 대난투 ${sampleRank}위!\n${podiumLine}${picks.length ? `\n\n[오늘의 대난투]\n${picks.map((p) => `· ${p.text}`).join('\n')}` : ''}`;
  const isPicked = (c: MeleeHeadlines['candidates'][number]) => picks.some((p) => p.code === c.code && p.text === c.text);

  return (
    <div className="space-y-3">
      {!headlines ? (
        <div className="flex items-center gap-2">
          <p className="text-sm text-zinc-400">아직 헤드라인이 없습니다.</p>
          <button
            type="button"
            onClick={() => generate(false)}
            disabled={pending}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {pending ? '생성 중…' : '헤드라인 생성'}
          </button>
          {flash ? <span className="text-[12px] font-bold text-red-400">{flash}</span> : null}
        </div>
      ) : (
        <>
          {/* 선택(우편에 실릴 줄) — 순서·문장 편집 */}
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-bold text-amber-300">
                우편에 실릴 줄 <span className="font-normal text-zinc-400">{picks.length}/{MAX_PICKS}</span>
              </p>
              <button
                type="button"
                onClick={() => picks.length < MAX_PICKS && setPicks([...picks, { code: 'custom', text: '' }])}
                disabled={picks.length >= MAX_PICKS}
                className="rounded border border-zinc-700 px-2 py-1 text-[11px] font-bold text-zinc-300 disabled:opacity-40"
              >
                + 직접 쓰기
              </button>
            </div>
            {picks.length === 0 ? <p className="text-[12px] text-zinc-500">선택된 줄이 없습니다. 아래 후보에서 고르거나 직접 쓰세요.</p> : null}
            <ol className="space-y-1.5">
              {picks.map((p, i) => (
                <li key={`${i}:${p.code}`} className="flex items-center gap-1.5">
                  <span className="w-4 text-[12px] font-bold text-amber-400">{i + 1}</span>
                  <input
                    value={p.text}
                    onChange={(e) => setPicks(picks.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    maxLength={80}
                    className={`min-w-0 flex-1 rounded border bg-zinc-900 px-2 py-1.5 text-[13px] ${p.text.trim().length === 0 || p.text.trim().length > 80 ? 'border-red-500/60' : 'border-zinc-700'}`}
                    placeholder="헤드라인(80자 이내)"
                  />
                  <span className="w-12 truncate text-[10px] text-zinc-500">{CAT_KO[p.code === 'custom' ? 'custom' : (headlines.candidates.find((c) => c.code === p.code)?.category ?? '')] ?? p.code}</span>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded border border-zinc-700 px-1.5 py-1 text-[11px] disabled:opacity-30">▲</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === picks.length - 1} className="rounded border border-zinc-700 px-1.5 py-1 text-[11px] disabled:opacity-30">▼</button>
                  <button type="button" onClick={() => setPicks(picks.filter((_, j) => j !== i))} className="rounded border border-red-500/40 px-1.5 py-1 text-[11px] text-red-400">✕</button>
                </li>
              ))}
            </ol>
          </div>

          {/* 우편 미리보기 — 실제 본문 형식. 순위 줄만 유저별로 다르다. */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_260px]">
            <div className="rounded-lg border border-zinc-800 p-2">
              <p className="mb-1 text-[11px] font-bold text-zinc-400">후보 전부 {headlines.candidates.length}건 <span className="font-normal">· 체크하면 위 목록에 추가</span></p>
              <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {[...headlines.candidates].sort((a, b) => b.score - a.score).map((c, i) => {
                  const on = isPicked(c);
                  return (
                    <li key={`${c.code}:${i}`}>
                      <label className={`flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-[12px] ${on ? 'bg-amber-500/10' : 'hover:bg-zinc-900'}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(c)} className="mt-0.5 accent-amber-500" />
                        <span className="min-w-0 flex-1">
                          <span className="block">{c.text}</span>
                          <span className="text-[10px] text-zinc-500">{CAT_KO[c.category] ?? c.category} · {c.code} · {c.score.toFixed(1)}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold text-zinc-400">우편 미리보기 <span className="font-normal">(중간 순위 기준)</span></p>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                  <span className="rounded-full bg-violet-500/20 px-1.5 text-[9px] font-bold text-violet-300">대난투</span>
                  <span className="font-semibold text-zinc-300">대난투</span>
                  <span>·</span>
                  <span>29일 23시간</span>
                </div>
                <div className="mt-1 text-[13px] font-semibold">대난투 결과</div>
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-400">{mailBody}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty || tooLong || empty}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {pending ? '저장 중…' : '선택 저장'}
            </button>
            {flash ? (
              <span className={`text-[12px] font-bold ${flash.endsWith('됨') ? 'text-emerald-400' : 'text-red-400'}`}>{flash}</span>
            ) : null}
            <span className="text-[10.5px] text-zinc-500">
              생성 {new Date(headlines.generatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
              {headlines.editedAt ? ` · 수정 ${new Date(headlines.editedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}` : ' · 자동 선택'}
              {status === 'revealed' ? ' · 발표됨(우편은 이미 발송, 저장은 결과 화면에만 반영)' : ''}
            </span>
            <span className="ml-auto flex items-center gap-2">
              {regenAsk ? (
                <>
                  <span className="text-[11px] text-red-300">수정한 선택을 버리고 다시 만듭니다</span>
                  <button type="button" onClick={() => generate(true)} disabled={pending} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">재생성 실행</button>
                  <button type="button" onClick={() => setRegenAsk(false)} disabled={pending} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-300">취소</button>
                </>
              ) : (
                <button type="button" onClick={() => setRegenAsk(true)} disabled={pending} className="rounded-lg border border-red-500/50 px-3 py-2 text-sm font-bold text-red-400 disabled:opacity-40">재생성</button>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
