'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { BackTitle } from '@/components/BackNav';
import { ModalShell } from '@/components/ModalShell';
import { assetUrl } from '@/lib/asset-versions';
import { TOWER_DAILY_ATTEMPTS, TOWER_FLOORS, TOWER_SECTION, towerIsSpecial, towerRequirement, towerReward, towerSection } from '@/lib/game/balance';
import { avatarMultiplier, floorRule, towerCp, TOWER_SLOTS, type EquippedPiece, type SlotKeys, type TowerSlot } from '@/lib/game/tower/engine';
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
  // 장착은 낙관적 반영(useOptimistic) 때문에 트랜지션 안에서. 도전은 트랜지션 밖에서 자체 busy로 —
  // 트랜지션 안에서 부르면 액션이 끝나도 라우터 갱신이 붙잡혀 pending이 풀리지 않아, 돌파 뒤 다음 층 도전 버튼이 막혔다.
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
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
  const [openSection, setOpenSection] = useState(towerSection(next));
  // 돌파로 다음 구간에 들어서면 펼친 구간도 따라간다(렌더 중 조정 — effect 없이).
  const [seenNext, setSeenNext] = useState(next);
  if (seenNext !== next) {
    setSeenNext(next);
    setOpenSection(towerSection(next));
  }
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
  // 브라우저 뒤로가기로 주소(?v=d)가 바뀌면 끝난 전투 화면도 닫는다 — 전투는 헤더가 없어 주소와 화면이 어긋나지 않게(렌더 중 조정).
  const [seenView, setSeenView] = useState(view);
  if (seenView !== view) {
    setSeenView(view);
    if (battle && battle !== 'pending') setBattle(null);
  }
  const [msg, setMsg] = useState<string | null>(null);
  // 낙관적 장착(부위 → 장착할 장비) — 누르는 즉시 화면에 반영하고, 실패하면 되돌린다. 성공하면 액션의 재렌더가 같은 상태를 준다.
  // useOptimistic — 액션과 그 재렌더가 한 트랜잭션으로 끝날 때까지 유지돼, 종전처럼 응답 직후 옛 장착이 잠깐 돌아오는 깜빡임이 없다.
  const [optEquip, addOptEquip] = useOptimistic<Partial<Record<TowerSlot, string>>, Partial<Record<TowerSlot, string>>>({}, (o, add) => ({ ...o, ...add }));
  const items = useMemo(
    () => board.items.map((i) => (optEquip[i.slot] ? { ...i, equipped: i.ueid === optEquip[i.slot] } : i)),
    [board.items, optEquip],
  );

  const pools = useMemo(() => new Map(Object.entries(board.pools).map(([k, v]) => [Number(k), v as SlotKeys])), [board.pools]);
  const specials = useMemo(() => new Map(Object.entries(board.specials).map(([k, v]) => [Number(k), v as SlotKeys])), [board.specials]);
  const ruleOf = (f: number) => floorRule(f, pools.get(towerSection(f)) ?? null, specials.get(towerSection(f)) ?? null);

  const equipped: EquippedPiece[] = items.filter((i) => i.equipped).map((i) => ({ slot: i.slot, key: i.key, cp: i.cp }));
  const rule = ruleOf(next);

  // 아바타 — 지금 장착 그대로 이 아바타를 골랐을 때의 배율·탑 전투력(3차 피드백 6: 최대치 표시 없음), 탑 전투력 높은 순.
  // 처음엔 마지막에 고른 아바타, 없으면 맨 위.
  const avatarRows = useMemo(() => {
    return board.avatars
      .map((a) => {
        const keys = new Set(a.keys);
        return { ...a, mult: avatarMultiplier(equipped, rule, keys), now: towerCp(equipped, rule, keys) };
      })
      .sort((x, y) => y.now.total - x.now.total || y.mult - x.mult);
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
    setMsg(null);
    start(async () => {
      addOptEquip(opt);
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
      if (failed) router.refresh();
    });
  };

  // 도전 한 번 = 키 하나. 응답을 못 받고 다시 눌러도 같은 키면 서버가 앞선 결과를 돌려준다(도전 이중 차감 방지).
  const challenge = async () => {
    if (busy) return;
    setMsg(null);
    setBusy(true);
    setBattle('pending');
    // 판정 대기는 30초까지 — 헤더 없는 전투 화면에 '준비 중'으로 갇히지 않게 실패로 돌린다(같은 키로 다시 누르면 서버가 앞선 결과를 준다).
    const r = await Promise.race([
      towerChallengeAction(next, avatar?.id ?? null, crypto.randomUUID(), board.week).catch(() => null),
      new Promise<null>((res) => setTimeout(() => res(null), 30_000)),
    ]);
    setBusy(false);
    if (!r || r.status !== 'success') {
      setBattle(null);
      return setMsg(r?.message ?? '도전하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    setLocal({ best: r.result.best, attemptsLeft: r.result.attemptsLeft });
    setBattle(r.result);
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
        retrying={busy}
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
              footer={<ModalButton tone="neutral" onClick={() => setSheet(null)}>닫기</ModalButton>}
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
              subtitle="지금 장착한 장비로 싸울 때 · 탑 전투력 높은 순"
              bodyPad="sm"
              maxBodyClass="max-h-[56vh]"
              footer={<ModalButton tone="neutral" onClick={() => setSheet(null)}>닫기</ModalButton>}
            >
              <div className="flex flex-col gap-1.5">
                {avatarRows.map((a) => {
                  const sel = a.id === avatar?.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAvatarId(a.id)}
                      className={`flex h-[56px] w-full items-center gap-2.5 rounded-xl border px-2.5 text-left ${sel ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800'}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {a.south ? <img src={a.south} alt="" className="h-10 w-auto" style={PIX} /> : <span className="h-10 w-8" />}
                      <span className="min-w-0 flex-1 leading-tight">
                        <b className="block text-[12px]">{a.isDefault ? '기본 아바타' : a.now.doubledCount > 0 ? `맞는 장비 ${a.now.doubledCount}개` : '맞는 장비 없음'}</b>
                        <span className="text-[10px] text-zinc-400">{sel ? '선택 중' : '누르면 선택'}</span>
                      </span>
                      <span className="flex-none text-right leading-tight">
                        <b className={`block text-[14px] tabular-nums ${a.mult > 1 ? 'text-sky-300' : 'text-zinc-400'}`}>×{a.mult.toFixed(2)}</b>
                        <span className="text-[10.5px] tabular-nums text-zinc-300">탑 전투력 <b className="text-amber-300">{n(a.now.total)}</b></span>
                      </span>
                    </button>
                  );
                })}
              </div>
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
    // 착용 가능 장비 버튼 왼쪽 그림 — 부위마다 풀 안에서 내가 가진 가장 센 장비(없거나 같으면 그중 하나, 주마다 고정).
    const owned = new Map(items.map((i) => [i.key, i.cp]));
    const preview = TOWER_SLOTS.map((s) => {
      const keys = poolKeys(board, items, s, rule);
      const top = Math.max(-1, ...keys.map((k) => owned.get(k) ?? -1));
      const cands = keys.filter((k) => (owned.get(k) ?? -1) === top);
      return cands.length ? cands[pickIndex(`${board.week}:${next}:${s}`, cands.length)] : undefined;
    }).filter((k): k is string => !!k);
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
            {/* 층 주인 전투력(=그 층 요구치) — 이름 옆 한 줄(줄이 늘지 않게). */}
            <h1 className="flex items-baseline gap-2 text-[18px] font-black leading-tight">
              <span className="min-w-0 truncate">{info.name}</span>
              <span className="flex-none text-[12px] font-bold tabular-nums text-red-300">전투력 {n(towerRequirement(next))}</span>
            </h1>
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
        <button type="button" disabled={busy || attemptsLeft <= 0 || cpNow.total <= 0} onClick={challenge} className="mt-2 h-[46px] w-full flex-none rounded-xl bg-gradient-to-b from-amber-500 to-amber-600 text-[14px] font-black text-amber-950 disabled:opacity-50">
          {attemptsLeft <= 0 ? '오늘 도전을 모두 썼어요' : cpNow.total <= 0 ? '착용 가능 장비를 먼저 장착해 주세요' : '도전'}
        </button>

        {popups}
      </main>
    );
  }

  // ── 층 목록 ─────────────────────────────────────────────
  const hero = picked ?? null;
  const heroInfo = hero ? towerFloorInfo(hero) : null;
  const sections = Math.ceil(TOWER_FLOORS / TOWER_SECTION);
  return (
    // 배경은 화면 자체의 배경으로(2차 피드백 3) — 종전의 760px 절대 배치 배경이 내용보다 길어 쓸데없는 스크롤을 만들었다.
    <main
      className="flex h-[calc(100%-var(--chat-dock-h,0px))] flex-col overflow-y-auto overscroll-contain bg-zinc-950 bg-cover bg-top text-zinc-100"
      style={{ backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,.1), rgba(0,0,0,.35) 45%, rgb(9,9,11) 92%), url(${assetUrl('/sprites/tower/bg/list.png')})`, ...PIX }}
    >
      <div className="flex flex-1 flex-col px-3 pb-3 pt-1.5">
        <BackTitle title="무한의 탑" right={<span className="rounded-md bg-black/55 px-2 py-0.5 text-[11px] text-zinc-100"><Attempts left={attemptsLeft} /></span>} />

        {/* 위쪽 정보 영역 — 기본은 최고 도달, 층을 누르면 그 층 카드 */}
        <div className="relative mt-2 flex h-[200px] flex-col justify-end">
          {heroInfo && hero ? (
            <div className="rounded-2xl border border-white/10 bg-black/55 p-3 backdrop-blur-[2px]">
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] font-black text-amber-300">
                    {towerIsSpecial(hero) ? '✦ ' : ''}{hero}층{towerIsSpecial(hero) ? ' · 특별층' : ''} · {hero <= best ? '돌파함' : hero === next ? '도전 가능' : '잠김'}
                  </div>
                  <b className="block text-[18px] leading-tight">{heroInfo.name}</b>
                  {/* 줄마다 높이 고정 — 층마다 요구 장비가 글자/아이콘으로 바뀌어도 카드가 흔들리지 않게. */}
                  <div className="mt-1 text-[10.5px]">
                    <div className="flex h-6 items-center"><span className="w-[52px] flex-none text-zinc-400">전투력</span><b className="tabular-nums text-red-300">{n(towerRequirement(hero))}</b></div>
                    <div className="flex h-6 items-center"><span className="w-[52px] flex-none text-zinc-400">돌파</span>{rewardText(hero)}</div>
                    <div className="flex h-6 items-center">
                      <span className="w-[52px] flex-none text-zinc-400">요구 장비</span>
                      <span className="min-w-0 flex-1 truncate">{towerSection(hero) === 1 && !towerIsSpecial(hero) ? '모든 장비' : towerIsSpecial(hero) ? (
                      <span className="inline-flex gap-0.5">
                        {TOWER_SLOTS.map((s) => {
                          const k = specials.get(towerSection(hero))?.[s]?.[0];
                          // eslint-disable-next-line @next/next/no-img-element
                          return k ? <img key={s} src={itemSrc(s, k)} alt="" title={board.catalog[k]?.name} className="h-5 w-5 rounded border border-amber-700 bg-zinc-900" style={PIX} /> : null;
                        })}
                      </span>
                    ) : `${(towerSection(hero) - 1) * 10 + 1}~${towerSection(hero) * 10}층 · 부위별 10개`}</span>
                      {/* 줄 높이 안에 들어가는 작은 버튼 — 층을 바꿔도 카드가 흔들리지 않게(2차 피드백 5). */}
                      <button type="button" onClick={() => openPool(hero)} className="ml-1 h-5 flex-none rounded-md border border-amber-600/60 px-1.5 text-[10px] font-bold leading-none text-amber-200">보기</button>
                    </div>
                  </div>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(`/sprites/tower/mon/${heroInfo.sprite}.png`)} alt="" className={`h-[96px] w-auto self-end ${hero > next ? 'opacity-35 brightness-0 invert' : 'drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]'}`} style={PIX} />
              </div>
            </div>
          ) : (
            <div className="pb-2 pl-1 drop-shadow-[0_2px_3px_rgba(0,0,0,.9)]">
              <div className="text-[11px] text-zinc-200">최고 도달</div>
              <div className="text-[32px] font-black leading-none">{best}층</div>
              <div className="mt-1 text-[11px] text-amber-300">{board.myRank ? `서버 ${board.myRank}위` : '아직 기록 없음'}</div>
            </div>
          )}
        </div>

        {/* 구간 카드 */}
        <div className="mt-3 flex flex-col gap-1.5">
          {Array.from({ length: sections }, (_, i) => sections - i).map((sec) => {
            const lo = (sec - 1) * TOWER_SECTION + 1;
            const hi = sec * TOWER_SECTION;
            const done = best >= hi;
            const locked = best + 1 < lo;
            const cleared = Math.max(0, Math.min(TOWER_SECTION, best - lo + 1));
            const open = openSection === sec;
            if (locked && sec > towerSection(next) + 1) return null; // 다음 구간까지만 보여 준다
            return (
              <div key={sec} className={`overflow-hidden rounded-xl border bg-zinc-950/80 backdrop-blur-[2px] ${sec === towerSection(next) ? 'border-amber-600/60' : 'border-zinc-800'}`}>
                {/* 구간 머리 — 그 장소의 장면을 띠로 깔고 장소 이름. 잠긴 구간은 어둡게. */}
                <button type="button" onClick={() => setOpenSection(open ? 0 : sec)} className="relative flex h-11 w-full items-center justify-between overflow-hidden px-3 text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(`/sprites/tower/scene/${towerFloorInfo(lo).scene}.png`)} alt="" aria-hidden className={`absolute inset-0 h-full w-full object-cover ${locked ? 'brightness-[.35] grayscale' : done ? 'brightness-75 grayscale-[.6]' : ''}`} style={PIX} />
                  <span className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-black/20" />
                  <span className="relative leading-tight">
                    <b className="block text-[13px]">{towerFloorInfo(lo).theme}</b>
                    <span className="text-[10px] text-zinc-300">{lo} ~ {hi}층</span>
                  </span>
                  <span className={`relative text-[10.5px] font-bold ${done ? 'text-emerald-300' : locked ? 'text-zinc-400' : 'tabular-nums text-amber-200'}`}>{done ? '완료' : locked ? '잠김' : `${cleared} / ${TOWER_SECTION}`}</span>
                </button>
                {open ? (
                  <div className="px-3 pb-3">
                    {/* 층 칸(3차 피드백 1·3·4) — 돌파=초록 칸·흐린 몬스터, 도전=금색 두꺼운 테두리·빛, 잠김=몬스터 실루엣만, 특별층=붉은 ✦.
                        위 구간 머리의 장면 띠가 positioned라 칸 선택 테두리를 덮지 않게 grid도 relative + 위 여백. */}
                    <div className="relative grid grid-cols-5 gap-1.5 pt-2">
                      {Array.from({ length: TOWER_SECTION }, (_, j) => lo + j).map((f) => {
                        const st = f <= best ? 'd' : f === next ? 'c' : 'l';
                        const sp = towerIsSpecial(f);
                        return (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setPicked(picked === f ? null : f)}
                            aria-label={`${f}층 ${st === 'l' ? '잠김' : towerFloorInfo(f).name}`}
                            className={`relative flex flex-col items-center rounded-md pt-1 pb-0.5 ${
                              st === 'd'
                                ? 'border border-emerald-700/70 bg-emerald-950/55'
                                : st === 'c'
                                  ? 'border-2 border-amber-400 bg-amber-900/45 shadow-[0_0_10px_rgba(245,158,11,.5)]'
                                  : sp
                                    ? 'border border-rose-800/80 bg-rose-950/30'
                                    : 'border border-zinc-800 bg-zinc-950'
                            } ${picked === f ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-950' : ''}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={assetUrl(`/sprites/tower/mon/${towerFloorInfo(f).sprite}.png`)}
                              alt=""
                              className={`h-8 w-8 object-contain ${st === 'd' ? 'opacity-50 grayscale' : st === 'l' ? 'opacity-30 brightness-0 invert' : ''}`}
                              style={PIX}
                            />
                            <span className={`text-[10.5px] font-black tabular-nums ${st === 'd' ? 'text-emerald-300' : st === 'c' ? 'text-amber-200' : sp ? 'text-rose-300' : 'text-zinc-500'}`}>
                              {sp ? '✦' : ''}{f}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {!topped ? (
          <button type="button" onClick={() => setView('detail')} className="sticky bottom-0 mt-auto w-full rounded-xl bg-gradient-to-b from-amber-500 to-amber-600 py-3 text-[14px] font-black text-amber-950 shadow-lg">
            {next}층 도전
          </button>
        ) : (
          <p className="mt-auto text-center text-[12px] text-zinc-300">지금 열린 가장 높은 층까지 올랐어요.</p>
        )}
      </div>
      {popups}
    </main>
  );
}

type PoolItem = TowerBoard['items'][number];

/** 문자열 → 0..n-1 고정 인덱스 — 서버·브라우저 렌더가 같은 값을 내도록 Math.random 대신 쓴다. */
function pickIndex(seed: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return (h >>> 0) % n;
}

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
