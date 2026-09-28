'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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

function Dots({ left }: { left: number }) {
  return (
    <span className="tracking-[2px]">
      {Array.from({ length: TOWER_DAILY_ATTEMPTS }, (_, i) => (
        <span key={i} className={i < left ? 'text-amber-400' : 'text-zinc-700'}>●</span>
      ))}
    </span>
  );
}

function rewardText(floor: number) {
  const r = towerReward(floor);
  return `💎 ${n(r.diamond)}${r.boxes ? ` · 📦 ${r.boxes}` : ''}`;
}

export function TowerClient({ board }: { board: TowerBoard }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = Math.min(TOWER_FLOORS, board.best + 1);
  const topped = board.best >= TOWER_FLOORS;
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
  const [equipTab, setEquipTab] = useState<TowerSlot>('weapon');
  const [battle, setBattle] = useState<TowerChallengeResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const pools = useMemo(() => new Map(Object.entries(board.pools).map(([k, v]) => [Number(k), v as SlotKeys])), [board.pools]);
  const specials = useMemo(() => new Map(Object.entries(board.specials).map(([k, v]) => [Number(k), v as SlotKeys])), [board.specials]);
  const ruleOf = (f: number) => floorRule(f, pools.get(towerSection(f)) ?? null, specials.get(towerSection(f)) ?? null);

  const equipped: EquippedPiece[] = board.items.filter((i) => i.equipped).map((i) => ({ slot: i.slot, key: i.key, cp: i.cp }));
  const rule = ruleOf(next);

  // 아바타 — 목록은 배율 높은 순. 처음엔 마지막에 고른 아바타, 없으면 배율 최고.
  const avatarRows = useMemo(() => {
    const owned = new Map(board.items.map((i) => [i.key, { slot: i.slot, cp: i.cp }]));
    return board.avatars
      .map((a) => {
        const keys = new Set(a.keys);
        const lo = bestLoadout(owned, rule, keys);
        const loPieces = TOWER_SLOTS.flatMap((s) => {
          const it = lo[s] ? board.items.find((i) => i.key === lo[s]) : null;
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
  }, [board, next]);
  const [avatarId, setAvatarId] = useState<string | null>(() => {
    const last = board.lastProfileId && board.avatars.some((a) => a.id === board.lastProfileId) ? board.lastProfileId : null;
    return last ?? avatarRows[0]?.id ?? null;
  });
  const avatar = avatarRows.find((a) => a.id === avatarId) ?? avatarRows[0] ?? null;
  const cpNow = avatar?.now ?? towerCp(equipped, rule, new Set());

  const doEquip = (ueids: string[]) =>
    start(async () => {
      // 성공 응답은 액션이 화면을 새로 그려 주니 실패했을 때만 다시 불러온다(CLAUDE §11.7).
      for (const id of ueids) {
        const r = await towerEquipAction(id);
        if (r.status !== 'success') {
          setMsg(r.message);
          router.refresh();
          break;
        }
      }
    });

  // 도전 한 번 = 키 하나. 응답을 못 받고 다시 눌러도 같은 키면 서버가 앞선 결과를 돌려준다(도전 이중 차감 방지).
  const challenge = () =>
    start(async () => {
      setMsg(null);
      const r = await towerChallengeAction(next, avatar?.id ?? null, crypto.randomUUID(), board.week);
      if (r.status !== 'success') {
        setBattle(null);
        return setMsg(r.message);
      }
      setBattle(r.result);
    });

  if (battle) {
    const info = towerFloorInfo(battle.floor);
    return (
      <TowerBattle
        key={battle.battleId}
        result={battle}
        info={info}
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
          setSheet('equip');
        }}
      />
    );
  }

  // ── 층 상세 ─────────────────────────────────────────────
  if (view === 'detail' && !topped) {
    const info = towerFloorInfo(next);
    const sec = towerSection(next);
    const reqText = sec === 1 && !towerIsSpecial(next) ? '모든 장비(입문)' : towerIsSpecial(next) ? '구간 요구 장비 · 지정 장비만 ×2' : `${(sec - 1) * TOWER_SECTION + 1}~${sec * TOWER_SECTION}층 · 부위별 10개`;
    return (
      <main className="flex-1 overflow-y-auto bg-zinc-950 px-3 pt-2 pb-6 text-zinc-100">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => router.back()} className="text-[14px] font-extrabold">‹ {next}층</button>
          <span className="text-[11px] text-zinc-400">오늘 도전 <Dots left={board.attemptsLeft} /></span>
        </div>
        <div className="relative h-[180px] overflow-hidden rounded-xl border border-zinc-800 bg-cover bg-center" style={{ backgroundImage: `url(${assetUrl(`/sprites/tower/scene/${info.scene}.png`)})`, ...PIX }}>
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/80 to-transparent" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(`/sprites/tower/mon/${info.sprite}.png`)} alt="" className="absolute bottom-2 left-1/2 h-[130px] w-auto -translate-x-1/2 drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]" style={PIX} />
          {towerIsSpecial(next) ? <span className="absolute left-2 top-2 rounded bg-amber-500/90 px-1.5 text-[10px] font-black text-black">✦ 특별층</span> : null}
        </div>
        <h1 className="mt-3 text-[18px] font-black">{info.name}</h1>
        <p className="mt-0.5 text-[12px] text-zinc-400">{info.line}</p>

        <div className="mt-3 divide-y divide-zinc-800 border-y border-zinc-800 text-[12px]">
          <button type="button" onClick={() => setSheet('equip')} className="flex w-full items-center gap-2 py-2.5 text-left">
            <span className="w-[88px] flex-none text-zinc-400">요구 장비</span>
            <span className="flex flex-1 gap-1">
              {TOWER_SLOTS.map((s) => {
                const p = cpNow.pieces.find((x) => x.slot === s);
                return (
                  <span key={s} className={`relative flex h-7 w-7 items-center justify-center rounded-md border ${p?.mult === 2 ? 'border-amber-500 bg-amber-950/60' : p?.mult === 0 ? 'border-red-900 bg-zinc-900 opacity-50' : 'border-zinc-700 bg-zinc-900'}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p ? <img src={itemSrc(s, p.key)} alt="" className="h-6 w-6" style={PIX} /> : <span className="text-[9px] text-zinc-600">{SLOT_KO[s]}</span>}
                  </span>
                );
              })}
              <span className="ml-1 self-center text-[10px] text-zinc-500">{reqText}</span>
            </span>
            <span className="text-[11px] font-bold text-zinc-200">조회 · 장착 ›</span>
          </button>
          <button type="button" onClick={() => setSheet('avatar')} className="flex w-full items-center gap-2 py-2.5 text-left">
            <span className="w-[88px] flex-none text-zinc-400">선택 아바타</span>
            <span className="flex flex-1 items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatar?.south ? <img src={avatar.south} alt="" className="h-8 w-auto" style={PIX} /> : null}
              <b className="text-sky-300">×{(avatar?.mult ?? 1).toFixed(2)}</b>
            </span>
            <span className="text-[11px] font-bold text-zinc-200">변경 ›</span>
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-amber-600/60 bg-amber-950/40 px-3 py-2">
            <div className="text-[10px] text-zinc-400">탑 전투력</div>
            <div className="text-[20px] font-black tabular-nums text-amber-300">{n(cpNow.total)}</div>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
            <div className="text-[10px] text-zinc-400">내 전투력</div>
            <div className="text-[20px] font-black tabular-nums">{n(board.myCombatPower)}</div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between border-b border-zinc-800 py-2 text-[12px]">
          <span className="text-zinc-400">첫 돌파 보상</span>
          <b>{rewardText(next)}</b>
        </div>
        {msg ? <p className="mt-2 text-center text-[11.5px] text-red-300">{msg}</p> : null}
        <button type="button" disabled={pending || board.attemptsLeft <= 0 || cpNow.total <= 0} onClick={challenge} className="mt-3 w-full rounded-xl bg-gradient-to-b from-amber-500 to-amber-600 py-3 text-[14px] font-black text-amber-950 disabled:opacity-50">
          {board.attemptsLeft <= 0 ? '오늘 도전을 모두 썼어요' : cpNow.total <= 0 ? '요구 장비를 먼저 장착해 주세요' : pending ? '도전 중…' : '도전'}
        </button>

        {sheet === 'equip' ? (
          <ModalShell onClose={() => setSheet(null)} label="요구 장비" align="bottom" className="w-full max-w-[390px]">
            <div className="max-h-[78vh] w-full overflow-y-auto rounded-t-2xl bg-zinc-900 p-3 text-zinc-100">
              <div className="flex items-baseline justify-between">
                <b className="text-[14px]">요구 장비</b>
                <span className="text-[10px] text-zinc-500">{reqText}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1">
                {TOWER_SLOTS.map((s) => (
                  <button key={s} type="button" onClick={() => setEquipTab(s)} className={`rounded-lg border py-1.5 text-[11.5px] font-extrabold ${equipTab === s ? 'border-amber-500/70 bg-amber-950/50 text-amber-200' : 'border-zinc-800 bg-zinc-950 text-zinc-400'}`}>{SLOT_KO[s]}</button>
                ))}
              </div>
              <EquipList board={board} slot={equipTab} rule={rule} avatarKeys={new Set(avatar?.keys ?? [])} pending={pending} onEquip={(id) => doEquip([id])} />
              <p className="mt-2 text-[10px] text-zinc-500">누르면 장착 · ×2는 고른 아바타를 만들 때도 쓴 장비</p>
            </div>
          </ModalShell>
        ) : null}

        {sheet === 'avatar' ? (
          <ModalShell onClose={() => setSheet(null)} label="선택 아바타" align="bottom" className="w-full max-w-[390px]">
            <div className="max-h-[78vh] w-full overflow-y-auto rounded-t-2xl bg-zinc-900 p-3 text-zinc-100">
              <div className="flex items-baseline justify-between">
                <b className="text-[14px]">선택 아바타</b>
                <span className="text-[10px] text-zinc-500">맞췄을 때 탑 전투력 높은 순</span>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
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
                          disabled={pending}
                          onClick={() => {
                            const ids = TOWER_SLOTS.flatMap((s) => {
                              const key = a.loadout[s];
                              const it = key ? board.items.find((i) => i.key === key && !i.equipped) : null;
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
              <p className="mt-2 text-[10px] text-zinc-500">아바타는 지금 장착한 장비로 만들어져요. 먼저 요구 장비를 장착하면 그 장비가 ×2가 되는 아바타가 됩니다.</p>
            </div>
          </ModalShell>
        ) : null}
      </main>
    );
  }

  // ── 층 목록 ─────────────────────────────────────────────
  const hero = picked ?? null;
  const heroInfo = hero ? towerFloorInfo(hero) : null;
  const sections = Math.ceil(TOWER_FLOORS / TOWER_SECTION);
  return (
    <main className="relative flex-1 overflow-y-auto bg-zinc-950 text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[760px] bg-cover bg-top" style={{ backgroundImage: `url(${assetUrl('/sprites/tower/bg/list.png')})`, ...PIX }} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[760px] bg-gradient-to-b from-black/10 via-black/35 to-zinc-950" />
      <div className="relative px-3 pb-6">
        <div className="flex items-center justify-between pt-2">
          <b className="rounded-md bg-black/45 px-2 py-0.5 text-[14px]">무한의 탑</b>
          <span className="rounded-md bg-black/55 px-2 py-0.5 text-[11px] text-zinc-100">오늘 도전 <Dots left={board.attemptsLeft} /></span>
        </div>

        {/* 위쪽 정보 영역 — 기본은 최고 도달, 층을 누르면 그 층 카드 */}
        <div className="relative mt-2 flex h-[200px] flex-col justify-end">
          {heroInfo && hero ? (
            <div className="rounded-2xl border border-white/10 bg-black/55 p-3 backdrop-blur-[2px]">
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] font-black text-amber-300">
                    {towerIsSpecial(hero) ? '✦ ' : ''}{hero}층{towerIsSpecial(hero) ? ' · 특별층' : ''} · {hero <= board.best ? '돌파함' : hero === next ? '도전 가능' : '잠김'}
                  </div>
                  <b className="block text-[18px] leading-tight">{heroInfo.name}</b>
                  <div className="mt-1 space-y-0.5 text-[10.5px]">
                    <div><span className="inline-block w-[52px] text-zinc-400">첫 돌파</span>{rewardText(hero)}</div>
                    <div><span className="inline-block w-[52px] text-zinc-400">요구 장비</span>{towerSection(hero) === 1 && !towerIsSpecial(hero) ? '모든 장비' : towerIsSpecial(hero) ? (
                      <span className="inline-flex gap-0.5 align-middle">
                        {TOWER_SLOTS.map((s) => {
                          const k = specials.get(towerSection(hero))?.[s]?.[0];
                          // eslint-disable-next-line @next/next/no-img-element
                          return k ? <img key={s} src={itemSrc(s, k)} alt="" title={board.catalog[k]?.name} className="h-5 w-5 rounded border border-amber-700 bg-zinc-900" style={PIX} /> : null;
                        })}
                      </span>
                    ) : `${(towerSection(hero) - 1) * 10 + 1}~${towerSection(hero) * 10}층 · 부위별 10개`}</div>
                    <div><span className="inline-block w-[52px] text-zinc-400">이 층 돌파</span>{board.clears[hero] !== undefined ? `서버 ${n(board.clears[hero]!)}명` : '-'}</div>
                  </div>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl(`/sprites/tower/mon/${heroInfo.sprite}.png`)} alt="" className="h-[96px] w-auto self-end drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]" style={PIX} />
              </div>
              {hero === next && !topped ? (
                <button type="button" onClick={() => setView('detail')} className="mt-2 rounded-lg bg-amber-500 px-3 py-1.5 text-[11.5px] font-black text-amber-950">층 상세</button>
              ) : null}
            </div>
          ) : (
            <div className="pb-2 pl-1 drop-shadow-[0_2px_3px_rgba(0,0,0,.9)]">
              <div className="text-[11px] text-zinc-200">최고 도달</div>
              <div className="text-[32px] font-black leading-none">{board.best}층</div>
              <div className="mt-1 text-[11px] text-amber-300">{board.myRank ? `서버 ${board.myRank}위` : '아직 기록 없음'}</div>
            </div>
          )}
        </div>

        {/* 구간 카드 */}
        <div className="mt-3 flex flex-col gap-1.5">
          {Array.from({ length: sections }, (_, i) => sections - i).map((sec) => {
            const lo = (sec - 1) * TOWER_SECTION + 1;
            const hi = sec * TOWER_SECTION;
            const done = board.best >= hi;
            const locked = board.best + 1 < lo;
            const cleared = Math.max(0, Math.min(TOWER_SECTION, board.best - lo + 1));
            const open = openSection === sec;
            if (locked && sec > towerSection(next) + 1) return null; // 다음 구간까지만 보여 준다
            return (
              <div key={sec} className={`rounded-xl border bg-zinc-950/75 backdrop-blur-[2px] ${sec === towerSection(next) ? 'border-amber-600/60' : 'border-zinc-800'} ${done ? 'opacity-80' : ''}`}>
                <button type="button" onClick={() => setOpenSection(open ? 0 : sec)} className="flex w-full items-baseline justify-between px-3 py-2 text-[12px]">
                  <b>{lo} ~ {hi}층</b>
                  <span className={`text-[10.5px] ${done ? 'text-emerald-300' : locked ? 'text-zinc-500' : 'tabular-nums text-zinc-300'}`}>{done ? '완료' : locked ? '잠김' : `${cleared} / ${TOWER_SECTION}`}</span>
                </button>
                {open ? (
                  <div className="px-3 pb-3">
                    {!done && !locked ? (
                      <div className="mb-2 h-1 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-amber-500" style={{ width: `${cleared * 10}%` }} /></div>
                    ) : null}
                    <div className="grid grid-cols-5 gap-1">
                      {Array.from({ length: TOWER_SECTION }, (_, j) => lo + j).map((f) => {
                        const st = f <= board.best ? 'd' : f === next ? 'c' : 'l';
                        return (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setPicked(picked === f ? null : f)}
                            className={`rounded-md py-1.5 text-[11px] font-black tabular-nums ${st === 'd' ? 'bg-emerald-950/80 text-emerald-300' : st === 'c' ? 'bg-amber-500 text-amber-950' : 'bg-zinc-900 text-zinc-600'} ${towerIsSpecial(f) ? 'outline outline-1 outline-amber-600' : ''} ${picked === f ? 'ring-2 ring-white' : ''}`}
                          >
                            {f}
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

        {board.ranking.length ? (
          <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
            <b className="text-[12px]">탑 순위</b>
            <ol className="mt-1.5 space-y-1 text-[11.5px]">
              {board.ranking.slice(0, 5).map((r, i) => (
                <li key={r.userId} className="flex justify-between"><span><b className="mr-2 text-amber-300">{i + 1}</b>{r.nickname}</span><span className="tabular-nums text-zinc-300">{r.floor}층</span></li>
              ))}
            </ol>
            <p className="mt-1.5 text-[9.5px] text-zinc-500">같은 층이면 먼저 도달한 사람이 앞에 섭니다.</p>
          </div>
        ) : null}

        {!topped ? (
          <button type="button" onClick={() => setView('detail')} className="sticky bottom-3 mt-4 w-full rounded-xl bg-gradient-to-b from-amber-500 to-amber-600 py-3 text-[14px] font-black text-amber-950 shadow-lg">
            {next}층 도전
          </button>
        ) : (
          <p className="mt-4 text-center text-[12px] text-zinc-300">지금 열린 가장 높은 층까지 올랐어요.</p>
        )}
      </div>
    </main>
  );
}

function EquipList({ board, slot, rule, avatarKeys, pending, onEquip }: {
  board: TowerBoard;
  slot: TowerSlot;
  rule: ReturnType<typeof floorRule>;
  avatarKeys: ReadonlySet<string>;
  pending: boolean;
  onEquip: (ueid: string) => void;
}) {
  const ownedByKey = new Map(board.items.map((i) => [i.key, i]));
  // 입문 특별층(10층)은 모든 장비 + 지정 장비 — 지정 장비는 없어도 목록에 보여 준다.
  const keys = rule.allowed === null
    ? [...new Set([...board.items.filter((i) => i.slot === slot).map((i) => i.key), ...[...(rule.doubleable ?? [])].filter((k) => board.catalog[k]?.slot === slot)])]
    : [...rule.allowed].filter((k) => board.catalog[k]?.slot === slot);
  const rows = keys
    .map((k) => {
      const it = ownedByKey.get(k) ?? null;
      const s = it ? towerCp([{ slot, key: k, cp: it.cp }], rule, avatarKeys).pieces[0]! : null;
      return { key: k, it, mult: s?.mult ?? 1, score: s?.score ?? 0 };
    })
    .sort((a, b) => Number(!!b.it) - Number(!!a.it) || b.score - a.score);
  return (
    <div className="mt-2 flex flex-col gap-1">
      {rows.map((r) => (
        <button
          key={r.key}
          type="button"
          disabled={!r.it || r.it.equipped || pending}
          onClick={() => r.it && onEquip(r.it.ueid)}
          className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left ${r.it?.equipped ? 'border-amber-500 bg-amber-950/40' : 'border-zinc-800 bg-zinc-950'} ${!r.it ? 'opacity-40' : ''}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={itemSrc(slot, r.key)} alt="" className="h-8 w-8 rounded-md bg-zinc-900" style={PIX} />
          <span className="min-w-0 flex-1 leading-tight">
            <b className="block truncate text-[11.5px]">{board.catalog[r.key]?.name ?? r.key}</b>
            <span className="text-[9.5px] text-zinc-400">{r.it ? `+${r.it.level}${r.it.transcend ? ` · 초월 ${r.it.transcend}` : ''}${r.it.equipped ? ' · 장착 중' : ''}` : '없는 장비'}</span>
          </span>
          {r.it ? <em className={`rounded px-1 text-[9.5px] font-black not-italic ${r.mult === 2 ? 'bg-amber-600 text-amber-950' : 'bg-zinc-800 text-zinc-400'}`}>×{r.mult}</em> : null}
          <span className="w-14 text-right text-[12px] font-black tabular-nums">{r.it ? n(r.score) : ''}</span>
        </button>
      ))}
    </div>
  );
}
