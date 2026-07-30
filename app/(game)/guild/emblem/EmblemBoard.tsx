'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { BackButton } from '@/components/BackNav';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import {
  GUILD_EMBLEM_REROLL_COST_DIAMOND,
  MAX_GUILD_EMBLEMS,
} from '@/lib/game/guild/balance';
import type { EmblemSelection } from '@/lib/game/guild/emblem-vocab';

import { setActiveEmblemAction, deleteEmblemAction } from '../actions';
import { EmblemPicker, DEFAULT_EMBLEM } from '../EmblemPicker';
import { guildErrMsg } from '../errors-msg';

type EmblemItem = { id: string; emblemUrl: string | null; emblemColor: string | null; isActive: boolean };

/** 생성중 영속 TTL — 수십 초 걸리는 작업이라 재진입에도 '생성 중'을 유지한다. */
const GEN_TTL_MS = 180_000;
const GEN_KEY = 'guildEmblemGen';

/**
 * 길드 문양(E-1 확정안) — 사용 중 문양을 크게, 보관함은 3열.
 *
 * 종전(설정 화면 탭)은 5열 그리드의 칸 폭이 50px인데 그 안에 이미지와 [사용][삭제]가 들어가
 * 정작 문양이 가장 안 보였다. 또 이 화면만 **3초 인-버튼 컨펌**을 써서 앱 표준(ModalShell)과
 * 어긋났다. 둘을 고치고, 생성은 그대로 **빈 칸 클릭 → 팝업**을 유지한다.
 *
 * 생성 흐름(라우트 핸들러 fetch · 낙관적 차감 · localStorage 영속 · 경과 시간)은 검증된
 * 로직이라 그대로 옮겼다 — 레이아웃과 확인 방식만 바뀐다.
 */
export function EmblemBoard({
  guildName,
  emblems,
}: {
  guildName: string;
  emblems: EmblemItem[];
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [pending, start] = useTransition();

  const [list, setList] = useState(emblems);
  const [synced, setSynced] = useState(emblems);
  if (synced !== emblems) {
    setSynced(emblems);
    setList(emblems);
  }

  const [emblem, setEmblem] = useState<EmblemSelection>(DEFAULT_EMBLEM);
  const [genOpen, setGenOpen] = useState(false);
  const [genPending, setGenPending] = useState(false); // 낙관적 '생성 중' 슬롯
  const [genStartMs, setGenStartMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null); // 라이브 클럭(마운트 후 — 하이드레이션 안전)
  /** 재화가 걸린 안내(지연·환불) — 사라지는 토스트가 아니라 남는 팝업으로. */
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  /** 보관 문양 액션 시트 — 사용/삭제. 3초 인-버튼 컨펌을 대체. */
  const [sheet, setSheet] = useState<EmblemItem | null>(null);
  const [confirm, setConfirm] = useState<{
    kind: 'use' | 'del';
    item: EmblemItem;
  } | null>(null);

  const isFirst = list.length === 0;
  const priceText = isFirst
    ? '무료'
    : `💎${GUILD_EMBLEM_REROLL_COST_DIAMOND.toLocaleString('ko-KR')}`;
  const active = list.find((e) => e.isActive) ?? null;

  // 생성 중이면 1초마다 라이브 클럭 갱신(경과 시간 표시).
  useEffect(() => {
    if (!genPending) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [genPending]);

  const elapsedSec =
    genStartMs != null && nowMs != null ? Math.max(0, Math.floor((nowMs - genStartMs) / 1000)) : null;
  const elapsedText =
    elapsedSec == null
      ? null
      : elapsedSec < 60
        ? `${elapsedSec}초`
        : `${Math.floor(elapsedSec / 60)}분 ${elapsedSec % 60}초`;

  // 생성중 상태 영속 — 생성은 수십초 걸려 재진입 시 로컬 genPending이 사라진다.
  // 새 문양 도착(개수 증가) 또는 TTL 경과 시 자동 정리.
  useEffect(() => {
    const sync = () => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(GEN_KEY);
      } catch {
        return;
      }
      if (!raw) return;
      let alive = false;
      let startAt: number | null = null;
      try {
        const { at, base } = JSON.parse(raw) as { at: number; base: number };
        alive = Date.now() - at < GEN_TTL_MS && emblems.length <= base;
        startAt = at;
      } catch {
        alive = false;
      }
      if (alive) {
        setGenPending(true);
        if (startAt != null) setGenStartMs(startAt);
      } else {
        try {
          localStorage.removeItem(GEN_KEY);
        } catch {
          /* noop */
        }
        setGenPending(false);
      }
    };
    sync();
  }, [emblems]);

  /** 생성 — 라우트 핸들러 fetch(서버 액션 트랜지션 밖)라 생성 중에도 앱이 안 멈춘다. */
  const generate = async () => {
    setGenOpen(false);
    const at = Date.now();
    setGenStartMs(at);
    try {
      localStorage.setItem(GEN_KEY, JSON.stringify({ at, base: list.length }));
    } catch {
      /* noop */
    }
    setGenPending(true);
    const wasFree = list.length === 0; // 첫 문양은 무료(결성 무료문양 실패 복구)
    if (!wasFree) optimisticAdjust(BigInt(-GUILD_EMBLEM_REROLL_COST_DIAMOND));

    // 수십 초 걸릴 수 있어 응답 실패를 단정하지 않는다 — 명시적 에러만 토스트, 그 외는
    // 안내 후 refresh로 실제 상태를 반영(서버가 성공했으면 새 문양·차감이 보인다).
    let r: { status?: string; code?: string } | null = null;
    try {
      const res = await fetch('/api/guild/emblem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selection: emblem }),
      });
      r = (await res.json()) as { status?: string; code?: string };
    } catch {
      r = null;
    }
    if (r?.status === 'success') {
      showHeaderToast({ title: '문양 생성 완료' });
    } else {
      if (!wasFree) optimisticAdjust(BigInt(GUILD_EMBLEM_REROLL_COST_DIAMOND));
      if (r?.status === 'error') {
        try {
          localStorage.removeItem(GEN_KEY);
        } catch {
          /* noop */
        }
        setGenPending(false);
        showError(guildErrMsg(r.code ?? 'UNKNOWN'));
      } else {
        setNotice({
          title: '생성이 지연되고 있어요',
          body: '문양 생성이 계속 진행 중입니다. 완료되면 문양함에 추가되고, 실패하면 차감된 다이아를 우편으로 환불해 드립니다.',
        });
      }
    }
    router.refresh();
  };

  const doSelect = (id: string) => {
    const prev = list;
    setList((l) => l.map((e) => ({ ...e, isActive: e.id === id }))); // 낙관적
    start(async () => {
      const r = await setActiveEmblemAction(id);
      if (r.status !== 'success') {
        setList(prev);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '문양 변경' });
    });
  };

  const doDelete = (id: string) => {
    const prev = list;
    setList((l) => l.filter((e) => e.id !== id)); // 낙관적
    start(async () => {
      const r = await deleteEmblemAction(id);
      if (r.status !== 'success') {
        setList(prev);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '문양 삭제됨' });
    });
  };

  return (
    <div className="px-4 py-5">
      <div className="mb-3 flex items-center gap-2 px-0.5">
        <BackButton fallback="/guild/settings" />
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wide text-zinc-400">{guildName}</p>
          <h1 className="truncate text-base font-extrabold leading-tight">문양</h1>
        </div>
      </div>

      {/* 사용 중 문양 — 이 화면의 첫 질문("지금 어느 문양이지")에 바로 답한다. */}
      <section className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-50/50 p-3 dark:border-amber-500/30 dark:bg-amber-500/[0.06]">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-amber-500 bg-zinc-100 dark:bg-zinc-900"
          style={active?.emblemColor ? { backgroundColor: `${active.emblemColor}22` } : undefined}
        >
          {active?.emblemUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={active.emblemUrl}
              alt=""
              aria-hidden
              className="h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <span className="text-2xl">🛡️</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-wide text-amber-600 dark:text-amber-400">
            사용 중
          </p>
          <h1 className="truncate text-base font-extrabold leading-tight">{guildName}</h1>
        </div>
      </section>

      <div className="mt-3 flex items-baseline justify-between px-0.5">
        <h2 className="text-sm font-bold">보관함</h2>
        <span className="text-[11px] tabular-nums text-zinc-500">
          {list.length} / {MAX_GUILD_EMBLEMS}
        </span>
      </div>

      {/* 3열 — 종전 5열은 칸 폭이 50px이라 문양이 안 보였다. */}
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        {Array.from({ length: MAX_GUILD_EMBLEMS }).map((_, i) => {
          const filled = i < list.length ? list[i]! : null;
          const isGenSlot = !filled && i === list.length && genPending;
          if (filled) {
            return (
              <button
                key={filled.id}
                type="button"
                onClick={() => setSheet(filled)}
                disabled={pending}
                aria-label={`${i + 1}번 문양`}
                className={`relative aspect-square overflow-hidden rounded-xl border-2 bg-zinc-50 transition active:scale-95 disabled:opacity-50 dark:bg-zinc-900 ${
                  filled.isActive
                    ? 'border-amber-500 ring-2 ring-amber-500/30'
                    : 'border-zinc-200 dark:border-zinc-700'
                }`}
              >
                {filled.emblemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={filled.emblemUrl}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : null}
                {filled.isActive ? (
                  <span className="absolute inset-x-0 bottom-0 bg-amber-500 py-0.5 text-center text-[9px] font-bold text-white">
                    사용 중
                  </span>
                ) : null}
              </button>
            );
          }
          if (isGenSlot) {
            return (
              <div
                key="gen"
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-amber-400 text-amber-600 dark:border-amber-500/60 dark:text-amber-400"
              >
                <span className="text-[10px] font-bold">생성 중</span>
                {elapsedText ? <span className="text-[9px] tabular-nums">{elapsedText}</span> : null}
              </div>
            );
          }
          return (
            <button
              key={`empty-${i}`}
              type="button"
              onClick={() => setGenOpen(true)}
              disabled={pending || genPending}
              aria-label="새 문양 만들기"
              className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-400 transition active:scale-95 disabled:opacity-50 dark:border-zinc-700"
            >
              <span className="text-xl leading-none">+</span>
              <span className="text-[9px] font-bold">{i === list.length ? priceText : ''}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-2.5 px-0.5 text-[11px] leading-relaxed text-zinc-500">
        빈 칸을 눌러 새 문양을 만듭니다. 같은 키워드를 골라도 매번 새로운 문양이 생성되며 생성에
        몇 분의 시간이 소요됩니다.
      </p>

      {/* 보관 문양 시트 — 사용/삭제. 마지막 1개는 삭제할 수 없다(현재 규칙 유지). */}
      {sheet ? (
        <ModalShell onClose={() => setSheet(null)} label="문양 관리">
          <ModalLayout
            icon={
              sheet.emblemUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sheet.emblemUrl}
                  alt=""
                  aria-hidden
                  className="mx-auto h-14 w-14 rounded-2xl object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                '🛡️'
              )
            }
            title={sheet.isActive ? '사용 중인 문양' : '보관 중인 문양'}
            bodyPad="sm"
            footer={
              <ModalButton tone="ghost" onClick={() => setSheet(null)}>
                닫기
              </ModalButton>
            }
          >
            <div className="space-y-0.5">
              {!sheet.isActive ? (
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold text-amber-600 active:bg-zinc-100 dark:text-amber-400 dark:active:bg-zinc-800"
                  onClick={() => {
                    const it = sheet;
                    setSheet(null);
                    setConfirm({ kind: 'use', item: it });
                  }}
                >
                  이 문양 사용하기
                </button>
              ) : (
                <p className="px-3 py-2.5 text-[12px] text-zinc-500">
                  길드 화면·세계지도에 지금 쓰이는 문양입니다.
                </p>
              )}
              {list.length > 1 ? (
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold text-red-600 active:bg-zinc-100 dark:text-red-400 dark:active:bg-zinc-800"
                  onClick={() => {
                    const it = sheet;
                    setSheet(null);
                    setConfirm({ kind: 'del', item: it });
                  }}
                >
                  삭제
                </button>
              ) : null}
            </div>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 사용·삭제 확인 — 인-버튼 3초 컨펌을 앱 표준 확인 팝업으로 대체. */}
      {confirm ? (
        <ModalShell
          onClose={() => setConfirm(null)}
          onSubmit={() => {
            const c = confirm;
            setConfirm(null);
            if (c.kind === 'use') doSelect(c.item.id);
            else doDelete(c.item.id);
          }}
          label={confirm.kind === 'use' ? '문양 사용 확인' : '문양 삭제 확인'}
        >
          <ModalLayout
            title={confirm.kind === 'use' ? '이 문양을 사용할까요?' : '이 문양을 삭제할까요?'}
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setConfirm(null)} disabled={pending}>
                  취소
                </ModalButton>
                <ModalButton
                  tone={confirm.kind === 'use' ? 'primary' : 'danger'}
                  onClick={() => {
                    const c = confirm;
                    setConfirm(null);
                    if (c.kind === 'use') doSelect(c.item.id);
                    else doDelete(c.item.id);
                  }}
                  disabled={pending}
                >
                  {confirm.kind === 'use' ? '사용' : '삭제'}
                </ModalButton>
              </>
            }
          >
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {confirm.kind === 'use'
                ? '길드 화면·세계지도·연대기에 즉시 반영됩니다.'
                : '삭제한 문양은 되돌릴 수 없습니다. 다시 만들려면 다이아가 필요합니다.'}
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 생성 팝업 — 빈 칸 클릭으로 진입(사용자 결정 2026-07-30). */}
      {genOpen ? (
        <ModalShell
          onClose={() => setGenOpen(false)}
          onSubmit={() => !pending && generate()}
          label="새 문양 생성"
        >
          <ModalLayout
            title="새 문양 만들기"
            subtitle={
              <>
                보관 {list.length} / {MAX_GUILD_EMBLEMS}
                <span className="mx-1 text-zinc-400">·</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {isFirst ? '첫 생성 무료' : priceText}
                </span>
              </>
            }
            maxBodyClass="max-h-[58vh]"
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setGenOpen(false)}>
                  닫기
                </ModalButton>
                <ModalButton tone="primary" grow={2} onClick={generate} disabled={pending}>
                  {`만들기 ${priceText}`}
                </ModalButton>
              </>
            }
          >
            <p className="mb-2 text-[11.5px] leading-relaxed text-zinc-500">
              고른 키워드만 참고해 매번 새로 그립니다 — 같은 키워드도 결과가 다릅니다. 수십 초
              걸리고, 실패하면 자동 환불됩니다.
            </p>
            <EmblemPicker value={emblem} onChange={setEmblem} disabled={pending} />
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 재화가 걸린 안내(지연·환불) — 다시 읽을 수 있어야 해서 사라지지 않는 팝업. */}
      {notice ? (
        <ModalShell onClose={() => setNotice(null)} onSubmit={() => setNotice(null)} label={notice.title}>
          <ModalLayout
            icon="⏳"
            title={notice.title}
            footer={
              <ModalButton tone="primary" onClick={() => setNotice(null)}>
                확인
              </ModalButton>
            }
          >
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {notice.body}
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}
    </div>
  );
}
