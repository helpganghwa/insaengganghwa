'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import {
  CONQUEST_DEFENDER_BONUS,
  CONQUEST_EXECUTOR_POWER_MULT,
  CONQUEST_BATTLE_KST_HOUR,
  residenceSpeedUpCost,
} from '@/lib/game/guild/balance';

import {
  deployAction,
  cancelDeployAction,
  clearMemberDeploymentAction,
  setExecutorAction,
  clearExecutorAction,
} from '../actions';
import { guildErrMsg } from '../errors-msg';

type Region = 'volcano' | 'temple' | 'swamp' | 'orc' | 'kingdom' | 'angel';
type DeployRole = 'attack' | 'defend';
type ConquestRole = DeployRole;

/** 남은 ms → '5시간 12분' — 팝업 안내용(초는 생략). */
function fmtRemain(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}
type Member = {
  userId: string;
  nickname: string;
  role: 'leader' | 'vice' | 'member';
  combat: number;
  depZoneId: number | null;
  depZoneName: string | null;
  depRole: DeployRole | null;
  execZoneId: number | null;
  execZoneName: string | null;
};
type Zone = {
  id: number;
  name: string;
  region: Region;
  mapX: number;
  mapY: number;
  ownerGuildId: string | null;
  ownerEmblemUrl: string | null;
};

const DEFEND_MULT = 1 + CONQUEST_DEFENDER_BONUS; // 수비 ×1.2
const fmt = (n: number) =>
  new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/**
 * 지도 핀 — 노드 위에 떠 있는 물방울 마커. 왼쪽=내 위치(앰버), 오른쪽=선택(하늘색).
 *  · 둘 다 **항상 마운트**하고 표시만 토글한다 — 붙였다 뗐다 하면 CSS 애니메이션이 재시작해
 *    구역마다 위아래 움직임의 위상이 어긋난다(2026-07-29 제보).
 *  · 애니메이션은 감싼 컨테이너 한 곳에만 걸어 두 핀이 항상 같은 박자로 움직인다.
 */
function MapPins({ home, selected }: { home: boolean; selected: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-full left-1/2 -mb-1 flex -translate-x-1/2 animate-marker-bob gap-[3px]"
      style={{ opacity: home || selected ? 1 : 0 }}
    >
      <Pin show={home} from="#fcd34d" to="#f59e0b" glow="rgba(245,158,11,0.65)" glowHi="rgba(251,191,36,0.95)" />
      <Pin show={selected} from="#7dd3fc" to="#0284c7" glow="rgba(2,132,199,0.65)" glowHi="rgba(56,189,248,0.95)" />
    </span>
  );
}

function Pin({
  show,
  from,
  to,
  glow,
  glowHi,
}: {
  show: boolean;
  from: string;
  to: string;
  glow: string;
  glowHi: string;
}) {
  return (
    // display:none — 언마운트가 아니라 숨김. 남은 핀 하나는 컨테이너가 다시 중앙에 맞춘다.
    <span className="block" style={{ display: show ? 'block' : 'none' }}>
      <span
        className="relative block h-[11px] w-[11px] animate-marker-pin-glow border-[1.5px] border-white"
        style={{
          background: `linear-gradient(135deg, ${from}, ${to})`,
          borderRadius: '50% 50% 50% 0',
          transform: 'rotate(-45deg)',
          ['--pin-glow' as string]: glow,
          ['--pin-glow-hi' as string]: glowHi,
        }}
      >
        <span className="absolute left-1/2 top-1/2 h-[3.5px] w-[3.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </span>
    </span>
  );
}

export function DeployBoard({
  isLeader,
  myUserId,
  residence,
  myGuildId,
  mapSrc,
  attackableZoneIds,
  adjacency,
  members: initialMembers,
  zones,
}: {
  isLeader: boolean;
  myUserId: string;
  /** 내 거주 상태(0139) — 배치는 거주 구역에서만 가능. 이동이 필요하면 배치와 한 번에 처리한다. */
  residence: {
    zoneId: number | null;
    readyAtIso: string | null;
    lock: { kind: 'executor' | 'deploy'; label: '집행관' | '공격' | '수비' } | null;
  } | null;
  myGuildId: string;
  mapSrc: string;
  attackableZoneIds: number[];
  adjacency: { a: number; b: number }[];
  members: Member[];
  zones: Zone[];
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [members, setMembers] = useState(initialMembers);
  // 초기 선택 = 내 거주지 — 배치는 거주 구역에서만 가능하므로 첫 화면이 곧 내 자리다.
  const [selectedId, setSelectedId] = useState<number | null>(residence?.zoneId ?? null);
  const homeZoneId = residence?.zoneId ?? null;
  // 이동 가능 구역 — 거주지와 맞닿은 곳. 거주 미설정이면 어디든 정착 가능.
  const adjacentToHome = useMemo(() => {
    if (homeZoneId == null) return null;
    const set = new Set<number>();
    for (const { a, b } of adjacency) {
      if (a === homeZoneId) set.add(b);
      else if (b === homeZoneId) set.add(a);
    }
    return set;
  }, [adjacency, homeZoneId]);
  const [nowMs, setNowMs] = useState(0);
  const readyAt = residence?.readyAtIso ? Date.parse(residence.readyAtIso) : null;
  const moveRemainMs = readyAt && nowMs ? Math.max(0, readyAt - nowMs) : 0;
  useEffect(() => {
    if (!readyAt) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [readyAt]);
  /** 배치 확인 팝업 — 이동·해제·배치를 한 번에 안내하고 한 번에 실행한다. */
  const [plan, setPlan] = useState<{
    zoneId: number;
    zoneName: string;
    role: ConquestRole;
    /** 거주지 이동이 필요한가(필요하면 이동+배치를 함께 요청). */
    move: boolean;
    /** 이동 쿨타임 보석 비용(0이면 무료). */
    gem: number;
    /** 이번 실행으로 풀리는 기존 역할 설명(없으면 null). */
    release: string | null;
  } | null>(null);
  const [planConfirm, setPlanConfirm] = useState(false);
  const [planLeft, setPlanLeft] = useState(0);
  useEffect(() => {
    if (!planConfirm) return;
    const id = setInterval(() => {
      setPlanLeft((v) => {
        if (v <= 1) {
          setPlanConfirm(false);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [planConfirm]);
  const [pending, start] = useTransition();

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const attackable = useMemo(() => new Set(attackableZoneIds), [attackableZoneIds]);
  const ownedIds = useMemo(
    () => new Set(zones.filter((z) => z.ownerGuildId === myGuildId).map((z) => z.id)),
    [zones, myGuildId],
  );
  const usable = (id: number) => ownedIds.has(id) || attackable.has(id);

  const selected = selectedId != null ? (zoneById.get(selectedId) ?? null) : null;
  const selectedRole: DeployRole | null = selected
    ? selected.ownerGuildId === myGuildId
      ? 'defend'
      : 'attack'
    : null;
  const isDefend = selectedRole === 'defend';

  const attackCount = members.filter((m) => m.depRole === 'attack').length;
  const defendCount = members.filter((m) => m.depRole === 'defend' || m.execZoneId != null).length;
  const idleCount = members.filter((m) => m.depZoneId == null && m.execZoneId == null).length;

  const deployedHere = useMemo(
    () => (selectedId != null ? members.filter((m) => m.depZoneId === selectedId) : []),
    [members, selectedId],
  );
  const execHere = useMemo(
    () => (selectedId != null ? members.filter((m) => m.execZoneId === selectedId) : []),
    [members, selectedId],
  );

  // 선택 구역 총 전투력 — 수비: 일반 ×1.2 + 집행관 ×2 / 공격: ×1.0.
  const totalPower = useMemo(() => {
    if (!selected) return 0;
    if (isDefend) {
      const def = deployedHere.reduce((s, m) => s + m.combat * DEFEND_MULT, 0);
      const exe = execHere.reduce((s, m) => s + m.combat * CONQUEST_EXECUTOR_POWER_MULT, 0);
      return Math.round(def + exe);
    }
    return Math.round(deployedHere.reduce((s, m) => s + m.combat, 0));
  }, [selected, isDefend, deployedHere, execHere]);

  const patch = (userId: string, p: Partial<Member>) =>
    setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, ...p } : m)));

  // 길드원 목록 — 본인을 항상 맨 위로(나머지 순서 유지). 배치는 본인 몫이라 접근성 우선.
  const sortedMembers = useMemo(
    () => [
      ...members.filter((m) => m.userId === myUserId),
      ...members.filter((m) => m.userId !== myUserId),
    ],
    [members, myUserId],
  );

  /**
   * 배치 버튼 — 바로 실행하지 않고 "무슨 일이 일어나는지"를 한 팝업에 모은다.
   * 거주지 이동·기존 배치 해제·새 배치가 각각 다른 화면에 흩어져 있던 것을 한 번에 처리한다.
   */
  const askDeploy = () => {
    if (!selected || !selectedRole) return;
    const me = members.find((x) => x.userId === myUserId);
    if (!me) return;
    const needsMove = selected.id !== homeZoneId;
    if (needsMove && adjacentToHome && !adjacentToHome.has(selected.id)) {
      return showError('맞닿은 구역으로만 이동할 수 있습니다. 한 칸씩 옮겨가세요.');
    }
    const release = me.execZoneId
      ? `${me.execZoneName} 집행관`
      : me.depZoneId
        ? `${me.depZoneName} ${me.depRole === 'attack' ? '공격' : '수비'} 배치`
        : null;
    const gem = needsMove ? residenceSpeedUpCost(moveRemainMs) : 0;
    setPlanLeft(3);
    setPlanConfirm(false);
    setPlan({
      zoneId: selected.id,
      zoneName: selected.name,
      role: selectedRole,
      move: needsMove,
      gem,
      release,
    });
  };

  /** 확인된 계획 실행 — 이동·해제·배치가 서버 한 트랜잭션에서 처리된다. */
  const runPlan = () => {
    if (!plan) return;
    const me = members.find((x) => x.userId === myUserId);
    if (!me) return;
    const prev = me;
    const p = plan;
    setPlan(null);
    setPlanConfirm(false);
    // 배치 시 집행관(자동 방어)은 서버에서 자동 해제 → 로컬도 집행관 표시 제거(낙관적 갱신).
    patch(myUserId, { depZoneId: p.zoneId, depZoneName: p.zoneName, depRole: p.role, execZoneId: null, execZoneName: null });
    if (p.gem > 0) optimisticAdjust(-BigInt(p.gem));
    start(async () => {
      const r = await deployAction(p.zoneId, p.role, {
        move: p.move,
        paySpeedUp: p.gem > 0,
      });
      if (r.status !== 'success') {
        patch(myUserId, {
          depZoneId: prev.depZoneId, depZoneName: prev.depZoneName, depRole: prev.depRole,
          execZoneId: prev.execZoneId, execZoneName: prev.execZoneName,
        });
        if (p.gem > 0) optimisticAdjust(BigInt(p.gem));
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({
        title: `${p.role === 'attack' ? '공격' : '수비'} 배치${p.move ? ' · 거주지 이동' : ''}`,
      });
      router.refresh(); // 거주지·쿨타임은 서버 상태 — 다음 판단이 어긋나지 않게 동기화
    });
  };

  // 해제 — 본인은 자기 배치 취소(cancelDeploy), 임원은 남의 배치도 해제(clearMember).
  const remove = (m: Member) => {
    const prev = m;
    const isSelf = m.userId === myUserId;
    patch(m.userId, { depZoneId: null, depZoneName: null, depRole: null });
    start(async () => {
      const r = isSelf ? await cancelDeployAction() : await clearMemberDeploymentAction(m.userId);
      if (r.status !== 'success') {
        patch(m.userId, { depZoneId: prev.depZoneId, depZoneName: prev.depZoneName, depRole: prev.depRole });
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '배치 해제' });
    });
  };

  const setExec = (m: Member) => {
    if (selectedId == null || !selected) return;
    const snapshot = members;
    setMembers((prev) =>
      prev.map((x) => {
        if (x.execZoneId === selectedId) return { ...x, execZoneId: null, execZoneName: null }; // 기존 집행관 해제
        if (x.userId === m.userId)
          return { ...x, execZoneId: selectedId, execZoneName: selected.name, depZoneId: null, depZoneName: null, depRole: null };
        return x;
      }),
    );
    start(async () => {
      const r = await setExecutorAction(selectedId, m.userId);
      if (r.status !== 'success') {
        setMembers(snapshot);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '집행관 지정' });
    });
  };

  const clearExec = () => {
    if (selectedId == null) return;
    const snapshot = members;
    setMembers((prev) => prev.map((x) => (x.execZoneId === selectedId ? { ...x, execZoneId: null, execZoneName: null } : x)));
    start(async () => {
      const r = await clearExecutorAction(selectedId);
      if (r.status !== 'success') {
        setMembers(snapshot);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '집행관 해제' });
    });
  };

  // 구역별 우리 배치 요약(노드 라벨) — 인원 + 전투력(역할 배수 반영). 우리 배치만(안개).
  const zoneDeploy = useMemo(() => {
    const m = new Map<number, { count: number; power: number }>();
    const add = (zid: number, power: number) => {
      const e = m.get(zid) ?? { count: 0, power: 0 };
      e.count += 1;
      e.power += power;
      m.set(zid, e);
    };
    for (const mem of members) {
      if (mem.execZoneId != null) add(mem.execZoneId, mem.combat * CONQUEST_EXECUTOR_POWER_MULT);
      else if (mem.depZoneId != null) add(mem.depZoneId, mem.combat * (mem.depRole === 'defend' ? DEFEND_MULT : 1));
    }
    for (const e of m.values()) e.power = Math.round(e.power);
    return m;
  }, [members]);

  // 노드 라벨 — 3초마다 인원↔전투력 토글.
  const [showPower, setShowPower] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setShowPower((v) => !v), 3000);
    return () => clearInterval(t);
  }, []);

  // 전투 윈도 잠금(KST 23:00~익일 01:00) — 라이브 시계로 판정. Date.now()는 UTC epoch라 단말 표준시 무관.
  // 서버 isConquestLockWindow(23시 정산 + 00시 공개·소유권 이전)와 동일 공식이어야 UI/서버가 일치.
  // UX 차단일 뿐 권위는 서버(BATTLE_IN_PROGRESS). 하이드레이션 불일치 회피 위해 false로 시작 후 마운트 시 갱신.
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const check = () => {
      const h = Math.floor((Date.now() + 9 * 3_600_000) / 3_600_000) % 24;
      setLocked(h === CONQUEST_BATTLE_KST_HOUR || h === (CONQUEST_BATTLE_KST_HOUR + 1) % 24);
    };
    check();
    const t = setInterval(check, 15_000);
    return () => clearInterval(t);
  }, []);

  const edges = useMemo(() => {
    return adjacency
      .map(({ a, b }) => {
        const za = zoneById.get(a);
        const zb = zoneById.get(b);
        if (!za || !zb) return null;
        // 3단계 — ① 내가 이동할 수 있는 길(거주지에 맞닿음) ② 길드 관련(우리 소유·공격 가능끼리) ③ 그 외.
        // 세계지도와 같은 색 규칙을 쓰되, 길드 관련은 중간 밝기로 둬 이동 가능 길이 먼저 읽히게 한다.
        const tier = homeZoneId != null && (a === homeZoneId || b === homeZoneId)
          ? 'walk'
          : usable(a) && usable(b)
            ? 'guild'
            : 'dim';
        return { a, b, x1: za.mapX, y1: za.mapY, x2: zb.mapX, y2: zb.mapY, tier };
      })
      .filter((e): e is NonNullable<typeof e> => e != null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjacency, zoneById, ownedIds, attackable, homeZoneId]);

  return (
    <div className="flex min-h-full shrink-0 flex-col">
      {/* 지도 — 상단 전체. 우리 점령지·공격 가능만 또렷, 그 외 흐릿(보이되 비활성) */}
      {/* isolate — 내부 노드 zIndex(선택 30 등)가 전역 스태킹으로 새어 채팅 패널(z-20 fixed)
          위로 떠오르던 오버랩 버그 방지(2026-07-21 제보). */}
      <div className="relative isolate aspect-square w-full shrink-0 overflow-hidden border-b border-zinc-800 bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mapSrc}
          alt="월드맵"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-black/30" />
        {/* 점령전 시각 안내 — 지도 좌상단(우하단 탭 위에 두면 지도를 가려 좌상단으로 이동, 2026-07-23). */}
        <div className="pointer-events-none absolute left-2 top-2 z-20 max-w-[58%] text-left">
          {locked ? (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/60 bg-red-950/85 px-2 py-1 text-[9px] font-bold text-red-100 shadow-lg backdrop-blur-sm">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
              점령전 진행 중 · 자정 결과 발표
            </div>
          ) : (
            <div className="inline-block rounded-lg bg-black/60 px-2 py-1 text-[9px] font-semibold leading-[1.5] text-white/90 shadow-lg backdrop-blur-sm">
              {CONQUEST_BATTLE_KST_HOUR}:00 배치 마감 · 24:00 결과 발표
              <br />
              <span className="text-white/70">{CONQUEST_BATTLE_KST_HOUR}:00~익일 01:00 배치 등록 불가</span>
            </div>
          )}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          {edges.map((e) => (
            <line
              key={`h${e.a}-${e.b}`}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="#000000"
              strokeOpacity={e.tier === 'walk' ? 0.42 : e.tier === 'guild' ? 0.32 : 0.22}
              strokeWidth={e.tier === 'walk' ? 1 : e.tier === 'guild' ? 0.85 : 0.7}
              strokeLinecap="round"
            />
          ))}
          {edges.map((e) => (
            <line
              key={`m${e.a}-${e.b}`}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke={e.tier === 'walk' ? '#fde047' : e.tier === 'guild' ? '#fcd34d' : '#cbd5e1'}
              strokeOpacity={e.tier === 'walk' ? 0.95 : e.tier === 'guild' ? 0.55 : 0.4}
              strokeWidth={e.tier === 'walk' ? 0.72 : 0.5}
              strokeLinecap="round"
            />
          ))}
        </svg>
        {zones.map((z) => {
          const mine = z.ownerGuildId === myGuildId;
          const canAttack = !mine && attackable.has(z.id);
          const isHome = z.id === homeZoneId;
          const isUsable = mine || canAttack || isHome; // 내 거주지는 항상 선택 가능
          const isSel = z.id === selectedId;
          const owned = z.ownerGuildId != null;
          const ring = mine ? '#10b981' : canAttack ? '#ef4444' : '#71717a';
          const dep = zoneDeploy.get(z.id);
          return (
            <button
              key={z.id}
              type="button"
              disabled={!isUsable}
              onClick={() => isUsable && setSelectedId(z.id)}
              aria-label={z.name}
              // p-2: 시각 노드(17px)는 유지하고 투명 패딩으로 터치 히트영역 확대(~33px). 사용 가능 노드가
              // z-index 상위라 비활성 노드 패딩과 겹쳐도 탭이 사용 노드로 간다.
              className="absolute -translate-x-1/2 -translate-y-1/2 p-2"
              style={{ left: `${z.mapX}%`, top: `${z.mapY}%`, zIndex: isSel ? 30 : isUsable ? 10 : 1 }}
            >
              <span
                className="relative block h-[17px] w-[17px] overflow-hidden rounded-[4px] ring-1 ring-black/60 transition"
                style={{
                  backgroundColor: owned ? 'transparent' : 'rgba(10,12,20,0.5)',
                  outline: `1.5px solid ${ring}`,
                  outlineOffset: 0,
                  opacity: isUsable ? 1 : 0.55,
                  boxShadow: isUsable ? `0 0 4px ${ring}99` : 'none',
                }}
              >
                {/* 점령 길드 문양(모든 점령 구역) */}
                {owned && z.ownerEmblemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={z.ownerEmblemUrl}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : null}
              </span>
              {/* 배치 요약 라벨 — 우리 배치가 있으면 인원↔전투력 토글(노드 하단) */}
              {dep && (
                <span className="pointer-events-none absolute left-1/2 top-full -mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/75 px-1 text-[7px] font-bold leading-[1.4] text-white shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {showPower ? `전투력 ${fmt(dep.power)}` : `${dep.count}명`}
                </span>
              )}
              <MapPins home={isHome} selected={isSel} />
            </button>
          );
        })}
        {/* 범례(좌하단) */}
        <div className="pointer-events-none absolute bottom-2 left-2 z-20 flex flex-col gap-1 rounded-lg bg-black/55 px-2 py-1.5 text-[9px] font-semibold text-white backdrop-blur-sm">
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm" style={{ outline: '1.5px solid #10b981' }} /> 우리 점령지
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm" style={{ outline: '1.5px solid #ef4444' }} /> 공격 가능
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-full" style={{ background: '#f59e0b' }} /> 내 위치
            <i className="ml-1 h-2 w-2 rounded-full" style={{ background: '#0284c7' }} /> 선택
          </span>
        </div>
      </div>

      {/* 하단 — 좌: 선택 구역 / 우: 길드원 전체 */}
      <div className="grid flex-1 grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-800">
        {/* 좌: 선택 구역 배치 */}
        <section className="min-w-0 p-3">
          {selected ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <h3 className="truncate text-[13px] font-bold">{selected.name}</h3>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0 text-[9px] font-bold ${
                    isDefend ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'
                  }`}
                >
                  {isDefend ? '수비' : '공격'}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                총 전투력 <span className="font-mono font-bold text-zinc-700 dark:text-zinc-200">{fmt(totalPower)}</span>
              </p>
              {/* 거주 안내(0139) — 배치 시 거주지도 함께 옮겨진다는 것을 미리 알린다. */}
              {selected.id !== homeZoneId && (
                <p className="mt-1.5 rounded-md bg-amber-500/10 px-1.5 py-1 text-[9.5px] leading-snug font-medium text-amber-700 dark:text-amber-300">
                  {adjacentToHome && !adjacentToHome.has(selected.id)
                    ? '맞닿은 구역이 아니라 이동할 수 없습니다.'
                    : '배치하면 거주지도 이 구역으로 옮겨집니다.'}
                </p>
              )}

              {execHere.length === 0 && deployedHere.length === 0 ? (
                <p className="mt-2 text-[11px] text-zinc-400">배치된 길드원이 없습니다.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {execHere.map((m) => (
                    <li key={m.userId} className="flex min-h-[38px] items-center justify-between gap-1">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="flex w-full items-center gap-1">
                          <span className="truncate text-[12px] font-semibold">{m.nickname}</span>
                          <span className="shrink-0 font-mono text-[9px] text-zinc-400">
                            {fmt(Math.round(m.combat * CONQUEST_EXECUTOR_POWER_MULT))}
                          </span>
                        </span>
                        <span className="text-[9px] font-medium text-indigo-500">집행관</span>
                      </div>
                      {isLeader && !locked && (
                        <button
                          type="button"
                          onClick={clearExec}
                          disabled={pending}
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-red-500 disabled:opacity-50"
                        >
                          해제
                        </button>
                      )}
                    </li>
                  ))}
                  {deployedHere.map((m) => (
                    <li key={m.userId} className="flex min-h-[38px] items-center justify-between gap-1">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="flex w-full items-center gap-1">
                          <span className="truncate text-[12px] font-semibold">{m.nickname}</span>
                          <span className="shrink-0 font-mono text-[9px] text-zinc-400">
                            {fmt(Math.round(m.combat * (isDefend ? DEFEND_MULT : 1)))}
                          </span>
                        </span>
                        <span className={`text-[9px] font-medium ${isDefend ? 'text-sky-500' : 'text-red-500'}`}>
                          {isDefend ? '수비' : '공격'}
                        </span>
                      </div>
                      {!locked && (isLeader || m.userId === myUserId) && (
                        <div className="flex shrink-0 items-center gap-0.5">
                          {/* 집행관 지정은 임원 권한 */}
                          {isDefend && isLeader && (
                            <button
                              type="button"
                              onClick={() => setExec(m)}
                              disabled={pending}
                              className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-indigo-500 disabled:opacity-50"
                            >
                              집행관
                            </button>
                          )}
                          {/* 해제는 본인 또는 임원 */}
                          <button
                            type="button"
                            onClick={() => remove(m)}
                            disabled={pending}
                            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-red-500 disabled:opacity-50"
                          >
                            해제
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-[11px] leading-relaxed text-zinc-400">
              지도에서 우리 점령지(수비) 또는 공격 가능 구역을 선택하세요.
            </p>
          )}
        </section>

        {/* 우: 길드원 전체 */}
        <section className="min-w-0 p-3">
          <div className="flex items-baseline gap-1.5">
            <h3 className="text-[13px] font-bold">길드원 ({members.length})</h3>
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            <span className="font-semibold text-red-500">공 {attackCount}</span> ·{' '}
            <span className="font-semibold text-sky-500">수 {defendCount}</span> ·{' '}
            <span className="text-zinc-400">대기 {idleCount}</span>
          </p>
          <ul className="mt-2 space-y-1">
            {sortedMembers.map((m) => {
              const isExec = m.execZoneId != null;
              const here = selectedId != null && m.depZoneId === selectedId;
              const deployedZoneId = m.depZoneId ?? m.execZoneId; // 클릭 시 이동할 구역
              const status = isExec
                ? `집행관·${m.execZoneName}`
                : m.depRole
                  ? `${m.depRole === 'attack' ? '공격' : '수비'}·${m.depZoneName}`
                  : '미배치';
              // 배치는 유저 고유 권한 — 공격/수비 버튼은 본인 행에만 노출.
              // 집행관도 배치 가능(배치 시 자동 방어 자동 해제, 2026-07-26 문의 #90).
              // 버튼은 항상 노출한다 — 눌러야 무엇이 필요한지(이동·해제) 알 수 있다.
              const canSelfDeploy = m.userId === myUserId && !locked && selected != null && !here;
              return (
                <li key={m.userId} className="flex min-h-[38px] items-center gap-1">
                  <button
                    type="button"
                    onClick={() => deployedZoneId != null && setSelectedId(deployedZoneId)}
                    disabled={deployedZoneId == null}
                    className="flex min-w-0 flex-1 flex-col items-start text-left disabled:cursor-default"
                  >
                    <span className="flex w-full items-center gap-1">
                      <span className="truncate text-[12px] font-semibold">{m.nickname}</span>
                      <span className="shrink-0 font-mono text-[9px] text-zinc-400">{fmt(m.combat)}</span>
                    </span>
                    <span
                      className={`truncate text-[9px] font-medium ${
                        isExec
                          ? 'text-indigo-500'
                          : m.depRole === 'attack'
                            ? 'text-red-500'
                            : m.depRole === 'defend'
                              ? 'text-sky-500'
                              : 'text-zinc-400'
                      }`}
                    >
                      {status}
                    </span>
                  </button>
                  {here ? (
                    <span className="shrink-0 text-[9px] font-bold text-emerald-500">배치됨</span>
                  ) : canSelfDeploy ? (
                    <button
                      type="button"
                      onClick={askDeploy}
                      disabled={pending}
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white disabled:opacity-50 ${
                        isDefend ? 'bg-sky-600' : 'bg-red-600'
                      }`}
                    >
                      {isDefend ? '수비' : '공격'}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>


      {/* 배치 확인 — 이동·해제·배치를 한 화면에 모아 보여주고 한 번에 실행한다. */}
      {plan && (
        <ModalShell
          label="배치 확인"
          onClose={() => {
            setPlan(null);
            setPlanConfirm(false);
          }}
        >
          <ModalLayout
            title={`${plan.zoneName} ${plan.role === 'attack' ? '공격' : '수비'} 배치`}
            subtitle={
              <>
                {plan.move ? <span className="font-bold text-amber-500">거주지 이동 포함</span> : null}
                {plan.move && plan.gem > 0 ? <span className="mx-1 text-zinc-400">·</span> : null}
                {plan.gem > 0 ? (
                  <span className="font-mono font-bold text-sky-500">
                    {plan.gem.toLocaleString('ko-KR')}💎
                  </span>
                ) : null}
                {!plan.move && plan.gem === 0 ? '추가 비용 없음' : null}
              </>
            }
            footer={
              <>
                <button
                  type="button"
                  onClick={() => {
                    // 보석이 나가는 경우에만 3초 재확인 — 무료 배치까지 막으면 성가시다.
                    if (plan.gem === 0 || planConfirm) runPlan();
                    else {
                      setPlanLeft(3);
                      setPlanConfirm(true);
                    }
                  }}
                  disabled={pending}
                  className={`relative isolate flex-1 overflow-hidden rounded-xl py-2.5 text-[13px] font-bold text-white transition-colors disabled:opacity-50 ${
                    plan.role === 'attack' ? 'bg-red-600' : 'bg-sky-600'
                  }`}
                >
                  {planConfirm && (
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-white/25"
                      style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
                    />
                  )}
                  <span className="relative">
                    {plan.gem > 0 ? `배치 💎${plan.gem.toLocaleString('ko-KR')}` : '배치'}
                    {planConfirm ? ` ${planLeft}s` : ''}
                  </span>
                </button>
                <ModalButton
                  tone="ghost"
                  onClick={() => {
                    setPlan(null);
                    setPlanConfirm(false);
                  }}
                >
                  취소
                </ModalButton>
              </>
            }
          >
            <ul className="space-y-1.5 text-[12px]">
              {plan.release && (
                <li className="flex gap-1.5">
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-600 dark:text-zinc-300">
                    <b className="font-bold text-red-500">{plan.release}</b>가 해제됩니다.
                  </span>
                </li>
              )}
              {plan.move && (
                <li className="flex gap-1.5">
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-600 dark:text-zinc-300">
                    거주지가 <b className="font-bold text-amber-500">{plan.zoneName}</b>으로 이동합니다.
                  </span>
                </li>
              )}
              {plan.gem > 0 && (
                <li className="flex gap-1.5">
                  <span className="text-zinc-400">·</span>
                  <span className="text-zinc-600 dark:text-zinc-300">
                    이동 대기시간{' '}
                    <b className="font-bold text-zinc-700 dark:text-zinc-200">{fmtRemain(moveRemainMs)}</b>을{' '}
                    <b className="font-mono font-bold text-sky-500">{plan.gem.toLocaleString('ko-KR')}💎</b>로
                    단축합니다.
                  </span>
                </li>
              )}
              <li className="flex gap-1.5">
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-600 dark:text-zinc-300">
                  <b className={`font-bold ${plan.role === 'attack' ? 'text-red-500' : 'text-sky-500'}`}>
                    {plan.role === 'attack' ? '공격' : '수비'}
                  </b>
                  로 배치됩니다.
                </span>
              </li>
            </ul>
          </ModalLayout>
        </ModalShell>
      )}

    </div>
  );
}
