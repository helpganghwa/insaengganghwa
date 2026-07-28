'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';

import {
  ATTR_REGION_KO,
  attrPredator,
  attrPrey,
  GEM_TO_MS,
  RUNE_SWAP_COOLDOWN_MS,
  type AvatarAttr,
} from '@/lib/game/balance';
import { ModalShell } from '@/components/ModalShell';
import { RuneName, RuneValues, runeVectorDesc } from '@/components/RuneName';

import { equipRuneAction } from './actions';

export type RuneRow = {
  id: string;
  name: string | null;
  attrs: AvatarAttr[];
  createdAtIso: string;
};

type SortKey = 'top' | 'total' | 'new';
const SORT_LABEL: Record<SortKey, string> = { top: '최고 권역', total: '총합', new: '최신' };

function runeTotal(attrs: AvatarAttr[]): number {
  return runeVectorDesc(attrs).reduce((s, [, v]) => s + v, 0);
}
function runeTopValue(attrs: AvatarAttr[]): number {
  return runeVectorDesc(attrs)[0]?.[1] ?? 0;
}

/** 남은 시간 — 71:32:10 (총 시:분:초). */
function fmtRemain(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function RunesClient({
  runes,
  equippedId,
  changedAtIso,
  diamond,
}: {
  runes: RuneRow[];
  equippedId: string | null;
  changedAtIso: string | null;
  diamond: number;
}) {
  // 낙관적 로컬 상태 — 액션 성공 즉시 반영(응답 RSC를 기다리지 않음, §11.7).
  // props 갱신 시 재동기화는 렌더 중 조정 패턴(effect setState의 캐스케이드 회피).
  const [eqId, setEqId] = useState(equippedId);
  const [changedAt, setChangedAt] = useState(changedAtIso ? Date.parse(changedAtIso) : null);
  const [prevProps, setPrevProps] = useState({ equippedId, changedAtIso });
  if (prevProps.equippedId !== equippedId || prevProps.changedAtIso !== changedAtIso) {
    setPrevProps({ equippedId, changedAtIso });
    setEqId(equippedId);
    setChangedAt(changedAtIso ? Date.parse(changedAtIso) : null);
  }

  const [sort, setSort] = useState<SortKey>('top');
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmGem, setConfirmGem] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 쿨타임 카운트다운 — 남아있을 때만 1초 틱.
  const [now, setNow] = useState(() => Date.now());
  const cooldownEnd = eqId != null && changedAt != null ? changedAt + RUNE_SWAP_COOLDOWN_MS : null;
  const remainMs = cooldownEnd != null ? cooldownEnd - now : 0;
  useEffect(() => {
    if (cooldownEnd == null || cooldownEnd - Date.now() <= 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooldownEnd]);
  const inCooldown = remainMs > 0;
  const gemCost = inCooldown ? Math.ceil(remainMs / GEM_TO_MS) : 0;

  const equipped = useMemo(() => runes.find((r) => r.id === eqId) ?? null, [runes, eqId]);
  const sorted = useMemo(() => {
    const rest = runes.filter((r) => r.id !== eqId);
    const by: Record<SortKey, (a: RuneRow, b: RuneRow) => number> = {
      top: (a, b) => runeTopValue(b.attrs) - runeTopValue(a.attrs) || runeTotal(b.attrs) - runeTotal(a.attrs),
      total: (a, b) => runeTotal(b.attrs) - runeTotal(a.attrs) || runeTopValue(b.attrs) - runeTopValue(a.attrs),
      new: (a, b) => b.createdAtIso.localeCompare(a.createdAtIso),
    };
    return [...rest].sort(by[sort]);
  }, [runes, eqId, sort]);

  const detail = openId != null ? runes.find((r) => r.id === openId) ?? null : null;

  function closeSheet() {
    setOpenId(null);
    setConfirmGem(false);
    setError(null);
  }

  function doEquip(runeId: string, useGems: boolean) {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await equipRuneAction(runeId, useGems);
      if (res.status === 'success') {
        setEqId(runeId);
        setChangedAt(Date.now());
        closeSheet();
      } else if (res.status === 'cooldown') {
        // 서버 재검증 결과로 갱신(클라 추정치와 어긋난 경우) — 💎 확정 단계로 유도.
        setError(`교체 대기 ${fmtRemain(res.remainingMs)} 남음 · 💎 ${res.gemCost.toLocaleString()}로 즉시 교체할 수 있어요.`);
        setConfirmGem(false);
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-extrabold">룬</h1>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          아바타를 생성할 때마다 하나씩 각인됩니다. 장착한 룬 하나만 전투에 적용돼요.
        </p>
      </header>

      {/* 장착 히어로 */}
      {equipped ? (
        <button
          type="button"
          onClick={() => setOpenId(equipped.id)}
          className="block w-full rounded-2xl border border-amber-300/60 bg-gradient-to-b from-amber-50 to-white p-4 text-left shadow-sm transition active:scale-[0.99] dark:border-amber-500/30 dark:from-amber-500/10 dark:to-zinc-900"
        >
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
              장착 중
            </span>
            {inCooldown ? (
              <span className="font-mono text-[11px] tabular-nums text-zinc-400">
                교체 대기 {fmtRemain(remainMs)}
              </span>
            ) : (
              <span className="text-[11px] text-zinc-400">지금 교체 가능</span>
            )}
          </div>
          <div className="mt-2 flex min-w-0">
            <RuneName name={equipped.name} attrs={equipped.attrs} className="text-xl" />
          </div>
          <RuneValues attrs={equipped.attrs} className="mt-1.5 text-[13px]" />
          {inCooldown ? (
            <p className="mt-2 text-[11px] text-zinc-500">
              다른 룬으로 바꾸려면 대기가 끝나야 해요 · 💎 {gemCost.toLocaleString()}로 즉시 교체 가능
            </p>
          ) : null}
        </button>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-4 text-center text-[12px] text-zinc-500 dark:border-zinc-700">
          장착 중인 룬이 없어요. 아래에서 룬을 골라 장착해 보세요.
          <br />
          <span className="text-[11px] text-zinc-400">첫 장착은 대기 시간이 없습니다.</span>
        </div>
      )}

      {/* 정렬 탭 + 목록 */}
      {runes.length === 0 ? (
        <Link
          prefetch={false}
          href="/me/create"
          className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 py-10 text-center text-zinc-400 dark:border-zinc-700"
        >
          <span className="text-2xl" aria-hidden>
            🔮
          </span>
          <span className="text-xs">아직 룬이 없어요 — 아바타를 생성하면 룬이 함께 각인됩니다</span>
        </Link>
      ) : (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold text-zinc-500">
              보유 룬 <span className="tabular-nums">{runes.length}</span>
            </h2>
            <div className="flex gap-1">
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSort(k)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    sort === k
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                      : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {SORT_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <ul className="mt-2 space-y-2">
            {sorted.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(r.id)}
                  className="block w-full rounded-xl border border-zinc-200 bg-white p-3 text-left transition active:scale-[0.99] dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex min-w-0">
                    <RuneName name={r.name} attrs={r.attrs} className="text-[15px]" />
                  </div>
                  <RuneValues attrs={r.attrs} className="mt-1 text-[12px]" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 상세 시트 */}
      {detail ? (
        <ModalShell
          onClose={closeSheet}
          label={detail.name ?? '룬 상세'}
          align="bottom"
          className="w-full max-w-[358px] rounded-2xl bg-white p-4 shadow-xl dark:bg-zinc-900"
        >
          <div className="flex min-w-0">
            <RuneName name={detail.name} attrs={detail.attrs} className="text-xl" />
          </div>
          <RuneValues attrs={detail.attrs} className="mt-1.5 text-[13px]" />

          {/* 상성 — 권역별 강함/약점(사이클 인접 관계만 존재) */}
          <div className="mt-3 space-y-1.5 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
            {runeVectorDesc(detail.attrs).map(([r]) => (
              <p key={r} className="flex items-center gap-2 text-[12px]">
                <span className="w-9 shrink-0 font-bold">{ATTR_REGION_KO[r]}</span>
                <span className="text-zinc-500">
                  강함 <b className="text-emerald-600 dark:text-emerald-400">{ATTR_REGION_KO[attrPrey(r)]}</b>
                  {' · '}약점 <b className="text-rose-500 dark:text-rose-400">{ATTR_REGION_KO[attrPredator(r)]}</b>
                </span>
              </p>
            ))}
            <p className="pt-0.5 text-[10px] leading-relaxed text-zinc-400">
              상대가 내 각 권역의 &lsquo;강함&rsquo; 권역을 지니고 있으면 그만큼 내 공격이 강해집니다.
            </p>
          </div>

          <p className="mt-2 text-[10px] text-zinc-400">
            획득 {new Date(detail.createdAtIso).toLocaleDateString('ko-KR')}
          </p>

          {error ? <p className="mt-2 text-[11px] font-semibold text-rose-500">{error}</p> : null}

          {/* 장착 액션 */}
          <div className="mt-3">
            {detail.id === eqId ? (
              <div className="flex h-12 w-full items-center justify-center rounded-full bg-zinc-100 text-sm font-bold text-zinc-400 dark:bg-zinc-800">
                장착 중인 룬
              </div>
            ) : !inCooldown ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => doEquip(detail.id, false)}
                className="flex h-12 w-full items-center justify-center rounded-full bg-amber-600 text-sm font-bold text-white shadow-md transition active:scale-[0.99] disabled:opacity-60"
              >
                {pending ? '장착 중…' : eqId == null ? '장착하기' : '이 룬으로 교체'}
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex h-12 w-full items-center justify-center rounded-full bg-zinc-100 text-[13px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  교체 대기 <span className="ml-1 font-mono tabular-nums">{fmtRemain(remainMs)}</span>
                </div>
                <button
                  type="button"
                  disabled={pending || diamond < gemCost}
                  onClick={() => (confirmGem ? doEquip(detail.id, true) : setConfirmGem(true))}
                  className={`flex h-12 w-full items-center justify-center rounded-full text-sm font-bold text-white shadow-md transition active:scale-[0.99] disabled:opacity-60 ${
                    confirmGem ? 'bg-rose-600' : 'bg-sky-600'
                  }`}
                >
                  {pending
                    ? '교체 중…'
                    : diamond < gemCost
                      ? `다이아 부족 (💎 ${gemCost.toLocaleString()} 필요)`
                      : confirmGem
                        ? `한 번 더 누르면 💎 ${gemCost.toLocaleString()} 사용`
                        : `💎 ${gemCost.toLocaleString()} 즉시 교체`}
                </button>
              </div>
            )}
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
