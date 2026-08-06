'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { Ticker } from '@/components/Ticker';

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
  speedUpResidenceAction,
  setResidenceAction,
  deployAction,
  cancelDeployAction,
  clearMemberDeploymentAction,
  setExecutorAction,
  clearExecutorAction,
} from '../actions';
import { Tabs } from '@/components/ui/Tabs';

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
 *
 * 좌표를 flex 정렬에 맡기면 보이는 핀 개수에 따라 중심이 흔들린다(2026-07-29 반복 제보).
 * 그래서 **너비 0인 앵커**를 노드 정중앙에 두고 핀을 절대배치로 매단다 —
 * 하나면 정확히 가운데, 둘이면 좌우 대칭. 어떤 조합이든 중심은 항상 노드 중앙이다.
 * 애니메이션은 앵커에만 걸어 두 핀이 같은 박자로 움직인다(앵커는 늘 마운트 상태).
 */
function MapPins({ home, selected }: { home: boolean; selected: boolean }) {
  const both = home && selected;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-full left-1/2 -mb-1 block h-[11px] w-0 animate-marker-bob"
    >
      {home ? <Pin dx={both ? -7 : 0} from="#fcd34d" to="#f59e0b" glow="245,158,11" hi="251,191,36" /> : null}
      {selected ? <Pin dx={both ? 7 : 0} from="#7dd3fc" to="#0284c7" glow="2,132,199" hi="56,189,248" /> : null}
    </span>
  );
}

function Pin({
  dx,
  from,
  to,
  glow,
  hi,
}: {
  /** 앵커 기준 좌우 오프셋(px) — 둘 다 뜰 때만 벌린다. */
  dx: number;
  from: string;
  to: string;
  glow: string;
  hi: string;
}) {
  return (
    <span
      className="absolute top-0 block h-[11px] w-[11px]"
      style={{ left: dx, transform: 'translateX(-50%)' }}
    >
      <span
        className="relative block h-full w-full animate-marker-pin-glow border-[1.5px] border-white"
        style={{
          background: `linear-gradient(135deg, ${from}, ${to})`,
          borderRadius: '50% 50% 50% 0',
          transform: 'rotate(-45deg)',
          ['--pin-glow' as string]: `rgba(${glow},0.65)`,
          ['--pin-glow-hi' as string]: `rgba(${hi},0.95)`,
        }}
      >
        <span className="absolute left-1/2 top-1/2 h-[3.5px] w-[3.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
      </span>
    </span>
  );
}

/** 배치된 길드원 한 줄 — 이름·역할·전투력·액션이 모두 한 행에 들어간다(2줄 → 1줄). */
function DeployedRow({
  nickname,
  roleLabel,
  roleClass,
  power,
  isMe,
  actions,
}: {
  nickname: string;
  roleLabel: string;
  roleClass: string;
  power: string;
  isMe: boolean;
  actions: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5 py-1.5">
      <span className={`shrink-0 text-[10px] font-bold ${roleClass}`}>{roleLabel}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
        {nickname}
        {isMe ? <span className="ml-1 text-[9px] font-bold text-amber-500">나</span> : null}
      </span>
      <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-400">{power}</span>
      {actions}
    </li>
  );
}

/** 행 액션 — 해제·집행관. 터치 영역은 유지하고 시각 크기만 줄인다. */
function RowAction({
  onClick,
  disabled,
  tone,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone: 'danger' | 'exec';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 rounded-md px-1.5 py-1 text-[10.5px] font-bold disabled:opacity-50 ${
        tone === 'danger' ? 'text-red-500' : 'text-indigo-500'
      }`}
    >
      {children}
    </button>
  );
}

/** 배치 현황 팝업 필터 — '미배치'가 실제로 쓰는 것(누가 아직 안 했나). */
const STATUS_FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'attack', label: '공격' },
  { key: 'defend', label: '수비' },
  { key: 'idle', label: '미배치' },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]['key'];

export function DeployBoard({
  canDeploy,
  canExecutor,
  myUserId,
  residence,
  myGuildId,
  mapSrc,
  attackableZoneIds,
  adjacency,
  members: initialMembers,
  zones,
}: {
  /** 남의 배치를 **해제**할 수 있는가(deploy 권한, 0142). 배치는 본인만 하므로 무관. */
  canDeploy: boolean;
  /** 집행관 지정·해제 가능(executor 권한, 0142). */
  canExecutor: boolean;
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
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [members, setMembers] = useState(initialMembers);
  // 초기 선택 = 내 거주지 — 배치는 거주 구역에서만 가능하므로 첫 화면이 곧 내 자리다.
  const [selectedId, setSelectedId] = useState<number | null>(residence?.zoneId ?? null);
  const homeZoneId = residence?.zoneId ?? null;
  // 이동 가능 구역 — 거주지와 인접한 곳. 거주 미설정이면 어디든 정착 가능.
  const adjacentToHome = useMemo(() => {
    if (homeZoneId == null) return null;
    const set = new Set<number>();
    for (const { a, b } of adjacency) {
      if (a === homeZoneId) set.add(b);
      else if (b === homeZoneId) set.add(a);
    }
    return set;
  }, [adjacency, homeZoneId]);
  /** 이동 대기시간 단축 팝업 — 세계지도 이동과 같은 순서(단축 먼저, 배치는 다시 누르기). */
  const [speedUpAsk, setSpeedUpAsk] = useState(false);
  /** 단축 성공 후 남은 시간을 즉시 0으로 — 서버 갱신을 기다리지 않는다. */
  const [readyCleared, setReadyCleared] = useState(false);
  const readyAt = residence?.readyAtIso ? Date.parse(residence.readyAtIso) : null;
  // 1초 클럭 분리(2026-08-06) — 종전엔 setInterval이 쿨타임 내내 보드 전체를 매초 리렌더.
  // 초 단위 표시는 Ticker(표시 지점)가 보유, 핸들러는 호출 시점에 계산.
  const moveRemainNow = () => (readyCleared ? 0 : readyAt ? Math.max(0, readyAt - Date.now()) : 0);
  /** 배치 확인 팝업 — 이동·해제·배치를 한 번에 안내하고 한 번에 실행한다. */
  const [plan, setPlan] = useState<{
    zoneId: number;
    zoneName: string;
    /** null = 배치 없이 **이동만**(2026-07-30) — 배치 전에 자리부터 옮기고 싶을 때. */
    role: ConquestRole | null;
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

  // 배치 현황 팝업 — 길드원 전체를 시트 밖으로 뺀 자리(D-1).
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  /** 내가 이 구역에 이미 배치되어 있는가 — 배치 버튼 대신 '배치되어 있습니다'를 보인다. */
  const meHere = useMemo(
    () =>
      selectedId != null &&
      members.some(
        (m) => m.userId === myUserId && (m.depZoneId === selectedId || m.execZoneId === selectedId),
      ),
    [members, myUserId, selectedId],
  );

  // 현황 목록 — 본인을 항상 맨 위로(나머지 순서 유지). 필터는 '누가 아직 안 했나'가 핵심.
  const statusList = useMemo(() => {
    const ordered = [
      ...members.filter((m) => m.userId === myUserId),
      ...members.filter((m) => m.userId !== myUserId),
    ];
    if (statusFilter === 'all') return ordered;
    if (statusFilter === 'idle')
      return ordered.filter((m) => m.depZoneId == null && m.execZoneId == null);
    if (statusFilter === 'attack') return ordered.filter((m) => m.depRole === 'attack');
    // 수비 = 수비 배치 + 집행관(집행관은 수비 전력이다).
    return ordered.filter((m) => m.depRole === 'defend' || m.execZoneId != null);
  }, [members, myUserId, statusFilter]);

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
      return showError('인접한 구역으로만 이동할 수 있습니다. 한 칸씩 옮겨가세요.');
    }
    const release = me.execZoneId
      ? `${me.execZoneName} 집행관`
      : me.depZoneId
        ? `${me.depZoneName} ${me.depRole === 'attack' ? '공격' : '수비'} 배치`
        : null;
    const gem = needsMove ? residenceSpeedUpCost(moveRemainNow()) : 0;
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

  /**
   * 이동만 — 배치는 하지 않고 거주지만 옮긴다. 종전엔 배치를 눌러야 이동이 따라왔는데,
   * 공격/수비를 정하기 전에 자리부터 옮기고 싶은 경우가 있다(2026-07-30 사용자 요청).
   */
  const askMove = () => {
    if (!selected || selected.id === homeZoneId) return;
    const me = members.find((x) => x.userId === myUserId);
    if (!me) return;
    if (adjacentToHome && !adjacentToHome.has(selected.id)) {
      return showError('인접한 구역으로만 이동할 수 있습니다. 한 칸씩 옮겨가세요.');
    }
    const release = me.execZoneId
      ? `${me.execZoneName} 집행관`
      : me.depZoneId
        ? `${me.depZoneName} ${me.depRole === 'attack' ? '공격' : '수비'} 배치`
        : null;
    setPlanLeft(3);
    setPlanConfirm(false);
    setPlan({
      zoneId: selected.id,
      zoneName: selected.name,
      role: null,
      move: true,
      gem: residenceSpeedUpCost(moveRemainNow()),
      release,
    });
  };

  /** 이동 대기시간 단축 — 대기시간만 없앤다(배치는 다시 누른다, 세계지도와 동일). */
  const doSpeedUp = () => {
    if (!plan) return;
    const cost = plan.gem;
    setSpeedUpAsk(false);
    setPlanConfirm(false);
    setReadyCleared(true); // 낙관 — 실패 시 되돌린다
    optimisticAdjust(-BigInt(cost));
    start(async () => {
      const r = await speedUpResidenceAction();
      if (r.status !== 'success') {
        setReadyCleared(false);
        optimisticAdjust(BigInt(cost));
        return showError(guildErrMsg(r.code));
      }
      setPlan((p) => (p ? { ...p, gem: 0 } : p));
      showHeaderToast({ title: `이동 대기시간 단축 −${cost.toLocaleString('ko-KR')}💎` });
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
    if (p.role != null)
      patch(myUserId, { depZoneId: p.zoneId, depZoneName: p.zoneName, depRole: p.role, execZoneId: null, execZoneName: null });
    if (p.gem > 0) optimisticAdjust(-BigInt(p.gem));
    if (p.role == null) {
      // 이동만 — 기존 배치/집행관은 서버가 해제한다(release).
      patch(myUserId, { depZoneId: null, depZoneName: null, depRole: null, execZoneId: null, execZoneName: null });
      start(async () => {
        const r = await setResidenceAction(p.zoneId, { release: p.release != null });
        if (r.status !== 'success') {
          patch(myUserId, {
            depZoneId: prev.depZoneId, depZoneName: prev.depZoneName, depRole: prev.depRole,
            execZoneId: prev.execZoneId, execZoneName: prev.execZoneName,
          });
          if (p.gem > 0) optimisticAdjust(BigInt(p.gem));
          return showError(guildErrMsg(r.code));
        }
        showHeaderToast({ title: `${p.zoneName}(으)로 거주지 이동` });
        // refresh 불필요(§11.7) — 액션 revalidate 재렌더가 거주지 상태를 실어 온다.
      });
      return;
    }
    const role = p.role;
    start(async () => {
      const r = await deployAction(p.zoneId, role, { move: p.move });
      if (r.status !== 'success') {
        patch(myUserId, {
          depZoneId: prev.depZoneId, depZoneName: prev.depZoneName, depRole: prev.depRole,
          execZoneId: prev.execZoneId, execZoneName: prev.execZoneName,
        });
        if (p.gem > 0) optimisticAdjust(BigInt(p.gem));
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({
        title: `${role === 'attack' ? '공격' : '수비'} 배치${p.move ? ' · 거주지 이동' : ''}`,
      });
      // refresh 불필요(§11.7) — 거주지·쿨타임은 액션 revalidate 재렌더가 실어 온다.
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
        // 기존 집행관은 자동 방어만 잃고 **일반 수비로 복원**된다(서버 restoreAsDefender).
        // 화면에서 '미배치'로 그리면 수비가 사라진 것처럼 보인다(2026-07-29 제보).
        if (x.execZoneId === selectedId)
          return {
            ...x,
            execZoneId: null,
            execZoneName: null,
            depZoneId: selectedId,
            depZoneName: selected.name,
            depRole: 'defend' as const,
          };
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
    setMembers((prev) =>
      prev.map((x) =>
        x.execZoneId === selectedId
          ? {
              ...x,
              execZoneId: null,
              execZoneName: null,
              // 해제도 같은 규칙 — 자동 방어만 풀리고 일반 수비로 남는다.
              depZoneId: selectedId,
              depZoneName: selected?.name ?? null,
              depRole: 'defend' as const,
            }
          : x,
      ),
    );
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
        // 3단계 — ① 내가 이동할 수 있는 길(거주지에 인접) ② 길드 관련(우리 소유·공격 가능끼리) ③ 그 외.
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
        {/* 배치 현황 — 지도 하단 중앙(좌하단 범례와 우하단 탭 사이가 비어 있다, 2026-07-30).
            시트를 차지하지 않으면서 우리 전력 분포를 항상 보여준다. */}
        <button
          type="button"
          onClick={() => setStatusOpen(true)}
          className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/60 px-2.5 py-1 text-[9.5px] font-bold tabular-nums text-white shadow-lg backdrop-blur-sm active:opacity-70"
        >
          <span className="text-red-400">{attackCount}</span>
          <span className="mx-0.5 text-white/40">·</span>
          <span className="text-sky-400">{defendCount}</span>
          <span className="mx-0.5 text-white/40">·</span>
          <span className={idleCount > 0 ? 'text-amber-300' : 'text-white/50'}>{idleCount}</span>
          <span className="ml-1 font-semibold text-white/70">배치 현황</span>
        </button>

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

      {/* 하단 시트(D-1) — 지도가 주인공이고 아래는 **선택한 구역 하나**만 다룬다.
          종전 좌우 2단은 칸당 170px라 닉네임·전투력·버튼이 눌려 있었다. 길드원 전체
          배치 현황은 시트를 좁히지 않도록 팝업으로 뺀다(2026-07-30 사용자 결정). */}
      <div className="flex-1 p-3">
        {selected ? (
          <section>
            {/* 구역 한 줄 — 이름·역할·인원·전투력을 한 줄에 모은다(종전 3줄). */}
            <div className="flex items-center gap-1.5">
              <span
                className={`h-4 w-1 shrink-0 rounded-full ${isDefend ? 'bg-sky-500' : 'bg-red-500'}`}
              />
              <h3 className="truncate text-[14px] font-extrabold">{selected.name}</h3>
              <span
                className={`shrink-0 text-[10px] font-bold ${
                  isDefend ? 'text-sky-600 dark:text-sky-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {isDefend ? '수비' : '공격'}
              </span>
              <span className="ml-auto shrink-0 text-[11px] tabular-nums text-zinc-500">
                {execHere.length + deployedHere.length}명 ·{' '}
                <span className="font-bold text-zinc-700 dark:text-zinc-200">{fmt(totalPower)}</span>
              </span>
            </div>

            {/* 거주 안내(0139) — 배치 시 거주지도 함께 옮겨진다는 것을 미리 알린다. */}
            {selected.id !== homeZoneId && (
              <p className="mt-1.5 text-[10px] font-medium leading-snug text-amber-600 dark:text-amber-400">
                {adjacentToHome && !adjacentToHome.has(selected.id)
                  ? '인접한 구역이 아니라 이동할 수 없습니다.'
                  : '배치하면 거주지도 이 구역으로 옮겨집니다.'}
              </p>
            )}

            {/* 내 액션 — 배치는 본인만 한다. 이동은 배치와 별개로도 필요하다(2026-07-30). */}
            {!locked && (!meHere || selected.id !== homeZoneId) && (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {!meHere ? (
                  <button
                    type="button"
                    onClick={askDeploy}
                    disabled={pending}
                    className={`rounded-lg py-2 text-[13px] font-bold text-white disabled:opacity-50 ${
                      isDefend ? 'bg-sky-600' : 'bg-red-600'
                    } ${selected.id === homeZoneId ? 'col-span-2' : ''}`}
                  >
                    {isDefend ? '수비배치' : '공격배치'}
                  </button>
                ) : null}
                {selected.id !== homeZoneId ? (
                  <button
                    type="button"
                    onClick={askMove}
                    disabled={pending}
                    className={`rounded-lg bg-amber-600 py-2 text-[13px] font-bold text-white disabled:opacity-50 ${
                      meHere ? 'col-span-2' : ''
                    }`}
                  >
                    이동
                  </button>
                ) : null}
              </div>
            )}

            {execHere.length === 0 && deployedHere.length === 0 ? (
              <p className="mt-2.5 text-[11px] text-zinc-400">아직 아무도 배치되지 않았습니다.</p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-900">
                {execHere.map((m) => (
                  <DeployedRow
                    key={m.userId}
                    nickname={m.nickname}
                    roleLabel="집행관"
                    roleClass="text-indigo-500"
                    power={fmt(Math.round(m.combat * CONQUEST_EXECUTOR_POWER_MULT))}
                    isMe={m.userId === myUserId}
                    actions={
                      canExecutor && !locked ? (
                        <RowAction onClick={clearExec} disabled={pending} tone="danger">
                          해제
                        </RowAction>
                      ) : null
                    }
                  />
                ))}
                {deployedHere.map((m) => (
                  <DeployedRow
                    key={m.userId}
                    nickname={m.nickname}
                    roleLabel={isDefend ? '수비' : '공격'}
                    roleClass={isDefend ? 'text-sky-500' : 'text-red-500'}
                    power={fmt(Math.round(m.combat * (isDefend ? DEFEND_MULT : 1)))}
                    isMe={m.userId === myUserId}
                    actions={
                      !locked && (canDeploy || m.userId === myUserId) ? (
                        <>
                          {/* 집행관 지정 — executor 권한(0142) */}
                          {isDefend && canExecutor && (
                            <RowAction onClick={() => setExec(m)} disabled={pending} tone="exec">
                              집행관
                            </RowAction>
                          )}
                          {/* 본인은 자기 배치 취소, 임원(deploy 권한)은 남의 배치도 해제 */}
                          <RowAction onClick={() => remove(m)} disabled={pending} tone="danger">
                            해제
                          </RowAction>
                        </>
                      ) : null
                    }
                  />
                ))}
              </ul>
            )}
          </section>
        ) : (
          <p className="mt-3 text-center text-[11px] leading-relaxed text-zinc-400">
            지도에서 우리 점령지(수비) 또는 공격 가능 구역을 선택하세요.
          </p>
        )}
      </div>

      {/* 배치 현황 팝업 — 누가 어디에 있고 누가 비어 있는지. 행을 누르면 그 구역으로 간다. */}
      {statusOpen && (
        <ModalShell onClose={() => setStatusOpen(false)} label="길드원 배치 현황">
          <ModalLayout
            title="배치 현황"
            subtitle={`길드원 ${members.length}명 · 공격 ${attackCount} · 수비 ${defendCount} · 미배치 ${idleCount}`}
            footer={
              <ModalButton tone="neutral" onClick={() => setStatusOpen(false)}>
                닫기
              </ModalButton>
            }
          >
            <Tabs
              size="sm"
              value={statusFilter}
              onChange={setStatusFilter}
              items={STATUS_FILTERS.map((f) => ({ key: f.key, label: f.label }))}
            />
            {/* 높이 고정 — 필터마다 인원이 달라 팝업이 늘었다 줄었다 하면 손가락 위치가 어긋난다. */}
            <ul
              className={`mt-2 h-[46vh] overflow-y-auto ${
                statusList.length === 0
                  ? 'flex items-center justify-center'
                  : 'divide-y divide-zinc-100 dark:divide-zinc-900'
              }`}
            >
              {statusList.length === 0 ? (
                <li className="text-center text-[11px] text-zinc-400">해당하는 길드원이 없어요.</li>
              ) : (
                statusList.map((m) => {
                  const isExec = m.execZoneId != null;
                  const zoneId = m.depZoneId ?? m.execZoneId;
                  const zoneName = isExec ? m.execZoneName : m.depZoneName;
                  return (
                    <li key={m.userId}>
                      <button
                        type="button"
                        disabled={zoneId == null}
                        onClick={() => {
                          if (zoneId == null) return;
                          setSelectedId(zoneId);
                          setStatusOpen(false);
                        }}
                        className="flex w-full items-center gap-2 py-2 text-left disabled:cursor-default"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1">
                            <span className="truncate text-[12.5px] font-semibold">{m.nickname}</span>
                            {m.userId === myUserId ? (
                              <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                                나
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={`block truncate text-[10px] font-medium ${
                              isExec
                                ? 'text-indigo-500'
                                : m.depRole === 'attack'
                                  ? 'text-red-500'
                                  : m.depRole === 'defend'
                                    ? 'text-sky-500'
                                    : 'text-zinc-400'
                            }`}
                          >
                            {isExec
                              ? `집행관 · ${zoneName}`
                              : m.depRole
                                ? `${m.depRole === 'attack' ? '공격' : '수비'} · ${zoneName}`
                                : '미배치'}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                          {fmt(m.combat)}
                        </span>
                        {zoneId != null ? (
                          <span className="shrink-0 text-zinc-300 dark:text-zinc-600">›</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </ModalLayout>
        </ModalShell>
      )}

      {/* 이동 대기시간 단축 — 배치 전에 먼저 통과해야 하는 관문(세계지도 이동과 동일 순서). */}
      {speedUpAsk && plan && (
        <ModalShell
          stacked
          onClose={() => {
            setSpeedUpAsk(false);
            setPlanConfirm(false);
          }}
          onSubmit={() => {
            if (planConfirm) doSpeedUp();
            else {
              setPlanLeft(3);
              setPlanConfirm(true);
            }
          }}
          label="이동 대기시간 단축"
        >
          <ModalLayout
            title="이동 대기시간 단축"
            subtitle={
              <>
                남은{' '}
                <b className="font-bold text-zinc-600 dark:text-zinc-300">
                  <Ticker>{() => fmtRemain(moveRemainNow())}</Ticker>
                </b>
              </>
            }
            footer={
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (planConfirm) doSpeedUp();
                    else {
                      setPlanLeft(3);
                      setPlanConfirm(true);
                    }
                  }}
                  disabled={pending}
                  className={`relative isolate flex-1 overflow-hidden rounded-xl py-2.5 text-[13px] font-bold text-white transition-colors disabled:opacity-50 ${
                    planConfirm ? 'bg-sky-700' : 'bg-sky-600'
                  }`}
                >
                  {planConfirm && (
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-sky-500"
                      style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
                    />
                  )}
                  <span className="relative">
                    단축 💎{plan.gem.toLocaleString('ko-KR')}
                    {planConfirm ? ` ${planLeft}s` : ''}
                  </span>
                </button>
                <ModalButton
                  tone="ghost"
                  onClick={() => {
                    setSpeedUpAsk(false);
                    setPlanConfirm(false);
                  }}
                >
                  취소
                </ModalButton>
              </>
            }
          >
            <p className="text-center text-[12.5px] text-zinc-500 dark:text-zinc-400">
              다이아를 사용해 남은 대기시간을 없앱니다.
            </p>
            <div className="mt-3 rounded-xl bg-zinc-100 py-3 text-center dark:bg-zinc-800">
              <p className="font-mono text-[20px] font-black text-sky-500">
                {plan.gem.toLocaleString('ko-KR')}💎
              </p>
            </div>
          </ModalLayout>
        </ModalShell>
      )}

      {/* 배치 확인 — 이동·해제·배치를 한 화면에 모아 보여주고 한 번에 실행한다. */}
      {plan && (
        <ModalShell
          label="배치 확인"
          receded={speedUpAsk}
          onClose={() => {
            setPlan(null);
            setPlanConfirm(false);
          }}
          onSubmit={() => {
            // 손 동작과 같은 순서 — 유료면 첫 Enter가 3초 재확인 무장, 두 번째가 확정.
            if (plan.gem === 0 || planConfirm) runPlan();
            else {
              setPlanLeft(3);
              setPlanConfirm(true);
            }
          }}
        >
          <ModalLayout
            title={
              plan.role == null
                ? `${plan.zoneName}(으)로 이동`
                : `${plan.zoneName} ${plan.role === 'attack' ? '공격' : '수비'} 배치`
            }
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
                {plan.gem > 0 ? (
                  // 이동 대기시간이 남았다 — 세계지도와 같은 순서로 단축 팝업을 먼저 띄운다.
                  <button
                    type="button"
                    onClick={() => setSpeedUpAsk(true)}
                    disabled={pending}
                    style={{ flex: 1 }}
                    className="rounded-xl bg-sky-600 py-1.5 text-[11px] leading-[1.35] font-bold text-white disabled:opacity-50"
                  >
                    <Ticker>{() => <>{fmtRemain(moveRemainNow())} 후</>}</Ticker> {plan.role == null ? '이동' : '배치'}
                    <br />
                    또는 💎{plan.gem.toLocaleString('ko-KR')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={runPlan}
                    disabled={pending}
                    style={{ flex: 1 }}
                    className={`rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-50 ${
                      plan.role === 'attack' ? 'bg-red-600' : plan.role === 'defend' ? 'bg-sky-600' : 'bg-amber-600'
                    }`}
                  >
                    {plan.role == null ? '이동' : '배치'}
                  </button>
                )}
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
                    <b className="font-bold text-zinc-700 dark:text-zinc-200">
                      <Ticker>{() => fmtRemain(moveRemainNow())}</Ticker>
                    </b>을{' '}
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
