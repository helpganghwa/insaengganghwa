'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { BackTitle } from '@/components/BackNav';
import { ModalShell } from '@/components/ModalShell';
import { assetUrl } from '@/lib/asset-versions';
import { TOWER_DAILY_ATTEMPTS, TOWER_FLOORS, TOWER_SECTION, towerIsSpecial, towerReward, towerSection } from '@/lib/game/balance';
import { avatarMultiplier, bestLoadout, floorRule, towerCp, TOWER_SLOTS, type EquippedPiece, type SlotKeys, type TowerSlot } from '@/lib/game/tower/engine';
import { towerFloorInfo } from '@/lib/game/tower/floors';
import type { TowerChallengeResult, TowerBoard } from '@/lib/game/tower/service';

import { towerChallengeAction, towerEquipAction } from './actions';
import { TowerBattle } from './TowerBattle';

const SLOT_KO: Record<TowerSlot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const n = (v: number) => v.toLocaleString('ko-KR');
const itemSrc = (slot: TowerSlot, key: string) => assetUrl(`/sprites/${slot}/${key}.png`);
const PIX = { imageRendering: 'pixelated' as const };

/** 오늘 남은 도전 — 'N/3', 다 쓰면 N(0)만 빨간색. */
function Attempts({ left }: { left: number }) {
  return (
    <span className="tabular-nums">
      오늘 도전 <b className={left <= 0 ? 'text-red-400' : 'text-amber-300'}>{left}</b>
      <span className="text-zinc-400">/{TOWER_DAILY_ATTEMPTS}</span>
    </span>
  );
}

function rewardText(floor: number) {
  const r = towerReward(floor);
  return `💎 ${n(r.diamond)}${r.boxes ? ` · 📦 ${r.boxes}` : ''}`;
}

/** 착용 가능 장비의 층 범위 — 특별층은 지정 장비만 ×2. */
function rangeText(floor: number): string {
  const sec = towerSection(floor);
  return `${(sec - 1) * TOWER_SECTION + 1}~${sec * TOWER_SECTION}층${towerIsSpecial(floor) ? ' · 지정 장비만 ×2' : ''}`;
}

/** 요구 장비 갱신까지 남은 시간 — 매주 월요일 0시(KST). week = 이번 주 월요일(YYYY-MM-DD). */
function renewText(week: string, now = Date.now()): string {
  const next = Date.parse(`${week}T00:00:00+09:00`) + 7 * 86_400_000;
  const mins = Math.max(0, Math.floor((next - now) / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  if (d > 0) return `${d}일 ${h}시간 뒤 갱신`;
  if (h > 0) return `${h}시간 ${mins % 60}분 뒤 갱신`;
  return `${Math.max(1, mins)}분 뒤 갱신`;
}

export function TowerClient({ board }: { board: TowerBoard }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // 방금 끝난 전투의 결과(최고 층·남은 도전)를 먼저 쓴다 — 돌파 뒤 'N층으로'가 서버 재렌더보다 먼저 눌려도 다음 층이 맞게
  // (2차 피드백 9: 7층 돌파 → '8층으로'가 7층 상세로 가던 문제). 새 board가 오면 그 값으로 돌아간다(렌더 중 조정).
  const [local, setLocal] = useState<{ best: number; attemptsLeft: number } | null>(null);
  const [seenBoard, setSeenBoard] = useState(board);
  if (seenBoard !== board) {
    setSeenBoard(board);
    setLocal(null);
  }
  const best = Math.max(board.best, local?.best ?? 0);
  const attemptsLeft = local ? Math.min(board.attemptsLeft, local.attemptsLeft) : board.attemptsLeft;
  const next = Math.min(TOWER_FLOORS, best + 1);
  const topped = best >= TOWER_FLOORS;
  const [picked, setPicked] = useState<number | null>(null);
  // 층 상세는 주소(?v=d)로 — 휴대폰 뒤로 가기가 홈이 아니라 목록으로 돌아오게.
  const sp = useSearchParams();
  const view: 'list' | 'detail' = sp.get('v') === 'd' ? 'detail' : 'list';
  const setView = (v: 'list' | 'detail') => (v === 'detail' ? router.push('/tower?v=d') : router.push('/tower'));
  const [sheet, setSheet] = useState<null | 'equip' | 'avatar'>(null);
  // 착용 가능 장비 팝업이 보여 줄 층 — 상세에선 도전할 층, 목록에선 고른 층(2차 피드백 5).
  const [sheetFloor, setSheetFloor] = useState<number | null>(null);
  const openPool = (floor: number, slot?: TowerSlot) => {
    if (slot) setEquipTab(slot);
    setSheetFloor(floor);
    setSheet('equip');
  };
  const [equipTab, setEquipTab] = useState<TowerSlot>('weapon');
  // 'pending' = 도전을 누른 직후 — 서버 판정을 기다리는 동안 전투 화면을 먼저 띄운다(낙관적 전환).
  const [battle, setBattle] = useState<TowerChallengeResult | 'pending' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // 낙관적 장착(부위 → 장착할 장비) — 누르는 즉시 화면에 반영하고, 실패하면 되돌린다. 성공하면 액션의 재렌더가 같은 상태를 준다.
  const [optEquip, setOptEquip] = useState<Partial<Record<TowerSlot, string>>>({});
  const items = useMemo(
    () => board.items.map((i) => (optEquip[i.slot] ? { ...i, equipped: i.ueid === optEquip[i.slot] } : i)),
    [board.items, optEquip],
  );

  const pools = useMemo(() => new Map(Object.entries(board.pools).map(([k, v]) => [Number(k), v as SlotKeys])), [board.pools]);
  const specials = useMemo(() => new Map(Object.entries(board.specials).map(([k, v]) => [Number(k), v as SlotKeys])), [board.specials]);
  const ruleOf = (f: number) => floorRule(f, pools.get(towerSection(f)) ?? null, specials.get(towerSection(f)) ?? null);

  const equipped: EquippedPiece[] = items.filter((i) => i.equipped).map((i) => ({ slot: i.slot, key: i.key, cp: i.cp }));
  const rule = ruleOf(next);

  // 아바타 — 목록은 배율 높은 순. 처음엔 마지막에 고른 아바타, 없으면 배율 최고.
  const avatarRows = useMemo(() => {
    const owned = new Map(items.map((i) => [i.key, { slot: i.slot, cp: i.cp }]));
    return board.avatars
      .map((a) => {
        const keys = new Set(a.keys);
        const lo = bestLoadout(owned, rule, keys);
        const loPieces = TOWER_SLOTS.flatMap((s) => {
          const it = lo[s] ? items.find((i) => i.key === lo[s]) : null;
          return it ? [{ slot: s, key: it.key, cp: it.cp }] : [];
        });
        return {
          ...a,
          mult: avatarMultiplier(equipped, rule, keys),
          now: towerCp(equipped, rule, keys),
          best: towerCp(loPieces, rule, keys).total,
          loadout: lo,
        };
      })
      .sort((x, y) => y.best - x.best || y.mult - x.mult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, items, next]);
  const [avatarId, setAvatarId] = useState<string | null>(() => {
    const last = board.lastProfileId && board.avatars.some((a) => a.id === board.lastProfileId) ? board.lastProfileId : null;
    return last ?? avatarRows[0]?.id ?? null;
  });
  const avatar = avatarRows.find((a) => a.id === avatarId) ?? avatarRows[0] ?? null;
  const cpNow = avatar?.now ?? towerCp(equipped, rule, new Set());

  const doEquip = (ueids: string[]) => {
    // 낙관적 반영 — 누르는 즉시 장착 표시(탑 전투력·배율도 즉시 다시 계산된다).
    const opt: Partial<Record<TowerSlot, string>> = {};
    for (const id of ueids) {
      const it = board.items.find((i) => i.ueid === id);
      if (it) opt[it.slot] = id;
    }
    setOptEquip((o) => ({ ...o, ...opt }));
    setMsg(null);
    start(async () => {
      // 성공 응답은 액션이 화면을 새로 그려 주니 실패했을 때만 되돌리고 다시 불러온다(CLAUDE §11.7).
      let failed = false;
      for (const id of ueids) {
        const r = await towerEquipAction(id).catch(() => ({ status: 'error' as const, message: '장착하지 못했어요. 잠시 후 다시 시도해 주세요.' }));
        if (r.status !== 'success') {
          setMsg(r.message);
          failed = true;
          break;
        }
      }
      setOptEquip({});
      if (failed) router.refresh();
    });
  };

  // 도전 한 번 = 키 하나. 응답을 못 받고 다시 눌러도 같은 키면 서버가 앞선 결과를 돌려준다(도전 이중 차감 방지).
  const challenge = () => {
    setMsg(null);
    setBattle('pending');
    start(async () => {
      const r = await towerChallengeAction(next, avatar?.id ?? null, crypto.randomUUID(), board.week).catch(() => null);
      if (!r || r.status !== 'success') {
        setBattle(null);
        return setMsg(r?.message ?? '도전하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
      setLocal({ best: r.result.best, attemptsLeft: r.result.attemptsLeft });
      setBattle(r.result);
    });
  };

  if (battle) {
    const res = battle === 'pending' ? null : battle;
    return (
      <TowerBattle
        key={res ? res.battleId : 'pending'}
        floor={res ? res.floor : next}
        result={res}
        myCp={cpNow.total}
        avatarSouth={avatar?.south ?? null}
        retrying={pending}
        onList={() => {
          setBattle(null);
          setPicked(null);
          router.replace('/tower');
        }}
        onNext={() => setBattle(null)}
        onRetry={challenge}
        onGear={() => {
          setBattle(null);
          openPool(next);
        }}
      />
    );
  }

  // 팝업(목록·상세 공용) — 착용 가능 장비는 sheetFloor 기준(상세=도전할 층, 목록=고른 층).
  const pf = sheetFloor ?? next;
  const pRule = ruleOf(pf);
  const pCounts = poolCounts(board, items, pRule);
  const popups = (
    <>
        {sheet === 'equip' ? (
          <ModalShell onClose={() => setSheet(null)} label="착용 가능 장비">
            <ModalLayout
              title="착용 가능 장비"
              subtitle={
                <>
                  {rangeText(pf)}
                  {towerSection(pf) === 1 && !towerIsSpecial(pf) ? '' : <span suppressHydrationWarning> · {renewText(board.week)}</span>} · 탑 전투력 <b className="text-amber-300">{n(cpNow.total)}</b>
                </>
              }
              bodyPad="sm"
              maxBodyClass="max-h-[58vh]"
              footer={<ModalButton tone="ghost" onClick={() => setSheet(null)}>닫기</ModalButton>}
            >
              <div className="grid grid-cols-3 gap-1">
                {TOWER_SLOTS.map((s) => (
                  <button key={s} type="button" onClick={() => setEquipTab(s)} className={`rounded-lg border py-1.5 text-[11.5px] font-extrabold tabular-nums ${equipTab === s ? 'border-amber-500/70 bg-amber-950/50 text-amber-200' : pCounts.bySlot[s].owned === 0 ? 'border-zinc-800 text-red-300' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`}>
                    {SLOT_KO[s]} {pCounts.bySlot[s].owned}/{pCounts.bySlot[s].total}
                  </button>
                ))}
              </div>
              <PoolList board={board} items={items} slot={equipTab} rule={pRule} avatarKeys={new Set(avatar?.keys ?? [])} onEquip={(id) => doEquip([id])} />
            </ModalLayout>
          </ModalShell>
        ) : null}

        {sheet === 'avatar' ? (
          <ModalShell onClose={() => setSheet(null)} label="선택 아바타">
            <ModalLayout
              title="선택 아바타"
              subtitle="맞췄을 때 탑 전투력 높은 순"
              bodyPad="sm"
              maxBodyClass="max-h-[56vh]"
              footer={<ModalButton tone="ghost" onClick={() => setSheet(null)}>닫기</ModalButton>}
            >
              <div className="flex flex-col gap-1.5">
                {avatarRows.map((a) => {
                  const sel = a.id === avatar?.id;
                  const canBetter = a.best > a.now.total;
                  return (
                    <div key={a.id} className={`rounded-xl border ${sel ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800'}`}>
                      <button type="button" onClick={() => setAvatarId(a.id)} className="flex h-[52px] w-full items-center gap-2.5 px-2.5 text-left">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {a.south ? <img src={a.south} alt="" className="h-10 w-auto" style={PIX} /> : <span className="h-10 w-8" />}
                        <span className="min-w-0 flex-1 leading-tight">
                          <b className="block text-[12px]">{a.isDefault ? '기본 아바타 · 항상 ×1' : a.now.doubledCount > 0 ? `장착과 맞는 장비 ${a.now.doubledCount}개` : '장착과 맞는 장비 없음'}</b>
                          <span className="block truncate text-[10px] text-zinc-400">지금 {n(a.now.total)}{canBetter ? (a.isDefault ? ` · 가장 센 요구 장비로 장착하면 ${n(a.best)}` : ` · 이 아바타 장비로 맞추면 ${n(a.best)}`) : ''}</span>
                        </span>
                        <b className={`text-[14px] ${a.mult > 1 ? 'text-sky-300' : 'text-zinc-500'}`}>×{a.mult.toFixed(2)}</b>
                      </button>
                      {sel && canBetter ? (
                        <button
                          type="button"
                          onClick={() => {
                            const ids = TOWER_SLOTS.flatMap((s) => {
                              const key = a.loadout[s];
                              const it = key ? items.find((i) => i.key === key && !i.equipped) : null;
                              return it ? [it.ueid] : [];
                            });
                            doEquip(ids);
                          }}
                          className="mx-2 mb-2 w-[calc(100%-16px)] rounded-lg border border-amber-600/60 bg-amber-950/40 py-1.5 text-[11px] font-extrabold text-amber-200"
                        >
                          {a.isDefault ? '가장 센 요구 장비로 장착' : '이 아바타 장비로 맞춰 장착'} · {n(a.best)}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <a href="/me/create" className="mt-2 flex items-center justify-between rounded-xl border border-dashed border-amber-700 bg-amber-950/25 px-3 py-2 text-[11.5px] font-extrabold text-amber-300">
                ＋ 요구 장비를 장착하고 아바타 만들기
                <span className="text-[10px] font-bold text-amber-200/80">아바타 생성 ›</span>
              </a>
              <p className="mt-2 px-1 text-[10px] text-zinc-500">아바타는 지금 장착한 장비로 만들어져요. 먼저 요구 장비를 장착하면 그 장비가 ×2가 되는 아바타가 됩니다.</p>
            </ModalLayout>
          </ModalShell>
        ) : null}
    </>
  );

  // ── 층 상세 ─────────────────────────────────────────────
  if (view === 'detail' && !topped) {
    const info = towerFloorInfo(next);
    const sec = towerSection(next);
    const special = towerIsSpecial(next);
    const allGear = sec === 1 && !special; // 1~9층 — 모든 장비
    const counts = poolCounts(board, items, rule);
    const base = towerCp(equipped, rule, new Set()).total; // 아바타 없이(×1) — 요구 장비 아님(×0)은 빠진다
    const preview = TOWER_SLOTS.map((s) => poolKeys(board, items, s, rule)[0]).filter((k): k is string => !!k);
    return (
      // 스크롤 없이 한 화면(1차 피드백 2) — 장면이 남는 높이를 차지하고, 하단 카드·버튼은 고정 높이.
      <main className="flex h-[calc(100%-var(--chat-dock-h,0px))] flex-col overflow-hidden bg-zinc-950 px-3 pt-1.5 pb-3 text-zinc-100">
        <BackTitle title={`${next}층`} fallback="/tower" className="flex-none" right={<span className="text-[11px] text-zinc-300"><Attempts left={attemptsLeft} /></span>} />

        <div className="relative mt-1.5 min-h-[260px] flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-cover bg-center" style={{ backgroundImage: `url(${assetUrl(`/sprites/tower/scene/${info.scene}.png`)})`, ...PIX }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(`/sprites/tower/mon/${info.sprite}.png`)} alt="" className="absolute bottom-[112px] left-1/2 h-[42%] max-h-[170px] w-auto -translate-x-1/2 drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]" style={PIX} />
          <div className="absolute left-3 top-2.5 text-[10.5px] font-black text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,.9)]">
            {special ? '✦ ' : ''}{next}층 · {info.theme}{special ? ' · 특별층' : ''}
          </div>
          <span className="absolute right-2.5 top-2 rounded-full bg-black/60 px-2.5 py-0.5 text-[11px] font-bold">돌파 {rewardText(next)}</span>
          <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black/90 via-black/55 to-transparent" />
          <div className="absolute inset-x-3 bottom-[64px]">
            <h1 className="text-[18px] font-black leading-tight">{info.name}</h1>
            <p className="mt-0.5 text-[11.5px] text-zinc-300">{info.line}</p>
          </div>
          <button type="button" onClick={() => openPool(next)} className="absolute inset-x-2 bottom-2 flex items-center gap-2.5 rounded-xl border border-amber-500/45 bg-zinc-950/70 px-2.5 py-2 text-left backdrop-blur-[2px]">
            <span className="flex flex-none">
              {preview.map((k, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={k} src={itemSrc(board.catalog[k]?.slot as TowerSlot, k)} alt="" className={`h-6 w-6 ${i ? '-ml-1.5' : ''}`} style={PIX} />
              ))}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <b className="block text-[12.5px]">착용 가능 장비</b>
              <span className="block truncate text-[10px] text-zinc-400">
                {allGear ? '' : <><span suppressHydrationWarning>{renewText(board.week)}</span> · </>}보유 {counts.owned}/{counts.total}
              </span>
            </span>
            <span className="text-[11px] font-bold text-amber-300">보기 ›</span>
          </button>
        </div>

        {/* 내 장착 — 장비별 전투력(×배율)과 '기본 합 × 아바타 배율 = 탑 전투력'이 한눈에(2차 피드백 7). */}
        <div className="mt-2 flex-none rounded-xl border border-zinc-800 px-2.5 py-2">
          <div className="flex items-start gap-2">
            {TOWER_SLOTS.map((s) => {
              const p = cpNow.pieces.find((x) => x.slot === s);
              return (
                <button key={s} type="button" onClick={() => openPool(next, s)} aria-label={`${SLOT_KO[s]} 착용 가능 장비`} className="flex w-[54px] flex-none flex-col items-center gap-0.5">
                  <span className={`relative flex h-10 w-10 items-center justify-center rounded-lg border ${p?.mult === 2 ? 'border-amber-500 bg-amber-950/60' : p?.mult === 0 ? 'border-red-900 bg-zinc-900 opacity-60' : 'border-zinc-700 bg-zinc-900'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p ? <img src={itemSrc(s, p.key)} alt="" className="h-8 w-8" style={PIX} /> : <span className="text-[9px] text-zinc-500">{SLOT_KO[s]}</span>}
                    {p ? (
                      <span className={`absolute -bottom-1 -right-1 rounded px-0.5 text-[9px] font-black ${p.mult === 2 ? 'bg-amber-600 text-amber-950' : p.mult === 0 ? 'bg-red-900 text-red-200' : 'bg-zinc-800 text-zinc-300'}`}>×{p.mult}</span>
                    ) : null}
                  </span>
                  <span className={`text-[10px] font-bold tabular-nums ${p?.mult === 0 ? 'text-red-300' : 'text-zinc-300'}`}>{p ? (p.mult === 0 ? '제외' : n(p.cp)) : '-'}</span>
                </button>
              );
            })}
            <span className="mx-0.5 h-12 w-px flex-none self-center bg-zinc-800" />
            <button type="button" onClick={() => setSheet('avatar')} className="flex min-w-0 flex-1 items-center gap-2 self-center text-left">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatar?.south ? <img src={avatar.south} alt="" className="h-11 w-auto flex-none" style={PIX} /> : null}
              <span className="leading-tight">
                <span className="block text-[10px] text-zinc-400">아바타 배율</span>
                <b className="block text-[16px] text-sky-300">×{(avatar?.mult ?? 1).toFixed(2)}</b>
                <span className="text-[10.5px] font-bold text-zinc-300">변경 ›</span>
              </span>
            </button>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between border-t border-zinc-800/80 pt-1.5 text-[11px] tabular-nums text-zinc-400">
            <span>
              기본 {n(base)} <span className="text-zinc-600">×</span> <b className="text-sky-300">{(avatar?.mult ?? 1).toFixed(2)}</b> <span className="text-zinc-600">=</span>
            </span>
            <span>탑 전투력 <b className="text-[15px] text-amber-300">{n(cpNow.total)}</b></span>
          </div>
        </div>
        {msg ? <p className="mt-1.5 flex-none text-center text-[11.5px] text-red-300">{msg}</p> : null}
        <button type="button" disabled={pending || attemptsLeft <= 0 || cpNow.total <= 0} onClick={challenge} className="mt-2 h-[46px] w-full flex-none rounded-xl bg-gradient-to-b from-amber-500 to-amber-600 text-[14px] font-black text-amber-950 disabled:opacity-50">
          {attemptsLeft <= 0 ? '오늘 도전을 모두 썼어요' : cpNow.total <= 0 ? '착용 가능 장비를 먼저 장착해 주세요' : '도전'}
        </button>

        {popups}
      </main>
    );
  }

  // ── 층 목록(등반로) ─────────────────────────────────────
  // 아래 1층에서 위로 오르는 지그재그 길(시안 C). 구간(10층)마다 그 장소의 장면을 배경으로 깔고, 층마다 그 층 몬스터를 발판에 세운다.
  // 지금 구간까지 보여 주고, 그 위 구간은 잠긴 문 한 줄. 아래 시트는 고른 층(기본 = 도전할 층) 정보와 도전 버튼.
  const shownFloor = picked ?? next;
  const shownInfo = towerFloorInfo(shownFloor);
  const curSec = towerSection(next);
  const gateSec = curSec < Math.ceil(TOWER_FLOORS / TOWER_SECTION) && !topped ? curSec + 1 : null;
  return (
    <main className="flex h-[calc(100%-var(--chat-dock-h,0px))] flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <BackTitle title="무한의 탑" className="flex-none px-3 pt-1.5" right={<span className="text-[11px] text-zinc-300"><Attempts left={attemptsLeft} /></span>} />

      <div data-climb className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {gateSec ? (
          <div className="border-b border-zinc-800 bg-gradient-to-b from-zinc-800 to-zinc-900 px-3 py-3.5 text-center text-[11px] text-zinc-400">
            🔒 {(gateSec - 1) * TOWER_SECTION + 1}층 · {towerFloorInfo((gateSec - 1) * TOWER_SECTION + 1).theme} · {(gateSec - 1) * TOWER_SECTION}층 수문장을 넘으면 열린다
          </div>
        ) : null}
        {Array.from({ length: curSec }, (_, i) => curSec - i).map((sec) => (
          <ClimbLeg
            key={sec}
            sec={sec}
            best={best}
            next={next}
            picked={shownFloor}
            avatarSouth={avatar?.south ?? null}
            onPick={(f) => setPicked(f === next ? null : f)}
          />
        ))}
        <div className="flex h-10 items-center justify-center border-t-2 border-stone-700 bg-stone-900 text-[11px] text-stone-400">탑 입구</div>
      </div>

      {/* 고른 층 — 줄마다 높이 고정(층을 바꿔도 시트가 흔들리지 않게). */}
      <div className="flex-none border-t border-zinc-700 bg-zinc-950 px-3 py-2">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(`/sprites/tower/mon/${shownInfo.sprite}.png`)} alt="" className="h-14 w-14 flex-none object-contain" style={PIX} />
          <div className="min-w-0 flex-1 text-[10.5px]">
            <div className="h-4 font-black text-amber-300">
              {towerIsSpecial(shownFloor) ? '✦ ' : ''}{shownFloor}층 · {shownInfo.theme}
              <span className="ml-1 font-bold text-zinc-400">{shownFloor <= best ? '돌파함' : shownFloor === next ? '도전 가능' : '잠김'}</span>
            </div>
            <b className="block h-5 truncate text-[14px] leading-5">{shownInfo.name}</b>
            <div className="flex h-5 items-center"><span className="w-[48px] flex-none text-zinc-400">돌파</span>{rewardText(shownFloor)}</div>
            <div className="flex h-5 items-center">
              <span className="w-[48px] flex-none text-zinc-400">요구 장비</span>
              <span className="min-w-0 flex-1 truncate">
                {towerSection(shownFloor) === 1 && !towerIsSpecial(shownFloor) ? '모든 장비' : towerIsSpecial(shownFloor) ? (
                  <span className="inline-flex gap-0.5">
                    {TOWER_SLOTS.map((s) => {
                      const k = specials.get(towerSection(shownFloor))?.[s]?.[0];
                      // eslint-disable-next-line @next/next/no-img-element
                      return k ? <img key={s} src={itemSrc(s, k)} alt="" title={board.catalog[k]?.name} className="h-4 w-4 rounded border border-amber-700 bg-zinc-900" style={PIX} /> : null;
                    })}
                  </span>
                ) : `${rangeText(shownFloor)} · 부위별 10개`}
              </span>
              <button type="button" onClick={() => openPool(shownFloor)} className="ml-1 h-[18px] flex-none rounded-md border border-amber-600/60 px-1.5 text-[10px] font-bold leading-none text-amber-200">보기</button>
            </div>
          </div>
          {topped ? (
            <span className="w-[72px] flex-none text-center text-[11px] text-zinc-400">최고층 도달</span>
          ) : shownFloor === next ? (
            <button type="button" onClick={() => setView('detail')} className="h-12 w-[72px] flex-none rounded-xl bg-gradient-to-b from-amber-500 to-amber-600 text-[14px] font-black text-amber-950 shadow-lg">
              도전
            </button>
          ) : (
            <button type="button" onClick={() => setPicked(null)} className="h-12 w-[72px] flex-none rounded-xl border border-zinc-700 text-[11px] font-bold leading-tight text-zinc-300">
              {next}층으로
            </button>
          )}
        </div>
      </div>
      {popups}
    </main>
  );
}

// 등반로 한 구간 — 발판 10개의 위치(아래 1번째 → 위 10번째). x는 %, 10번째(수문장)는 가운데 위.
const LEG_H = 680;
const LEG_X = [50, 74, 82, 60, 34, 18, 42, 20, 74, 50];
const legY = (k: number) => LEG_H - 46 - k * 64;

function ClimbLeg({ sec, best, next, picked, avatarSouth, onPick }: {
  sec: number;
  best: number;
  next: number;
  picked: number;
  avatarSouth: string | null;
  onPick: (floor: number) => void;
}) {
  const lo = (sec - 1) * TOWER_SECTION + 1;
  const theme = towerFloorInfo(lo).theme;
  const curRef = useRef<HTMLButtonElement>(null);
  // 처음 열 때(또 돌파로 다음 층이 바뀔 때) 지금 층이 화면 가운데쯤 오게 — 등반로 스크롤 상자만 움직인다(DOM만 만지므로 effect).
  useEffect(() => {
    const el = curRef.current;
    const box = el?.closest<HTMLElement>('[data-climb]');
    if (el && box) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - box.clientHeight * 0.55;
  }, [next]);
  const pts = LEG_X.map((x, k) => `${x},${legY(k)}`);
  const doneTo = Math.max(0, Math.min(TOWER_SECTION, best - lo + 2)); // 돌파한 발판 + 지금 발판까지 잇는다
  return (
    <section className="relative overflow-hidden" style={{ height: LEG_H }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetUrl(`/sprites/tower/scene/${towerFloorInfo(lo).scene}.png`)} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" style={PIX} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950/90 via-black/20 to-black/55" />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 100 ${LEG_H}`} preserveAspectRatio="none" aria-hidden>
        <polyline points={pts.join(' ')} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="3" strokeDasharray="2 7" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {doneTo > 1 ? <polyline points={pts.slice(0, doneTo).join(' ')} fill="none" stroke="rgb(245,165,36)" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
      </svg>
      <div className="absolute bottom-3 left-3 z-10 drop-shadow-[0_1px_3px_rgba(0,0,0,.9)]">
        <b className="block text-[15px] font-black">{theme}</b>
        <span className="text-[10.5px] text-zinc-300">{lo}~{lo + TOWER_SECTION - 1}층</span>
      </div>
      {LEG_X.map((x, k) => {
        const f = lo + k;
        const info = towerFloorInfo(f);
        const st = f <= best ? 'd' : f === next ? 'c' : 'l';
        const boss = towerIsSpecial(f);
        return (
          <button
            key={f}
            ref={st === 'c' ? curRef : undefined}
            type="button"
            onClick={() => onPick(f)}
            aria-label={`${f}층 ${info.name}`}
            className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${x}%`, top: legY(k) }}
          >
            <span className="relative">
              {st === 'c' && avatarSouth ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSouth} alt="" className="absolute bottom-0 right-[78%] h-12 w-auto max-w-none drop-shadow-[0_2px_3px_rgba(0,0,0,.9)]" style={PIX} />
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl(`/sprites/tower/mon/${info.sprite}.png`)}
                alt=""
                className={`${boss ? 'h-20 w-20' : 'h-12 w-12'} object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,.9)] ${st === 'd' ? 'opacity-60 grayscale' : st === 'l' ? 'brightness-[.55]' : ''}`}
                style={PIX}
              />
            </span>
            <span
              className={`-mt-1 min-w-[26px] rounded-full border px-1.5 text-center text-[10.5px] font-black tabular-nums ${
                st === 'd' ? 'border-amber-300/40 bg-amber-500 text-amber-950' : st === 'c' ? 'animate-pulse border-amber-300 bg-amber-50 text-amber-800 shadow-[0_0_12px_3px_rgba(245,165,36,.7)]' : 'border-white/15 bg-zinc-900/85 text-zinc-400'
              } ${picked === f ? 'ring-2 ring-white' : ''}`}
            >
              {boss ? `${f}층 수문장` : f}
            </span>
          </button>
        );
      })}
    </section>
  );
}

type PoolItem = TowerBoard['items'][number];

/** 그 부위의 착용 가능 장비 키 — 입문(allowed=null)은 보유 장비 전부 + 10층 지정 장비. */
function poolKeys(board: TowerBoard, items: PoolItem[], slot: TowerSlot, rule: ReturnType<typeof floorRule>): string[] {
  return rule.allowed === null
    ? [...new Set([...items.filter((i) => i.slot === slot).map((i) => i.key), ...[...(rule.doubleable ?? [])].filter((k) => board.catalog[k]?.slot === slot)])]
    : [...rule.allowed].filter((k) => board.catalog[k]?.slot === slot);
}

/** 부위별·전체 보유 수(착용 가능 장비 중 가진 것). */
function poolCounts(board: TowerBoard, items: PoolItem[], rule: ReturnType<typeof floorRule>) {
  const owned = new Set(items.map((i) => i.key));
  const bySlot = Object.fromEntries(
    TOWER_SLOTS.map((s) => {
      const keys = poolKeys(board, items, s, rule);
      return [s, { owned: keys.filter((k) => owned.has(k)).length, total: keys.length }];
    }),
  ) as Record<TowerSlot, { owned: number; total: number }>;
  const total = TOWER_SLOTS.reduce((a, s) => a + bySlot[s].total, 0);
  const own = TOWER_SLOTS.reduce((a, s) => a + bySlot[s].owned, 0);
  return { bySlot, owned: own, total };
}

/**
 * 착용 가능 장비 목록(시안 A3) — 한 줄에 강화·초월, 기본 전투력 × 탑 배율 = 탑 기준 전투력, 장착 버튼까지.
 * 별도 상세 팝업 없이 여기서 바로 장착(낙관적). 순서: 장착 중 → 보유(탑 기준 전투력 높은 순) → 미보유.
 */
function PoolList({ board, items, slot, rule, avatarKeys, onEquip }: {
  board: TowerBoard;
  items: PoolItem[];
  slot: TowerSlot;
  rule: ReturnType<typeof floorRule>;
  avatarKeys: ReadonlySet<string>;
  onEquip: (ueid: string) => void;
}) {
  const ownedByKey = new Map(items.map((i) => [i.key, i]));
  const rows = poolKeys(board, items, slot, rule)
    .map((k) => {
      const it = ownedByKey.get(k) ?? null;
      const s = it ? towerCp([{ slot, key: k, cp: it.cp }], rule, avatarKeys).pieces[0]! : null;
      return { key: k, it, mult: s?.mult ?? 1, score: s?.score ?? 0 };
    })
    .sort((a, b) => Number(!!b.it?.equipped) - Number(!!a.it?.equipped) || Number(!!b.it) - Number(!!a.it) || b.score - a.score);
  if (!rows.length) return <p className="py-6 text-center text-[11.5px] text-zinc-500">이 부위의 착용 가능 장비가 없어요.</p>;
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {rows.map((r) => (
        <div
          key={r.key}
          className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${r.it?.equipped ? 'border-amber-500 bg-amber-950/40' : 'border-zinc-800 bg-zinc-950'} ${!r.it ? 'opacity-45' : ''}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={itemSrc(slot, r.key)} alt="" className="h-9 w-9 flex-none rounded-md bg-zinc-900" style={PIX} />
          <span className="min-w-0 flex-1 leading-tight">
            <b className="block truncate text-[12px]">{board.catalog[r.key]?.name ?? r.key}</b>
            <span className="text-[10px] text-zinc-400">{r.it ? `+${r.it.level}${r.it.transcend ? ` · 초월 ${r.it.transcend}` : ''}` : '아직 얻지 못한 장비'}</span>
          </span>
          {r.it ? (
            <span className="flex-none text-right leading-tight">
              <b className={`block text-[13px] tabular-nums ${r.mult === 2 ? 'text-amber-300' : r.mult === 0 ? 'text-red-300' : ''}`}>{n(r.score)}</b>
              <span className="text-[9.5px] tabular-nums text-zinc-500">{n(r.it.cp)} ×{r.mult}</span>
            </span>
          ) : null}
          {r.it?.equipped ? (
            <span className="w-[52px] flex-none text-center text-[10.5px] font-black text-amber-300">장착 중</span>
          ) : r.it ? (
            <button type="button" onClick={() => onEquip(r.it!.ueid)} className="w-[52px] flex-none rounded-lg bg-amber-500 py-1.5 text-[11px] font-black text-amber-950">장착</button>
          ) : (
            <span className="w-[52px] flex-none text-center text-[10px] text-zinc-500">미보유</span>
          )}
        </div>
      ))}
    </div>
  );
}
