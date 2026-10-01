'use client';

import { useMemo, useOptimistic, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { useDiamondActions } from '@/components/DiamondContext';
import { useResourceToast } from '@/components/ResourceToast';
import { BackTitle } from '@/components/BackNav';
import { ModalShell } from '@/components/ModalShell';
import { assetUrl } from '@/lib/asset-versions';
import { TOWER_DAILY_ATTEMPTS, TOWER_FLOORS, TOWER_SECTION, towerIsSpecial, towerRequirement, towerReward, towerSection } from '@/lib/game/balance';
import { floorRule, towerCp, TOWER_SLOTS, type EquippedPiece, type SlotKeys, type TowerSlot } from '@/lib/game/tower/engine';
import { towerFloorInfo } from '@/lib/game/tower/floors';
import type { TowerChallengeResult, TowerBoard } from '@/lib/game/tower/service';

import { towerChallengeAction, towerClaimAction, towerEquipAction } from './actions';
import { FLOOR_MAIN, FLOOR_ROW, TowerBattle, TowerStage } from './TowerBattle';
import { TowerSkillTags } from './TowerSkills';
import { ActionBar, PIX, PrimaryButton, SecondaryButton, huntText, n, rewardText } from './TowerUi';

const SLOT_KO: Record<TowerSlot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const itemSrc = (slot: TowerSlot, key: string) => assetUrl(`/sprites/${slot}/${key}.png`);

/** 오늘 남은 도전 — 'N/3', 다 쓰면 N(0)만 빨간색. */
function Attempts({ left }: { left: number }) {
  return (
    <span className="tabular-nums">
      오늘 도전 <b className={left <= 0 ? 'text-red-400' : 'text-amber-300'}>{left}</b>
      <span className="text-zinc-400">/{TOWER_DAILY_ATTEMPTS}</span>
    </span>
  );
}

/** 착용 가능 장비의 층 — 요구 장비는 층마다 다르다(1~10층은 모든 장비). 특별층은 부위마다 1개. */
function rangeText(floor: number): string {
  return `${floor}층${towerIsSpecial(floor) && towerSection(floor) > 1 ? ' · 부위마다 1개' : ''}`;
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
  // 결과를 받기 전까지 유지하는 도전 요청 키(층별) — 응답 없이 끝난 도전을 다시 누르면 같은 키로 보낸다.
  const idemRef = useRef<{ floor: number; key: string } | null>(null);
  // 방금 끝난 전투의 결과(최고 층·남은 도전)를 먼저 쓴다 — 돌파 뒤 'N층으로'가 서버 재렌더보다 먼저 눌려도 다음 층이 맞게
  // (2차 피드백 9: 7층 돌파 → '8층으로'가 7층 상세로 가던 문제). 새 board가 오면 그 값으로 돌아간다(렌더 중 조정).
  // 도전은 화면을 다시 그리지 않으므로(액션 응답으로 반영) 이 값이 목록·상세의 최신값이다. 다음에 새로 그려진 board는 도전 뒤에 읽은 것이라 그대로 믿는다.
  const [local, setLocal] = useState<{ best: number; attemptsLeft: number; myRank: number | null } | null>(null);
  const [seenBoard, setSeenBoard] = useState(board);
  if (seenBoard !== board) {
    setSeenBoard(board);
    // 새 board가 도전 결과를 이미 담고 있을 때만 버린다 — 도전 직전에 시작된 장착의 재렌더가 늦게 오면 최고 층이 뒤로 가지 않게(재검수 #3).
    if (!local || board.best >= local.best) setLocal(null);
  }
  const best = Math.max(board.best, local?.best ?? 0);
  const me = useMemo(() => ({ nickname: board.nickname, guild: board.guild }), [board.nickname, board.guild]);
  const attemptsLeft = local ? Math.min(board.attemptsLeft, local.attemptsLeft) : board.attemptsLeft;
  const myRank = local?.myRank ?? board.myRank;
  const next = Math.min(TOWER_FLOORS, best + 1);
  const topped = best >= TOWER_FLOORS;
  const [picked, setPicked] = useState<number | null>(null);
  // 층 상세는 주소(?v=d)로 — 휴대폰 뒤로 가기가 홈이 아니라 목록으로 돌아오게.
  const sp = useSearchParams();
  const view: 'list' | 'detail' = sp.get('v') === 'd' ? 'detail' : 'list';
  // 토벌(돌파한 층 재도전) — 층 화면 주소에 층 번호(?v=d&f=N)가 있고 이미 돌파한 층이면 그 층을 토벌한다. 없으면 오르기(다음 층).
  const fParam = Number(sp.get('f'));
  const huntFloor = view === 'detail' && Number.isInteger(fParam) && fParam >= 1 && fParam <= best ? fParam : null;
  const target = huntFloor ?? next;
  // 주소만 바꾼다(history API) — router.push는 같은 페이지를 서버에서 다시 그려(탑 데이터+레이아웃 쿼리) 전환마다 왕복이 생겼다.
  // Next가 history.pushState를 useSearchParams와 맞춰 주어 휴대폰 뒤로 가기도 그대로 목록으로 돌아온다.
  const setView = (v: 'list' | 'detail', huntAt?: number) =>
    window.history.pushState(null, '', v === 'detail' ? (huntAt ? `/tower?v=d&f=${huntAt}` : '/tower?v=d') : '/tower');
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
  const { showError, showHeaderToast } = useResourceToast();
  const { optimisticAdjust, setBase } = useDiamondActions();
  // 돌파 보상 — 전투에서 주지 않고 목록에서 받는다(층별·모두 받기). 누르는 즉시 받은 것으로 보이고, 실패하면 되돌린다.
  const [claimedLocal, setClaimedLocal] = useState<ReadonlySet<number>>(new Set());
  const [claiming, setClaiming] = useState(false);
  // 돌파 직후(서버 재렌더 전)에도 방금 돌파한 층이 받을 보상으로 보이게 — best까지 board.unclaimed에 없는 층을 더한다.
  const unclaimed = useMemo(() => {
    const out = new Set(board.unclaimed);
    for (let f = board.best + 1; f <= best; f++) out.add(f);
    for (const f of claimedLocal) out.delete(f);
    return out;
  }, [board.unclaimed, board.best, best, claimedLocal]);
  const claim = async (floor: number | null) => {
    if (claiming) return;
    const target = floor == null ? [...unclaimed] : unclaimed.has(floor) ? [floor] : [];
    if (!target.length) return;
    setClaiming(true);
    setClaimedLocal((s) => new Set([...s, ...target]));
    // 헤더 다이아도 누르는 즉시 올린다(서버 재렌더가 실제 잔액으로 맞춘다). 실패하면 되돌린다.
    const dia = target.reduce((a, f) => a + towerReward(f).diamond, 0);
    optimisticAdjust(BigInt(dia));
    const r = await towerClaimAction(floor).catch(() => null);
    setClaiming(false);
    // 화면을 다시 그리지 않으므로 헤더 다이아는 서버 잔액으로 맞춘다(낙관 값이 어긋났어도 여기서 정확해진다).
    if (r?.status === 'success') {
      if (r.diamondBalance != null) setBase(BigInt(r.diamondBalance));
      // 서버 기준 받을 층이 없었으면(이미 받음 등) 먼저 올린 다이아를 되돌린다(재검수 #4).
      else optimisticAdjust(BigInt(-dia));
    }
    if (!r || r.status !== 'success') {
      optimisticAdjust(BigInt(-dia));
      setClaimedLocal((s) => new Set([...s].filter((f) => !target.includes(f))));
      showError(r?.message ?? '보상을 받지 못했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const rewards: { icon: string; amount: number }[] = [];
    if (r.diamond > 0) rewards.push({ icon: '💎', amount: r.diamond });
    if (r.boxes > 0) rewards.push({ icon: '📦', amount: r.boxes });
    if (rewards.length) showHeaderToast({ title: r.floors.length === 1 ? `${r.floors[0]}층 돌파 보상` : `돌파 보상 ${r.floors.length}개 층`, rewards });
  };
  const pendingSum = [...unclaimed].reduce((a, f) => {
    const r = towerReward(f);
    return { diamond: a.diamond + r.diamond, boxes: a.boxes + r.boxes };
  }, { diamond: 0, boxes: 0 });
  // 낙관적 장착(부위 → 장착할 장비) — 누르는 즉시 화면에 반영하고, 실패하면 되돌린다. 성공하면 액션의 재렌더가 같은 상태를 준다.
  // useOptimistic — 액션과 그 재렌더가 한 트랜잭션으로 끝날 때까지 유지돼, 종전처럼 응답 직후 옛 장착이 잠깐 돌아오는 깜빡임이 없다.
  const [optEquip, addOptEquip] = useOptimistic<Partial<Record<TowerSlot, string>>, Partial<Record<TowerSlot, string>>>({}, (o, add) => ({ ...o, ...add }));
  const items = useMemo(
    () => board.items.map((i) => (optEquip[i.slot] ? { ...i, equipped: i.ueid === optEquip[i.slot] } : i)),
    [board.items, optEquip],
  );

  const pools = useMemo(() => new Map(Object.entries(board.pools).map(([k, v]) => [Number(k), v as SlotKeys])), [board.pools]);
  // 요구 장비는 층마다(pools: 층 → 부위별, 특별층은 부위마다 1개).
  const ruleOf = (f: number) => floorRule(f, pools.get(f) ?? null);

  const equipped: EquippedPiece[] = items.filter((i) => i.equipped).map((i) => ({ slot: i.slot, key: i.key, cp: i.cp }));
  const rule = ruleOf(target);

  // 아바타 — 지금 장착 그대로 이 아바타를 골랐을 때의 배율·탑 전투력(3차 피드백 6: 최대치 표시 없음), 탑 전투력 높은 순.
  // 처음엔 마지막에 고른 아바타, 없으면 맨 위.
  const avatarRows = useMemo(() => {
    return board.avatars
      .map((a) => {
        const keys = new Set(a.keys);
        return { ...a, now: towerCp(equipped, rule, keys) };
      })
      .sort((x, y) => y.now.total - x.now.total || y.now.doubledCount - x.now.doubledCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, items, target]);
  const [avatarId, setAvatarId] = useState<string | null>(() => {
    const last = board.lastProfileId && board.avatars.some((a) => a.id === board.lastProfileId) ? board.lastProfileId : null;
    return last ?? avatarRows[0]?.id ?? null;
  });
  const avatar = avatarRows.find((a) => a.id === avatarId) ?? avatarRows[0] ?? null;
  const cpNow = avatar?.now ?? towerCp(equipped, rule, new Set());

  // 자동 장착 — 그 층 요구 장비 중 부위별 가장 센 장비 + 그 조합이 가장 센 아바타(요구 장비가 층마다 바뀌어 층마다 다시 맞추는 수고를 던다).
  const autoPlan = useMemo(() => {
    let top: { avatarId: string | null; ueids: string[]; total: number } | null = null;
    for (const a of avatarRows.length ? avatarRows : [null]) {
      const keys = new Set(a?.keys ?? []);
      let total = 0;
      const ueids: string[] = [];
      for (const s of TOWER_SLOTS) {
        let pick: { ueid: string; equipped: boolean; sc: number } | null = null;
        for (const it of items) {
          if (it.slot !== s) continue;
          const sc = towerCp([{ slot: s, key: it.key, cp: it.cp }], rule, keys).pieces[0]!.score;
          if (!pick || sc > pick.sc || (sc === pick.sc && it.equipped)) pick = { ueid: it.ueid, equipped: it.equipped, sc };
        }
        if (pick && pick.sc > 0) {
          total += pick.sc;
          if (!pick.equipped) ueids.push(pick.ueid);
        }
      }
      if (!top || total > top.total) top = { avatarId: a?.id ?? null, ueids, total };
    }
    return top;
  }, [avatarRows, items, rule]);
  const autoBetter = !!autoPlan && autoPlan.total > cpNow.total;
  const autoEquip = () => {
    if (!autoPlan || !autoBetter) return;
    if (autoPlan.avatarId) setAvatarId(autoPlan.avatarId);
    if (autoPlan.ueids.length) doEquip(autoPlan.ueids);
  };

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
      // 여러 개(자동 장착)도 한 번의 요청 — 성공 응답은 액션이 화면을 새로 그려 주니 실패했을 때만 되돌리고 다시 불러온다(CLAUDE §11.7).
      const r = await towerEquipAction(ueids).catch(() => ({ status: 'error' as const, message: '장착하지 못했어요. 잠시 후 다시 시도해 주세요.' }));
      if (r.status !== 'success') {
        setMsg(r.message);
        router.refresh();
      }
    });
  };

  // 도전 한 번 = 키 하나. 응답을 못 받고 다시 눌러도 같은 키면 서버가 앞선 결과를 돌려준다(도전 이중 차감 방지).
  const challenge = async () => {
    if (busy) return;
    setMsg(null);
    setBusy(true);
    setBattle('pending');
    // 같은 층의 응답 없는 도전은 같은 키로 — 30초를 넘겨 실패로 보였어도 서버가 이미 처리했으면 그 결과를 돌려받아
    // 도전이 두 번 빠지지 않는다(09-30 감사 L2). 응답(성공·거절)을 받으면 다음 도전은 새 키.
    // 키는 (층, 토벌 여부)마다 — 같은 층의 오르기와 토벌이 같은 키를 쓰지 않게.
    const idemFloor = huntFloor != null ? -target : target;
    if (idemRef.current?.floor !== idemFloor) idemRef.current = { floor: idemFloor, key: crypto.randomUUID() };
    const key = idemRef.current.key;
    // 판정 대기는 30초까지 — 헤더 없는 전투 화면에 '준비 중'으로 갇히지 않게 실패로 돌린다.
    const r = await Promise.race([
      towerChallengeAction(target, avatar?.id ?? null, key, board.week, huntFloor != null).catch(() => null),
      new Promise<null>((res) => setTimeout(() => res(null), 30_000)),
    ]);
    setBusy(false);
    if (r) idemRef.current = null;
    if (!r || r.status !== 'success') {
      setBattle(null);
      // 응답이 없었거나 '지금 층이 아님'이면 화면 값이 서버와 어긋난 것 — 최고 층·남은 도전을 서버와 다시 맞춘다.
      if (!r || r.code === 'NOT_NEXT_FLOOR' || r.code === 'NOT_CLEARED') router.refresh();
      return setMsg(r?.message ?? '도전하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    setLocal({ best: r.result.best, attemptsLeft: r.result.attemptsLeft, myRank: r.result.myRank ?? local?.myRank ?? null });
    // 토벌 보상은 서버가 바로 지급 — 헤더 다이아를 서버 잔액으로 맞춘다(화면을 다시 그리지 않는다).
    if (r.result.hunt && r.result.diamondBalance != null) setBase(BigInt(r.result.diamondBalance));
    setBattle(r.result);
  };

  if (battle) {
    const res = battle === 'pending' ? null : battle;
    return (
      <TowerBattle
        key={res ? res.battleId : 'pending'}
        floor={res ? res.floor : target}
        hunt={huntFloor != null}
        me={me}
        result={res}
        myCp={cpNow.total}
        attemptsBefore={attemptsLeft}
        avatarSouth={avatar?.south ?? null}
        retrying={busy}
        onList={() => {
          setBattle(null);
          setPicked(null);
          window.history.replaceState(null, '', '/tower');
        }}
        onNext={() => setBattle(null)}
        onRetry={challenge}
      />
    );
  }

  // 팝업(목록·상세 공용) — 착용 가능 장비는 sheetFloor 기준(상세=도전할 층, 목록=고른 층).
  const pf = sheetFloor ?? target;
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
                  {towerSection(pf) === 1 ? '' : <span suppressHydrationWarning> · {renewText(board.week)}</span>} · 전투력 <b className="text-amber-300">{n(cpNow.total)}</b>
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
              subtitle="지금 장착한 장비로 싸울 때 · 전투력 높은 순"
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
                        <b className="block text-[12px]">{a.isDefault ? '기본 아바타' : '나만의 아바타'}</b>
                        <span className="text-[10px] text-zinc-400">{sel ? '선택 중' : '누르면 선택'}</span>
                      </span>
                      {/* 배율(×2.00) 대신 맞는 장비 수 — 배율은 장비마다 붙는 것이라 아바타 쪽 숫자가 전체에 곱해지는 것처럼 읽혔다. */}
                      <span className="flex-none text-right leading-tight">
                        <b className={`block text-[13px] tabular-nums ${a.now.doubledCount > 0 ? 'text-sky-300' : 'text-zinc-400'}`}>맞는 장비 {a.now.doubledCount}/3</b>
                        <span className="text-[10.5px] tabular-nums text-zinc-300">전투력 <b className="text-amber-300">{n(a.now.total)}</b></span>
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

  // ── 층 화면(상세) ─────────────────────────────────────────
  // 전투와 같은 무대 — 도전하면 이 자리에서 그대로 싸운다(장비 자리에 턴 기록).
  if (view === 'detail' && (huntFloor != null || !topped)) {
    const info = towerFloorInfo(target);
    const sec = towerSection(target);
    // 1구간(1~10층)은 모든 장비라 주간 갱신이 없다.
    const noRenew = sec === 1;
    const counts = poolCounts(board, items, rule);
    return (
      <main className={FLOOR_MAIN}>
        <TowerStage floor={target} hunt={huntFloor != null} info={info} me={me} meImg={avatar?.south ?? null} meCp={cpNow.total} left={attemptsLeft} narration={info.line} />

        {/* 무대 아래 — 텍스트 RPG식 줄 구성(전투에선 이 자리에 기록이 쌓인다). */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
          {/* 내 장비 — 부위마다 한 줄: 그림 · 이름·강화 · 배율 설명 · 이 층 기준 전투력(×2 금색, ×0 제외). */}
          <div className="mt-2.5 mb-1 flex items-baseline justify-between">
            <span className="text-[11px] font-bold text-zinc-500">내 장비</span>
            <button type="button" onClick={() => openPool(target)} className="text-[11px] text-zinc-400">
              착용 가능 장비 <b className="text-zinc-200">{counts.owned}/{counts.total}</b>
              {noRenew ? null : <span suppressHydrationWarning> · {renewText(board.week)}</span>}
              <span className="font-bold text-amber-300"> 보기 ›</span>
            </button>
          </div>
          {TOWER_SLOTS.map((s) => {
            const p = cpNow.pieces.find((x) => x.slot === s);
            const it = p ? items.find((i) => i.equipped && i.slot === s) : undefined;
            return (
              // 적용 상태를 한눈에 — ×2(아바타와 같은 요구 장비) 금색 줄·칩, ×1(요구 장비) 초록 칩, ×0(이 층 요구 장비 아님) 흐리게·빨간 칩.
              <button
                key={s}
                type="button"
                onClick={() => openPool(target, s)}
                className={`-mx-4 flex w-[calc(100%+2rem)] items-center gap-2.5 border-l-2 py-1.5 pr-4 pl-3.5 text-left ${FLOOR_ROW} ${
                  p?.mult === 2 ? 'border-l-amber-400 bg-amber-500/10' : p?.mult === 1 ? 'border-l-emerald-500/70' : 'border-l-red-500/60 bg-red-950/15'
                }`}
              >
                <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-md border ${p?.mult === 2 ? 'border-amber-400 bg-amber-950/60 shadow-[0_0_8px_rgba(251,191,36,.35)]' : p?.mult === 0 ? 'border-zinc-800 bg-zinc-900 opacity-40 grayscale' : 'border-emerald-700/70 bg-zinc-900'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p ? <img src={itemSrc(s, p.key)} alt="" className="h-7 w-7" style={PIX} /> : null}
                </span>
                <span className={`min-w-0 flex-1 leading-tight ${p?.mult === 0 || !p ? 'opacity-60' : ''}`}>
                  <span className="block truncate text-[12px] text-zinc-100">
                    {p ? (board.catalog[p.key]?.name ?? p.key) : <span className="text-zinc-500">{SLOT_KO[s]} 없음</span>}
                    {it ? <span className="text-zinc-500"> +{it.level}{it.transcend ? ` · 초월 ${it.transcend}` : ''}</span> : null}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[10.5px] text-zinc-500">
                    <span
                      className={`rounded px-1 text-[9.5px] leading-[1.5] font-black ${
                        p?.mult === 2 ? 'bg-amber-400 text-amber-950' : p?.mult === 1 ? 'bg-emerald-600/80 text-emerald-50' : 'border border-red-500/60 text-red-300'
                      }`}
                    >
                      {!p ? '없음' : p.mult === 2 ? '×2 아바타' : p.mult === 1 ? '×1 적용' : '×0 미적용'}
                    </span>
                    {SLOT_KO[s]}
                    {p?.mult === 0 ? ' · 이 층 요구 장비 아님' : null}
                  </span>
                </span>
                <b className={`flex-none tabular-nums ${p?.mult === 2 ? 'text-[13px] text-amber-300' : p?.mult === 0 || !p ? 'text-[12px] text-red-300/80' : 'text-[12.5px] text-zinc-100'}`}>
                  {p ? (p.mult === 0 ? '제외' : n(p.score)) : '-'}
                </b>
              </button>
            );
          })}
          {/* 아바타 — 그림은 위 무대에. 맞는 장비 수와 변경만. */}
          <button type="button" onClick={() => setSheet('avatar')} className={`flex w-full items-center py-2 text-left text-[12px] ${FLOOR_ROW}`}>
            <span className="flex-1 text-zinc-400">
              아바타 · 맞는 장비 <b className={cpNow.doubledCount > 0 ? 'text-sky-300' : 'text-zinc-300'}>{cpNow.doubledCount}/3</b>
            </span>
            <span className="font-bold text-amber-300">변경 ›</span>
          </button>
          {/* 합 — 장비별 이 층 기준 전투력을 그대로 더한 값 = 이 층에서 싸우는 전투력. */}
          <div className="flex items-baseline justify-between py-2 text-[12px] tabular-nums">
            <span className="min-w-0 truncate text-zinc-500">
              {TOWER_SLOTS.map((sl) => cpNow.pieces.find((p) => p.slot === sl)).filter((p) => !!p && p.mult > 0).map((p, i) => (
                <span key={p!.slot}>
                  {i ? ' + ' : ''}
                  <span className={p!.mult === 2 ? 'text-amber-300/90' : ''}>{n(p!.score)}</span>
                </span>
              ))}
              {cpNow.pieces.some((p) => p.mult > 0) ? ' =' : '요구 장비 없음'}
            </span>
            <span className="flex-none pl-2 text-zinc-400">전투력 <b className="text-[14px] text-amber-300">{n(cpNow.total)}</b></span>
          </div>
          {msg ? <p className="py-1 text-center text-[11.5px] text-red-300">{msg}</p> : null}
        </div>

        <div className="flex-none px-3 pt-2 pb-3">
          <ActionBar>
            <SecondaryButton disabled={!autoBetter || busy} onClick={autoEquip}>{autoBetter ? '자동 장착' : '최적 장착됨'}</SecondaryButton>
            <PrimaryButton disabled={busy || attemptsLeft <= 0 || cpNow.total <= 0} onClick={challenge}>
              {attemptsLeft <= 0 ? '오늘 도전 끝' : cpNow.total <= 0 ? '요구 장비 없음' : huntFloor != null ? '토벌' : '도전'}
            </PrimaryButton>
          </ActionBar>
        </div>

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
      className="flex h-[calc(100%-var(--chat-dock-h,0px))] flex-col overflow-hidden bg-zinc-950 bg-cover bg-top text-zinc-100"
      style={{ backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,.1), rgba(0,0,0,.35) 45%, rgb(9,9,11) 92%), url(${assetUrl('/sprites/tower/bg/list.png')})`, ...PIX }}
    >
      {/* 헤더는 스크롤 영역 밖에 고정(바탕 투명) — 내용만 그 아래에서 스크롤된다. */}
      <div className="flex-none px-3 pt-1.5 pb-1">
        <BackTitle title="무한의 탑" right={<span className="rounded-md bg-black/55 px-2 py-0.5 text-[11px] text-zinc-100"><Attempts left={attemptsLeft} /></span>} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-3">

        {/* 위쪽 정보 영역 — 기본은 최고 도달, 층을 누르면 그 층 카드 */}
        <div className="relative mt-2 flex h-[200px] flex-col justify-end">
          {heroInfo && hero ? (
            <div className="rounded-2xl border border-white/10 bg-black/55 p-3 backdrop-blur-[2px]">
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  {/* 층 번호만(상태·특별층 글자는 칸 색·✦로 이미 보인다). */}
                  <div className="text-[10.5px] font-black text-amber-300">
                    {towerIsSpecial(hero) ? '✦ ' : ''}{hero}층
                  </div>
                  <b className="block text-[18px] leading-tight">{heroInfo.name}</b>
                  {/* 줄마다 높이 고정 — 층마다 요구 장비가 글자/아이콘으로 바뀌어도 카드가 흔들리지 않게. */}
                  <div className="mt-1 text-[10.5px]">
                    <div className="flex h-6 items-center"><span className="w-[52px] flex-none text-zinc-400">전투력</span><b className="tabular-nums text-red-300">{n(towerRequirement(hero))}</b><TowerSkillTags floor={hero} className="ml-1.5 h-5 text-[10px]" /></div>
                    <div className="flex h-6 items-center">
                      <span className="w-[52px] flex-none text-zinc-400">돌파</span>
                      <span className="min-w-0 flex-1 truncate">{rewardText(hero)}</span>
                      {unclaimed.has(hero) ? (
                        <button type="button" onClick={() => claim(hero)} disabled={claiming} className="ml-1 h-5 flex-none rounded-md bg-amber-500 px-2 text-[10px] font-black leading-none text-amber-950 disabled:opacity-50">받기</button>
                      ) : hero <= best ? (
                        <span className="ml-1 flex-none text-[10px] font-bold text-zinc-500">받음</span>
                      ) : null}
                    </div>
                    <div className="flex h-6 items-center">
                      <span className="w-[52px] flex-none text-zinc-400">요구 장비</span>
                      <span className="min-w-0 flex-1 truncate">{towerSection(hero) === 1 ? '모든 장비' : towerIsSpecial(hero) ? (
                      <span className="inline-flex gap-0.5">
                        {TOWER_SLOTS.map((s) => {
                          const k = pools.get(hero)?.[s]?.[0];
                          // eslint-disable-next-line @next/next/no-img-element
                          return k ? <img key={s} src={itemSrc(s, k)} alt="" title={board.catalog[k]?.name} className="h-5 w-5 rounded border border-amber-700 bg-zinc-900" style={PIX} /> : null;
                        })}
                      </span>
                    ) : '부위별 10개'}</span>
                      {/* 줄 높이 안에 들어가는 작은 버튼 — 층을 바꿔도 카드가 흔들리지 않게(2차 피드백 5). */}
                      <button type="button" onClick={() => openPool(hero)} className="ml-1 h-5 flex-none rounded-md border border-amber-600/60 px-1.5 text-[10px] font-bold leading-none text-amber-200">보기</button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-none flex-col items-end justify-end gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(`/sprites/tower/mon/${heroInfo.sprite}.png`)} alt="" className={`h-[88px] w-auto ${hero > next ? 'opacity-35 brightness-0 invert' : 'drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]'}`} style={PIX} />
                  {/* 토벌 — 돌파한 층만. 이기면 💎(오르기와 같은 하루 도전을 쓰고, 이겨도 1회). */}
                  {hero <= best ? (
                    <button type="button" onClick={() => setView('detail', hero)} className="h-6 rounded-md bg-rose-700 px-2 text-[10.5px] font-black leading-none text-rose-50">
                      토벌 {huntText(hero)}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="pb-2 pl-1 drop-shadow-[0_2px_3px_rgba(0,0,0,.9)]">
              <div className="text-[11px] text-zinc-200">최고 도달</div>
              <div className="text-[32px] font-black leading-none">{best}층</div>
              <div className="mt-1 text-[11px] text-amber-300">{myRank ? `서버 ${myRank}위` : '아직 기록 없음'}</div>
            </div>
          )}
        </div>

        {/* 받을 돌파 보상 — 모두 받기(층별은 층을 눌러 위 카드에서). */}
        {unclaimed.size > 0 ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-600/50 bg-zinc-950/85 px-3 py-2 backdrop-blur-[2px]">
            <span className="min-w-0 flex-1 leading-tight">
              <b className="block text-[12px]">받을 돌파 보상 <span className="tabular-nums text-amber-300">{unclaimed.size}</span>개 층</b>
              <span className="text-[10.5px] tabular-nums text-zinc-300">💎 {n(pendingSum.diamond)}{pendingSum.boxes ? ` · 📦 ${n(pendingSum.boxes)}` : ''}</span>
            </span>
            <button type="button" onClick={() => claim(null)} disabled={claiming} className="h-8 flex-none rounded-lg bg-amber-500 px-3 text-[12px] font-black text-amber-950 disabled:opacity-50">
              {claiming ? '받는 중…' : '모두 받기'}
            </button>
          </div>
        ) : null}

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
                  <span className={`relative flex items-center gap-1.5 text-[10.5px] font-bold ${done ? 'text-emerald-300' : locked ? 'text-zinc-400' : 'tabular-nums text-amber-200'}`}>
                    {Array.from({ length: TOWER_SECTION }, (_, j) => lo + j).some((f) => unclaimed.has(f)) ? <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-label="받을 보상 있음" /> : null}
                    {done ? '완료' : locked ? '잠김' : `${cleared} / ${TOWER_SECTION}`}
                  </span>
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
                            {unclaimed.has(f) ? <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,.9)]" aria-label="받을 보상 있음" /> : null}
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

        {/* 아래 버튼 — 스크롤해도 바닥에 붙고, 위로 어둡게 번지는 띠로 마지막 카드와 간격을 둔다. */}
        <div className="sticky bottom-0 z-10 -mx-3 mt-auto bg-gradient-to-t from-zinc-950 from-60% to-transparent px-3 pt-6">
          {!topped ? (
            <button type="button" onClick={() => setView('detail')} className="w-full rounded-xl bg-gradient-to-b from-amber-500 to-amber-600 py-3 text-[14px] font-black text-amber-950 shadow-lg">
              {next}층 도전
            </button>
          ) : (
            // 꼭대기(지금 열린 가장 높은 층)까지 오른 유저 — 도전할 층이 없으니 안내 한 줄과 탑 랭킹으로.
            <>
              <p className="mb-2 text-center text-[12px] text-zinc-300">지금 열린 가장 높은 층까지 올랐어요.</p>
              <button type="button" onClick={() => router.push('/leaderboard?tab=tower')} className="w-full rounded-xl bg-gradient-to-b from-amber-500 to-amber-600 py-3 text-[14px] font-black text-amber-950 shadow-lg">
                무한의 탑 랭킹 보기
              </button>
            </>
          )}
        </div>
      </div>
      {popups}
    </main>
  );
}

type PoolItem = TowerBoard['items'][number];

/** 그 부위의 착용 가능 장비 키 — 입문(allowed=null)은 보유 장비 전부. */
function poolKeys(board: TowerBoard, items: PoolItem[], slot: TowerSlot, rule: ReturnType<typeof floorRule>): string[] {
  return rule.allowed === null
    ? [...new Set(items.filter((i) => i.slot === slot).map((i) => i.key))]
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
