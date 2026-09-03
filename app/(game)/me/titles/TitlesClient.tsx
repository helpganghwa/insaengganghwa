'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { TitleTag } from '@/components/TitleTag';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { TITLE_BY_CODE, TITLE_DEFS, type TitleDef } from '@/lib/game/titles/defs';
import { setRepresentativeTitleAction, toggleFavoriteTitleAction } from '@/lib/game/titles/actions';
import { useResourceToast } from '@/components/ResourceToast';

/** 서버가 내려주는 행 — 조건(cond)·발견일은 발견한 칭호에만 존재(비노출 원칙). */
export type TitleRow = {
  code: string;
  cond: string | null;
  discovered: boolean;
  earnedAt: string | null;
  activeNow: boolean;
  /** 아직 확인하지 않은 새 칭호(0187) — 상단 '새로 얻은 칭호' 섹션 + NEW 태그. */
  isNew: boolean;
};

type Tri = null | 'a' | 'b';

/** 토글 세그먼트 — 모두 해제 = 전체(목업 확정 UX). */
function Seg({ a, b, val, onChange }: { a: string; b: string; val: Tri; onChange: (v: Tri) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-zinc-700">
      {(['a', 'b'] as const).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(val === k ? null : k)}
          className={`px-2.5 py-0.5 text-[11px] ${k === 'b' ? 'border-l border-zinc-700' : ''} ${
            val === k ? 'bg-amber-400 font-bold text-zinc-900' : 'text-zinc-400'
          }`}
        >
          {k === 'a' ? a : b}
        </button>
      ))}
    </div>
  );
}

/** 행 상태 — 대표/활성/비활성/잠금(미발견). 정렬·배지의 근거. */
type RowState = 'rep' | 'active' | 'inactive' | 'locked';
const STATE_ORDER: Record<RowState, number> = { rep: 0, active: 1, inactive: 2, locked: 3 };

/** 대분류 8묶음(2026-08-21 사용자 확정, 분류 기준 2) — 내부 cat을 활동 축으로 묶어 표시. */
const GROUP_ORDER = ['성장', '전투', '사회', '생활', '재화', '기록', '아바타', '장비'];
const CAT_GROUP: Record<string, string> = {
  강화: '성장', 초월: '성장', 보급: '성장', 도감: '성장', 해방: '성장',
  레이드: '전투', 대난투: '전투', 점령전: '전투',
  길드: '사회', 소셜: '사회',
  일상: '생활', 시간대: '생활',
  재화: '재화', 후원: '재화',
  '랭킹 1위': '기록', 조건부: '기록',
  아바타: '아바타',
  조합: '장비', '아이템 발동': '장비',
};
/** 매핑에 없는 신규 cat은 자기 이름 그대로 뒤에 붙는다 — 조용한 증발 방지. */
const groupOf = (cat: string): string => CAT_GROUP[cat] ?? cat;

/** 즐겨찾기 상한 — 서버(actions.ts FAVORITE_CAP)와 동일. */
const FAVORITE_CAP = 10;

export function TitlesClient({
  rows,
  representative,
  favorites,
  executorZone,
  executorZoneRegion,
}: {
  rows: TitleRow[];
  representative: string | null;
  favorites: string[];
  executorZone: string | null;
  executorZoneRegion: string | null;
}) {
  const [rep, setRep] = useState(representative);
  const [favs, setFavs] = useState<string[]>(favorites);
  const [kind, setKind] = useState<Tri>(null); // a=조건 b=영구
  const [found, setFound] = useState<Tri>(null); // a=발견 b=미발견
  const [act, setAct] = useState<Tri>(null); // a=활성 b=비활성
  const [favOnly, setFavOnly] = useState(false);
  const [sel, setSel] = useState<string | null>(null); // 팝업 대상 code
  // 새 칭호(0187) — 서버는 이 화면을 렌더한 뒤 전부 확인 처리하므로, 여기서는 이번 방문 동안의 표시만 관리.
  // 행을 탭하면 그 칭호의 NEW를 지운다(개별 확인 느낌). 새로고침하면 서버 기준으로 전부 사라진다.
  const [newSet, setNewSet] = useState<Set<string>>(() => new Set(rows.filter((r) => r.isNew).map((r) => r.code)));
  const [pending, startTransition] = useTransition();
  // ☆ 토글 전용 — 대표 장착의 pending(팝업 버튼 비활성)과 분리(적대 검수 7).
  const [, startFavTransition] = useTransition();

  // 카테고리 헤더 sticky 오프셋 — 상단 고정부(대표+필터) 높이를 실측해 그 바로 아래 붙인다.
  // 필터 칩이 줄바꿈되면 높이가 변하므로 하드코딩 불가(ResizeObserver로 추적).
  // offsetHeight(정수 반올림)는 실높이가 소수면 헤더가 어긋나 미세 틈이 생긴다 — rect 실값 사용.
  const headRef = useRef<HTMLDivElement>(null);
  const [headH, setHeadH] = useState(0);
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const sync = () => setHeadH(el.getBoundingClientRect().height);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { showError, showHeaderToast } = useResourceToast();

  const discoveredCount = useMemo(() => rows.filter((r) => r.discovered).length, [rows]);
  const byCode = useMemo(() => new Map(rows.map((r) => [r.code, r])), [rows]);
  const favSet = useMemo(() => new Set(favs), [favs]);

  const stateOf = (code: string): RowState => {
    const r = byCode.get(code);
    if (!r?.discovered) return 'locked';
    // 대표라도 조건을 잃었으면 '비활성'이 진실 — 헤더·채팅에선 이미 숨는데 여기만 금테면
    // "달려 있는데 왜 안 보이나"가 된다(감사 1-c).
    if (code === rep) return r.activeNow ? 'rep' : 'inactive';
    return r.activeNow ? 'active' : 'inactive';
  };

  const passesFilters = (d: TitleDef): boolean => {
    const r = byCode.get(d.code);
    if (!r) return false;
    const isCond = d.kind === 'conditional';
    if (kind && (kind === 'a') !== isCond) return false;
    if (found && (found === 'a') !== r.discovered) return false;
    // 활성/비활성은 **발견분의 상태** — 미발견(잠김)을 '비활성'에 섞지 않는다(감사 1-a).
    if (act && (!r.discovered || (act === 'a') !== r.activeNow)) return false;
    // ★ 즐겨찾기 필터 — 기존 필터와 AND 조합(트랙 D).
    if (favOnly && !favSet.has(d.code)) return false;
    return true;
  };

  // 그룹 구성(트랙 D 확정안) — 최상단 ★ 섹션(즐겨찾기 상위 노출·카테고리에서 제외) 후
  // 카테고리 섹션. 섹션 내 정렬은 상태(대표→활성→비활성→잠금) 순.
  const groups = useMemo(() => {
    const sortRows = (arr: TitleDef[]) =>
      arr.sort((a, b) => STATE_ORDER[stateOf(a.code)] - STATE_ORDER[stateOf(b.code)] || a.label.localeCompare(b.label, 'ko'));
    const visible = TITLE_DEFS.filter(passesFilters);
    // ★ 섹션은 **중복 표시**(2026-08-21 피드백) — 즐겨찾기해도 원 카테고리 섹션에 그대로 남고
    // ★ 섹션에 한 번 더 노출된다(호이스트 아님). 발견분만 — 즐겨찾기 후 미발견이 된 코드(운영
    // 회수 등)가 잠금 행으로 최상단에 박히는 것 방지(적대 검수 2).
    const favList = sortRows(visible.filter((d) => favSet.has(d.code) && byCode.get(d.code)?.discovered));
    // 새로 얻은 칭호(0187) — ★처럼 최상단 중복 표시(원 분류에도 남음). 필터는 그대로 적용.
    const newList = sortRows(visible.filter((d) => newSet.has(d.code) && byCode.get(d.code)?.discovered));
    const byGroup = new Map<string, TitleDef[]>();
    for (const d of visible) {
      const g = groupOf(d.cat);
      const arr = byGroup.get(g) ?? [];
      arr.push(d);
      byGroup.set(g, arr);
    }
    const order = [...GROUP_ORDER, ...[...byGroup.keys()].filter((g) => !GROUP_ORDER.includes(g))];
    const cats = order.filter((g) => byGroup.has(g)).map((g) => {
      // 진행도는 필터와 무관한 실측(그 대분류 전체 기준) — 필터로 줄어든 숫자는 진행도가 아니다.
      const all = TITLE_DEFS.filter((d) => groupOf(d.cat) === g && byCode.has(d.code));
      const disc = all.filter((d) => byCode.get(d.code)!.discovered).length;
      return { key: g, label: g, progress: `${disc}/${all.length}`, items: sortRows(byGroup.get(g)!) };
    });
    return { favList, newList, cats };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byCode, kind, found, act, favOnly, favSet, rep, newSet]);

  const toggle = (code: string) => {
    const next = rep === code ? null : code;
    const prevRep = rep;
    const label = TITLE_BY_CODE.get(code)?.label ?? '';
    setRep(next); // 낙관 반영 — 실패 시 복구
    setSel(null); // 팝업 즉시 닫고 결과는 공용 토스트로(사용자 확정)
    window.dispatchEvent(new CustomEvent('ig:reptitle', { detail: next })); // 채팅 등 낙관 동기화
    startTransition(async () => {
      const res = await setRepresentativeTitleAction(next);
      if (!res.ok) {
        setRep(prevRep);
        window.dispatchEvent(new CustomEvent('ig:reptitle', { detail: prevRep }));
        showError(next ? '칭호 장착에 실패했어' : '칭호 해제에 실패했어');
        return;
      }
      // 성공 토스트는 응답 확인 후 — 선발사하면 실패 시 "장착"·"실패"가 연달아 떠 모순(감사 1-g).
      showHeaderToast({ title: next ? '칭호 장착' : '칭호 해제', detail: label });
    });
  };

  const toggleFav = (code: string) => {
    const has = favSet.has(code);
    if (!has && favs.length >= FAVORITE_CAP) {
      showError(`즐겨찾기는 ${FAVORITE_CAP}개까지 담을 수 있어`);
      return;
    }
    // 낙관은 **함수형**으로 해당 코드만 넣고/빼고, 실패 롤백도 해당 코드만 되돌린다 —
    // 스냅샷 복원은 병행 토글(B)을 함께 지워 서버와 어긋난다(적대 검수 3).
    setFavs((cur) => (has ? cur.filter((c) => c !== code) : cur.includes(code) ? cur : [...cur, code]));
    startFavTransition(async () => {
      // throw(네트워크 단절 등)도 실패와 동일 롤백 — !ok 분기만 있으면 낙관 상태가 남는다(통합 검수 7).
      const res = await toggleFavoriteTitleAction(code).catch(() => ({ ok: false as const, error: 'NETWORK' }));
      if (!res.ok) {
        setFavs((cur) => (has ? (cur.includes(code) ? cur : [...cur, code]) : cur.filter((c) => c !== code)));
        showError(res.error === 'FAVORITES_FULL' ? `즐겨찾기는 ${FAVORITE_CAP}개까지 담을 수 있어` : '즐겨찾기 변경에 실패했어');
      }
    });
  };

  const selRow = sel ? byCode.get(sel) : null;
  const selDef = sel ? TITLE_BY_CODE.get(sel) : null;

  const renderRow = (d: TitleDef) => {
    const r = byCode.get(d.code)!;
    const st = stateOf(d.code);
    return (
      <div
        key={d.code}
        className={`flex items-center gap-2 border-b border-zinc-900 py-1.5 pl-3.5 pr-2 [content-visibility:auto] [contain-intrinsic-block-size:35px] ${
          st === 'rep' ? 'bg-amber-400/[0.04]' : ''
        }`}
      >
        <button
          type="button"
          onClick={() => {
            setSel(d.code);
            if (newSet.has(d.code)) setNewSet((p) => { const n = new Set(p); n.delete(d.code); return n; });
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
            {r.discovered ? (
              <TitleTag code={d.code} executorZone={executorZone} executorZoneRegion={executorZoneRegion} className="text-[13px]" />
            ) : (
              <span className="whitespace-nowrap text-[12.5px] font-semibold text-zinc-600">{d.label.replace('{구역}', '').trim()}</span>
            )}
          </span>
          {st === 'rep' && (
            <span className="shrink-0 rounded border border-amber-400/50 px-1 text-[9px] font-extrabold text-amber-400">대표</span>
          )}
          {newSet.has(d.code) && (
            <span className="shrink-0 rounded bg-red-600 px-1 text-[9px] font-extrabold tracking-wide text-white">NEW</span>
          )}
          {st === 'inactive' && <span className="shrink-0 text-[9px] font-bold text-orange-400">비활성</span>}
        </button>
        {/* ☆ 토글 — 발견분 + (미발견이어도) 이미 즐겨찾기된 행. 후자는 해제 수단 보존용
            (즐겨찾기 후 회수된 칭호가 해제 불가로 잠기는 것 방지 — 적대 검수 2). */}
        {r.discovered || favSet.has(d.code) ? (
          <button
            type="button"
            aria-label={favSet.has(d.code) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
            aria-pressed={favSet.has(d.code)}
            onClick={() => toggleFav(d.code)}
            className={`shrink-0 px-1.5 py-1 text-[14px] leading-none ${favSet.has(d.code) ? 'text-amber-400' : 'text-zinc-700'}`}
          >
            {favSet.has(d.code) ? '★' : '☆'}
          </button>
        ) : (
          <span className="w-[25px] shrink-0" />
        )}
      </div>
    );
  };

  // 분류 구분도 필터 하단에 sticky(2026-08-21 피드백 2) — 스크롤 중 현재 카테고리가 항상 보인다.
  // 반투명이면 지나가는 행이 비쳐 보이므로 불투명 배경 필수.
  const catHead = (label: string, right: string, star = false) => (
    <div
      className="sticky z-10 flex items-center justify-between border-y border-zinc-800 bg-zinc-900 px-3.5 py-1"
      style={{ top: headH }}
    >
      <span className="text-[10.5px] font-bold text-zinc-300">
        {star && <span className="mr-1 text-amber-400">★</span>}
        {label}
      </span>
      <span className="text-[10px] text-zinc-600">{right}</span>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[390px]">
      {/* 상단 — 대표+카운트(게이지 제거, 트랙 D)+필터 고정(스크롤은 목록만). main이 스크롤 컨테이너라 top-0. */}
      <div ref={headRef} className="sticky top-0 z-20 bg-zinc-950">
        <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-sm font-extrabold text-white">대표 칭호</span>
              {rep ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <TitleTag code={rep} executorZone={executorZone} executorZoneRegion={executorZoneRegion} className="text-sm" />
                  {byCode.get(rep)?.activeNow === false && (
                    <span className="shrink-0 rounded bg-orange-950/60 px-1 text-[10px] font-bold text-orange-300">비활성</span>
                  )}
                </span>
              ) : (
                <span className="text-xs text-zinc-500">없음</span>
              )}
            </div>
            <span className="shrink-0 text-[11px] text-zinc-400">
              발견 {discoveredCount}/{rows.length}
            </span>
          </div>
        </div>

        {/* 필터 — 토글 세그먼트 3조(해제=전체) + ★ 즐겨찾기(AND 조합).
            하단 보더 없음 — 바로 아래 섹션 헤더의 상단 보더와 만나 2px로 보이던 것 제거(피드백). */}
        <div className="flex flex-wrap gap-1.5 px-4 py-2">
          <Seg a="조건" b="영구" val={kind} onChange={setKind} />
          <Seg a="발견" b="미발견" val={found} onChange={setFound} />
          <Seg a="활성" b="비활성" val={act} onChange={setAct} />
          <button
            type="button"
            aria-pressed={favOnly}
            onClick={() => setFavOnly((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-[11px] ${
              favOnly ? 'border-amber-400 bg-amber-400 font-bold text-zinc-900' : 'border-zinc-700 text-zinc-400'
            }`}
          >
            ★ 즐겨찾기
          </button>
        </div>
      </div>

      {/* 목록 — 대분류 섹션 + 1열 밀도 행(트랙 D 확정안). ★ 섹션이 최상단(중복 표시 — 원 섹션에도 남음). */}
      <div className="pb-8">
        {/* 섹션별 래퍼 div 필수 — sticky 헤더가 자기 섹션 범위에서만 붙고 다음 헤더에 밀려나는
            표준 push-out 동작은 헤더가 각자의 부모 안에 있을 때만 성립한다. */}
        {/* 새로 얻은 칭호(0187) — 이번 방문에만 보이는 모아보기. 탭하거나 다음 진입 시 사라진다. */}
        {groups.newList.length > 0 && (
          <div>
            {catHead('새로 얻은 칭호', String(groups.newList.length))}
            {groups.newList.map(renderRow)}
          </div>
        )}
        {groups.favList.length > 0 && (
          <div>
            {catHead('즐겨찾기', String(groups.favList.length), true)}
            {groups.favList.map(renderRow)}
          </div>
        )}
        {groups.cats.map((g) => (
          <div key={g.key}>
            {catHead(g.label, g.progress)}
            {g.items.map(renderRow)}
          </div>
        ))}
        {groups.favList.length === 0 && groups.cats.length === 0 && (
          <p className="px-4 py-10 text-center text-[12px] text-zinc-500">
            {favOnly && favs.length === 0
              ? '즐겨찾기한 칭호가 없어요 — 목록에서 ☆을 눌러 담아 보세요.'
              : '조건에 맞는 칭호가 없어요.'}
          </p>
        )}
      </div>

      {/* 상세 — 공통 팝업(ModalShell+ModalLayout). 발견일은 여기서만 노출(목록엔 없음, 사용자 확정). */}
      {sel && selRow && selDef && (
        <ModalShell onClose={() => setSel(null)} label={`칭호 ${selDef.label}`}>
          <ModalLayout
            title={
              selRow.discovered ? (
                <TitleTag
                  code={sel}
                  executorZone={executorZone}
                  executorZoneRegion={executorZoneRegion}
                  className="text-[19px]"
                />
              ) : (
                <span className="text-[17px] font-semibold text-zinc-500">{selDef.label.replace('{구역}', '').trim()}</span>
              )
            }
            subtitle={
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={`rounded px-1 text-[10px] font-extrabold ${
                    selDef.kind === 'conditional'
                      ? 'bg-purple-900/40 text-purple-300'
                      : selDef.kind === 'tribute'
                        ? 'bg-amber-900/40 text-amber-300'
                        : 'bg-sky-900/40 text-sky-300'
                  }`}
                >
                  {selDef.kind === 'conditional' ? '조건' : selDef.kind === 'tribute' ? '헌정' : '영구'}
                </span>
                {selRow.discovered && selDef.kind === 'conditional' && (
                  <span
                    className={`rounded px-1 text-[10px] font-extrabold ${
                      selRow.activeNow ? 'bg-emerald-900/40 text-emerald-300' : 'bg-orange-950/60 text-orange-300'
                    }`}
                  >
                    {selRow.activeNow ? '활성' : '비활성'}
                  </span>
                )}
              </span>
            }
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setSel(null)}>
                  닫기
                </ModalButton>
                {/* 해제는 활성 여부와 무관하게 가능해야 한다 — 조건을 잃은 대표를 못 벗는 잠금 방지(감사 1-b). */}
                {(selRow.activeNow || rep === sel) && (
                  <ModalButton tone={rep === sel ? 'neutral' : 'primary'} disabled={pending} onClick={() => toggle(sel)}>
                    {rep === sel ? '해제' : '장착'}
                  </ModalButton>
                )}
              </>
            }
          >
            <div className="space-y-2 text-center">
              <div className="text-[12.5px] leading-relaxed text-zinc-300">{selRow.cond || '???'}</div>
              <div className="text-[11px] text-zinc-500">
                {selRow.earnedAt ? `${selRow.earnedAt} 발견` : '미발견'}
              </div>
            </div>
          </ModalLayout>
        </ModalShell>
      )}
    </div>
  );
}
