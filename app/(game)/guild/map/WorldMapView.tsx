'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useState, useTransition } from 'react';

import { profileHref } from '@/lib/game/profile/href';
import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import { ModalShell } from '@/components/ModalShell';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { assetUrl } from '@/lib/asset-versions';
import { GUILD_EXECUTOR_TAX_CUT, TAX_COLLECT_COOLDOWN_MIN } from '@/lib/game/guild/balance';

import {
  setResidenceAction,
  getZoneBattleAction,
  collectTaxAction,
  getGuildSummaryByNameAction,
} from '../actions';
import { guildErrMsg } from '../errors-msg';

import { ZONE_LORE } from '@/lib/game/guild/zone-lore';
import { REGION_META, REGION_ORDER, type Region } from '@/lib/game/guild/region-meta';
import { CHRONICLE_TOKEN_RE, fixLeadingJosa } from './chronicle-tokens';
import { ChronicleReplayPanel } from './ChronicleReplay';
import type { ConquestReplay } from '@/lib/game/guild/conquest/replay';

type Zone = {
  id: number;
  region: Region;
  name: string;
  mapX: number;
  mapY: number;
  ownerGuildId: string | null;
  ownerGuildName: string | null;
  ownerEmblemUrl: string | null;
  ownerEmblemColor: string | null;
  executorUserId: string | null;
  executorNickname: string | null;
  /** 집행관 공개코드 — 팝업에서 프로필 이동 링크(없으면 링크 미표시). */
  executorCode: string | null;
  taxDiamond: string;
  lastTaxAt: number | null;
  residentCount: number;
};

/**
 * 연대기 본문 — AI가 감싼 마커를 종류별 강조 스팬으로 렌더.
 *   {g|이름}=길드(배경 칩) · {u|이름}=인물(점선 밑줄) · {z|이름}=구역(해당 구역의 지역색).
 *   길드/유저는 색을 쓰지 않는다 — 구역의 지역색(왕국=앰버, 신전=블루 등)과 색이 겹치지 않도록
 *   칩/밑줄로 구분(색이 아닌 형태로 강조).
 * zoneColor: 구역 이름 → 색(zones 기반). 미매칭이면 null(기본 색 유지). 지역 카테고리는 마커 없이 일반 텍스트.
 */
function ChronicleText({
  text,
  zoneColor,
  onGuild,
  onZone,
  serverId,
}: {
  text: string;
  zoneColor: (name: string) => string | null;
  onGuild: (name: string) => void;
  onZone: (name: string) => void;
  serverId: number;
}) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  // matchAll은 전역 정규식을 내부 복제해 순회 — 모듈 공유 정규식의 lastIndex를 건드리지 않음(렌더 순수성).
  for (const m of text.matchAll(CHRONICLE_TOKEN_RE)) {
    const mIndex = m.index ?? 0;
    if (mIndex > last) out.push(<span key={key++}>{text.slice(last, mIndex)}</span>);
    const type = m[1];
    const name = m[2];
    if (type === 'g') {
      // 길드 — 회청(슬레이트). 클릭 시 길드 상세 팝업.
      out.push(
        <button
          key={key++}
          type="button"
          onClick={() => onGuild(name)}
          className="align-baseline font-semibold text-slate-600 active:opacity-60 dark:text-slate-400"
        >
          {name}
        </button>,
      );
    } else if (type === 'u') {
      // 인물 — 웜 그레이(스톤). 3필드 마커({u|닉|코드})의 코드는 불변 publicCode — 닉변·재취득에도
      // 안전한 프로필 링크. 코드 없는 레거시 2필드는 표시 전용(닉 기반 링크는 /u가 publicCode
      // 단일 해석이라 404 + 오귀속 위험 — P-A7).
      const code = m[3];
      out.push(
        code ? (
          <Link prefetch={false} key={key++} href={profileHref(code, serverId)} className="text-stone-500 underline decoration-dotted underline-offset-2 dark:text-stone-400">
            {name}
          </Link>
        ) : (
          <span key={key++} className="text-stone-500 dark:text-stone-400">
            {name}
          </span>
        ),
      );
    } else {
      // 구역 — 지역색 칩. 클릭 시 구역 상세 팝업.
      const c = zoneColor(name);
      out.push(
        <button
          key={key++}
          type="button"
          onClick={() => onZone(name)}
          className="mx-px rounded-[3px] px-1 align-baseline text-[11px] font-semibold active:opacity-60"
          style={
            c
              ? { color: c, backgroundColor: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}55` }
              : undefined
          }
        >
          {name}
        </button>,
      );
    }
    last = mIndex + m[0].length;
    // 마커 직후 조사 보정 — 이름 받침에 맞는 조사로 교체(잘못된 은/는·이/가 등 제거).
    const fixed = fixLeadingJosa(name, text.slice(last));
    if (fixed) {
      out.push(<span key={key++}>{fixed.josa}</span>);
      last += fixed.len;
    }
  }
  if (last < text.length) out.push(<span key={key++}>{text.slice(last)}</span>);
  return <>{out}</>;
}

// 지역 라벨·색 — 공용 메타(길드 팝업 칩과 동일 출처).
const REGION = REGION_META;


export function WorldMapView({
  mapSrc,
  residenceZoneId,
  canSetResidence,
  myUserId,
  serverId,
  chronicle,
  zones,
  adjacency,
  replay,
  replayYesterday,
}: {
  mapSrc: string;
  residenceZoneId: number | null;
  canSetResidence: boolean;
  myUserId: string | null;
  serverId: number;
  chronicle: { today: string | null; yesterday: string | null; yesterdayDay: string | null; list: { kstDay: string; headline: string }[] } | null;
  zones: Zone[];
  adjacency: { a: number; b: number }[];
  replay: ConquestReplay | null;
  replayYesterday: ConquestReplay | null;
}) {
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const router = useRouter();
  const [residence, setResidence] = useState<number | null>(residenceZoneId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 구역 팝업 복원(2026-07-21) — 집행관 프로필로 이동 후 뒤로가기 시 팝업 유지(채팅창 패턴).
  // 이동 직전 sessionStorage에 구역 id를 남기고, 마운트 시 1회 소비해 재오픈.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ig:worldmap-restore');
      if (raw != null) {
        sessionStorage.removeItem('ig:worldmap-restore');
        const id = Number(raw);
        if (Number.isInteger(id)) setSelectedId(id);
      }
    } catch {
      // sessionStorage 불가 — 복원만 생략
    }
  }, []);
  const [chronicleTab, setChronicleTab] = useState<'yesterday' | 'today' | 'full'>('today'); // 기본 오늘(2026-07-17: 어제 탭 추가)
  // '오늘의 역사' 리플레이(2026-07-16) — 재생 중엔 구역 소유 표시를 그날 아침(before) 상태로
  // 되돌려 두고, 이벤트마다 승자에게 전환(종료 상태 = 현재 DB와 동일). layer는 오버레이 전용.
  // 재생 트랙 — 'today' | 'yesterday' | null(미재생). 어제 리플레이의 최종 상태는 어제 종료
  // 시점이라, 종료/취소 시 항상 owners=null(라이브)로 복귀한다(2026-07-17 어제 탭).
  const [replayingTab, setReplayingTab] = useState<'today' | 'yesterday' | null>(null);
  const [replayOwners, setReplayOwners] = useState<Record<number, string | null> | null>(null);
  const [replayLayer, setReplayLayer] = useState<HTMLDivElement | null>(null);
  const canReplay = !!replay && !!chronicle?.today;
  const canReplayYesterday = !!replayYesterday && !!chronicle?.yesterday;
  const startReplay = (tab: 'today' | 'yesterday' = 'today') => {
    const r = tab === 'today' ? replay : replayYesterday;
    if (!r || replayingTab) return;
    setShowConquest(false);
    setChronicleTab(tab);
    setReplayOwners({ ...r.beforeOwner });
    setReplayingTab(tab);
  };
  const endReplay = () => {
    setReplayingTab(null);
    setReplayOwners(null); // 라이브 소유로 복귀(오늘=최종 상태와 동일, 어제=현재로 점프)
  };
  const replayActive = replayingTab !== null;
  // 첫 진입 자동 재생 — 그날 1회(localStorage 게이트).
  // useLayoutEffect: 소유 되감기(before 상태)를 **첫 페인트 전에** 적용 — useEffect+지연으로는
  // 최종 소유 지도가 한순간 보였다가 되감기며 깜빡였음(2026-07-16). 타이핑 시작만 600ms 지연.
  useLayoutEffect(() => {
    if (!canReplay) return;
    const key = `world-replay-seen:${serverId}`;
    if (localStorage.getItem(key) === replay!.kstDay) return;
    localStorage.setItem(key, replay!.kstDay);
    setShowConquest(false);
    setChronicleTab('today');
    setReplayOwners({ ...replay!.beforeOwner }); // 페인트 전 — 아침 상태로 시작
    const t = setTimeout(() => setReplayingTab('today'), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 우하단 스위치 — ON(기본): 노드=구역명 + 하단=역사. OFF: 노드=점령 길드명 + 하단=점령현황.
  const [showConquest, setShowConquest] = useState(false);
  const [statusTab, setStatusTab] = useState<'region' | 'ranking'>('region');
  // 세금 수금 모달 — 열린 구역 + 3초 인-버튼 컨펌.
  const [collectOpen, setCollectOpen] = useState<number | null>(null);
  const [collectNow, setCollectNow] = useState(0); // 모달 열 때 캡처한 시각(쿨다운 계산, 렌더 순수성)
  const [collectConfirm, setCollectConfirm] = useState(false);
  const [collectLeft, setCollectLeft] = useState(0);
  useEffect(() => {
    if (!collectConfirm) return;
    const id = setInterval(() => {
      setCollectLeft((s) => {
        if (s <= 1) {
          setCollectConfirm(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [collectConfirm]);
  // 행이 없으면 getChronicle가 {today:null,list:[]}를 반환 — 이 경우도 placeholder로 처리.
  const hasChronicle = !!chronicle && (chronicle.today != null || chronicle.list.length > 0);
  const hasYesterday = !!chronicle?.yesterday;

  // 연대기 {z|이름} 강조용 — 개별 구역 이름 → 그 구역의 지역색. (지역 카테고리는 색칠 안 함.)
  const zoneColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of zones) m.set(z.name, REGION[z.region].color);
    return m;
  }, [zones]);
  const zoneColor = (name: string) => zoneColorMap.get(name) ?? null;

  // 연대기 구역명 클릭 → 구역 상세 모달(이름→id). 이름은 50구역 고정이라 항상 매칭.
  const zoneIdByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const z of zones) m.set(z.name, z.id);
    return m;
  }, [zones]);
  const openZoneByName = (name: string) => {
    const id = zoneIdByName.get(name);
    if (id != null) setSelectedId(id);
  };
  // 연대기 길드명 클릭 → 길드 상세 팝업(이름으로 요약 조회).
  type GuildPopup = {
    name: string;
    level: number;
    memberCount: number;
    combat: number;
    emblemUrl: string | null;
    intro: string | null;
    joinPolicy: string;
    leaderNickname: string | null;
    leaderCode: string | null;
    zones: { name: string; region: Region }[];
  };
  const [guildPopup, setGuildPopup] = useState<GuildPopup | null>(null);
  const openGuildByName = (name: string) => {
    getGuildSummaryByNameAction(name)
      .then((r) => {
        if (r.status === 'success' && r.guild) setGuildPopup(r.guild);
      })
      .catch(() => {});
  };
  // 길드 팝업 복원(2026-07-21) — 길드장 프로필 이동 후 뒤로가기 시 팝업 재오픈(구역 팝업과 동일 패턴).
  useEffect(() => {
    try {
      const name = sessionStorage.getItem('ig:worldmap-restore-guild');
      if (name) {
        sessionStorage.removeItem('ig:worldmap-restore-guild');
        openGuildByName(name);
      }
    } catch {
      // sessionStorage 불가 — 복원만 생략
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 점령 현황(OFF 모드) — zones에서 파생. 지역별 구역 묶음 + 길드 순위(점령지 수).
  const regionGroups = useMemo(
    () => REGION_ORDER.map((rg) => ({ region: rg, zoneList: zones.filter((z) => z.region === rg) })),
    [zones],
  );
  const guildRanking = useMemo(() => {
    const m = new Map<string, { id: string; name: string; emblemUrl: string | null; count: number }>();
    for (const z of zones) {
      if (!z.ownerGuildId) continue;
      const e =
        m.get(z.ownerGuildId) ??
        { id: z.ownerGuildId, name: z.ownerGuildName ?? '길드', emblemUrl: z.ownerEmblemUrl, count: 0 };
      e.count += 1;
      m.set(z.ownerGuildId, e);
    }
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [zones]);

  // 인접 간선(길) — 좌표로 선분 산출. 선택 구역에 연결된 길은 강조.
  const edges = useMemo(() => {
    const pos = new Map(zones.map((z) => [z.id, { x: z.mapX, y: z.mapY }]));
    return adjacency
      .map(({ a, b }) => {
        const pa = pos.get(a);
        const pb = pos.get(b);
        return pa && pb ? { a, b, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y } : null;
      })
      .filter((e): e is NonNullable<typeof e> => e != null);
  }, [adjacency, zones]);

  const [pending, start] = useTransition();

  const selected = zones.find((z) => z.id === selectedId) ?? null;

  const openBattle = (zoneId: number) => {
    start(async () => {
      const r = await getZoneBattleAction(zoneId);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      if (!r.battleId) return showError('전투 기록이 없습니다.');
      router.push(`/guild/battle/${r.battleId}`);
    });
  };

  // 거주 이동 — 낙관적(즉시 반영, 서버 백그라운드). router.refresh를 transition 안에서
  // 호출하면 refresh 동안 pending이 묶여 다음 이동이 막혔음 → 제거해 연속 이동 가능.
  const moveResidence = (zoneId: number) => {
    const prev = residence;
    setResidence(zoneId); // 낙관적
    showHeaderToast({ title: '거주지 이동 완료' });
    start(async () => {
      const r = await setResidenceAction(zoneId);
      if (r.status !== 'success') {
        setResidence(prev);
        showError(guildErrMsg(r.code));
      }
    });
  };

  // 집행관 세금 수금 — 그 구역 집행관 본인만(72h 쿨다운, 집행관 10%·길드 풀 90%).
  const collect = (zoneId: number) => {
    setCollectConfirm(false);
    start(async () => {
      const r = await collectTaxAction(zoneId);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      // 지갑은 실제 본인 몫(10%)만 반영, 토스트는 총 수금액(집행관+길드 풀 90%)을 노출.
      const total = BigInt(r.executorGain) + BigInt(r.guildGain);
      optimisticAdjust(BigInt(r.executorGain));
      showHeaderToast({ title: `세금 수금 완료 ${Number(total).toLocaleString('ko-KR')}💎` });
      setCollectOpen(null);
      router.refresh();
    });
  };

  return (
    // shrink-0 필수 — 명시적 min-h-full은 flex 자동 최소치(min-content)를 대체해, main의
    // 수축이 루트를 콘텐츠보다 작게 줄이고 본문이 박스 밖으로 넘친다(채팅바 가림 원인).
    <div className="flex min-h-full shrink-0 flex-col">
      {/* 지도 + 네모 노드 오버레이 — 풀폭 플러시(좌우 여백·모서리 제거). */}
      {/* isolate — 내부 노드 zIndex(선택 30 등)가 전역 스태킹으로 새어 채팅 패널(z-20 fixed)
          위로 떠오르던 오버랩 버그 방지(2026-07-21 제보). */}
      <div className="relative isolate aspect-square w-full shrink-0 overflow-hidden border-b border-zinc-800 bg-zinc-950">
        {/* 리플레이 오버레이(2026-07-16) — 문장 진군·격돌·플래시 전용 레이어(ChronicleReplay가 직접 관리). */}
        <div ref={setReplayLayer} aria-hidden className="pointer-events-none absolute inset-0 z-40" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mapSrc}
          alt="월드맵"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        {/* 길(인접 연결선) — 좌표(0~100%)를 viewBox로 직접 매핑. 노드 아래, 클릭 통과.
            어두운 외곽선 + 따뜻한 앰버 본선(밝은·어두운 지형 모두에서 또렷). 선택 구역의 길은 강조. */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {(() => {
            const isSel = (e: { a: number; b: number }) =>
              selectedId != null && (e.a === selectedId || e.b === selectedId);
            return (
              <>
                {/* 1) 어두운 외곽 — 가독성(중간 강도) */}
                {edges.map((e) => (
                  <line
                    key={`h${e.a}-${e.b}`}
                    x1={e.x1}
                    y1={e.y1}
                    x2={e.x2}
                    y2={e.y2}
                    stroke="#000000"
                    strokeOpacity={0.32}
                    strokeWidth={isSel(e) ? 1.2 : 0.85}
                    strokeLinecap="round"
                  />
                ))}
                {/* 2) 본선 — 비선택(따뜻한 앰버, 중간 강도) */}
                {edges
                  .filter((e) => !isSel(e))
                  .map((e) => (
                    <line
                      key={`m${e.a}-${e.b}`}
                      x1={e.x1}
                      y1={e.y1}
                      x2={e.x2}
                      y2={e.y2}
                      stroke="#fcd34d"
                      strokeOpacity={0.5}
                      strokeWidth={0.5}
                      strokeLinecap="round"
                    />
                  ))}
                {/* 3) 선택 구역 길 — 강조(맨 위) */}
                {edges
                  .filter(isSel)
                  .map((e) => (
                    <line
                      key={`s${e.a}-${e.b}`}
                      x1={e.x1}
                      y1={e.y1}
                      x2={e.x2}
                      y2={e.y2}
                      stroke="#fde047"
                      strokeOpacity={0.92}
                      strokeWidth={0.85}
                      strokeLinecap="round"
                    />
                  ))}
              </>
            );
          })()}
        </svg>
        {/* 우하단 스위치 — ON: 구역명+역사 / OFF: 점령 길드명+점령현황. 현재 모드 라벨 동반. */}
        <span className="absolute bottom-2 right-2 z-30 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-1 backdrop-blur-sm">
          <span className="text-[10px] font-bold text-white/90">{showConquest ? '점령 현황' : '역사'}</span>
          <ToggleSwitch
            on={!showConquest}
            onToggle={() => setShowConquest((v) => !v)}
            small
            label="지도 표시 전환 — 켜짐: 구역명·역사 / 꺼짐: 점령 길드명·점령 현황"
          />
        </span>
        {zones.map((z) => {
          // 리플레이 중 소유 override — 아침(before) 상태에서 시작해 이벤트마다 승자로 전환.
          const rOwner = replayOwners ? (replayOwners[z.id] ?? null) : undefined;
          const owned = rOwner !== undefined ? rOwner != null : z.ownerGuildId != null;
          const activeReplay = replayingTab === 'yesterday' ? replayYesterday : replay;
          const emblemUrl =
            rOwner !== undefined
              ? rOwner != null
                ? (activeReplay?.guilds[rOwner]?.emblemUrl ?? null)
                : null
              : z.ownerEmblemUrl;
          const emblemColor =
            rOwner !== undefined
              ? rOwner != null
                ? (activeReplay?.guilds[rOwner]?.color ?? null)
                : null
              : z.ownerEmblemColor;
          const isResidence = z.id === residence;
          const color = REGION[z.region].color;
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => setSelectedId(z.id)}
              aria-label={z.name}
              // p-2: 시각 노드(17px)는 그대로 두고 투명 패딩으로 터치 히트영역 확대(~33px, 오탭 완화).
              className="absolute -translate-x-1/2 -translate-y-1/2 p-2"
              style={{
                left: `${z.mapX}%`,
                top: `${z.mapY}%`,
                zIndex: isResidence ? 20 : owned ? 10 : 1,
              }}
            >
              <span
                className="relative block h-[17px] w-[17px] overflow-hidden rounded-[4px] ring-1 ring-black/70 transition"
                style={{
                  // 점령 시: 문양 주색 반투명 배경(2026-07-16 확정 — 색 없으면 투명 유지) + 지역색 보더.
                  // 중립: 어두운 배경 + 흐린 지역색.
                  backgroundColor: owned
                    ? emblemColor
                      ? `${emblemColor}73` /* ~45%(2026-07-16 상향) */
                      : 'transparent'
                    : 'rgba(10,12,20,0.45)',
                  boxShadow: owned ? `0 0 4px ${color}88` : 'none',
                  outline: `1px solid ${color}${owned ? '' : '88'}`,
                  // 0: 색상 보더를 요소 가장자리에 붙여 배경↔보더 빈공간 제거(배경이 보더까지 꽉 참).
                  outlineOffset: 0,
                }}
              >
                {/* 점령 길드 문양(있으면) — 리플레이 중엔 override 소유 길드의 문양 */}
                {owned && emblemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={emblemUrl}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : null}
              </span>
              {/* 내 위치 — 네모 상단에 둥둥 떠 있는 amber 핀(부유 + 글로우 펄스) */}
              {isResidence && (
                <span className="pointer-events-none absolute bottom-full left-1/2 -mb-1 -translate-x-1/2">
                  <span className="block animate-marker-bob">
                    <span
                      className="relative block h-[11px] w-[11px] border-[1.5px] border-white animate-marker-pin-glow"
                      style={{
                        background: 'linear-gradient(135deg, #fcd34d, #f59e0b)',
                        borderRadius: '50% 50% 50% 0',
                        transform: 'rotate(-45deg)',
                      }}
                    >
                      <span className="absolute left-1/2 top-1/2 h-[3.5px] w-[3.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                    </span>
                  </span>
                </span>
              )}
              {/* 노드 라벨 — ON: 구역명 / OFF: 점령 길드명(중립은 라벨 없음). 네모칸 바로 아래(p-2 보정), 클릭 통과 */}
              {(showConquest ? z.ownerGuildName : z.name) && (
                <span
                  className="pointer-events-none absolute left-1/2 top-full -mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/70 px-0.5 text-[5px] font-bold leading-[1.4] shadow-[0_1px_2px_rgba(0,0,0,0.75)]"
                  style={{ color: showConquest ? '#fff' : color }} // 점령현황(길드명)은 지역색 제거 → 흰색
                >
                  {showConquest ? z.ownerGuildName : z.name}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 거주지 미설정 코치 — 보통 가입 시 랜덤 배정되나, 미설정 상태면 설정을 유도(세금 기여 동선). */}
      {residence == null && (
        <div className="mx-4 mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-[12px] text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300">
          <p className="font-bold">거주지를 정하세요</p>
        </div>
      )}

      {/* 세계 연대기 — 점령전 발표(KST 자정)와 함께 매일 AI 갱신(큰 사건 있는 날만). [오늘]=긴 기록 / [전체]=날짜별 한 줄.
          남은 세로 영역을 가득 채우되 flex-auto(basis auto) — flex-1(basis 0)은 긴 본문이
          루트 intrinsic 높이에 반영되지 않아 텍스트가 루트 밖으로 넘치고, 채팅 미니바
          회피 스페이서가 본문 중간에 배치돼 하단이 가려졌다(2026-07-21 재현·확정). */}
      <section className="flex flex-auto flex-col bg-white px-4 pb-4 pt-3 dark:bg-zinc-950">
        {!showConquest ? (
          <>
        {hasChronicle ? (
          <div className="mb-2 flex items-center justify-between gap-1.5">
            {/* 다시 보기 — 왼쪽 끝, 이모지 없음(2026-07-16 확정). 미노출 시에도 우측 탭 정렬 유지용 스페이서. */}
            {!replayActive &&
            ((chronicleTab === 'today' && canReplay) || (chronicleTab === 'yesterday' && canReplayYesterday)) ? (
              <button
                type="button"
                onClick={() => startReplay(chronicleTab === 'yesterday' ? 'yesterday' : 'today')}
                className="rounded-lg border border-zinc-200 px-2 py-0.5 text-[11px] font-bold text-zinc-500 active:opacity-60 dark:border-zinc-800 dark:text-zinc-400"
              >
                다시 보기
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
              {(
                [
                  ...(hasYesterday ? ([['yesterday', '어제']] as const) : []),
                  ['today', '오늘'],
                  ['full', '전체'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (replayActive) endReplay(); // 재생 중 탭 이동 = 자동 완료(라이브 상태 확정)
                    setChronicleTab(k);
                  }}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                    chronicleTab === k
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                      : 'text-zinc-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {hasChronicle ? (
          chronicleTab === 'yesterday' ? (
            replayingTab === 'yesterday' && replayYesterday && chronicle!.yesterday ? (
              <ChronicleReplayPanel
                key={`replay-y-${replayYesterday.kstDay}`}
                text={chronicle!.yesterday}
                replay={replayYesterday}
                zones={zones.map((z) => ({ id: z.id, name: z.name, mapX: z.mapX, mapY: z.mapY }))}
                layer={replayLayer}
                zoneColor={zoneColor}
                onOwnerFlip={(zoneId, guild) => setReplayOwners((m) => ({ ...(m ?? {}), [zoneId]: guild }))}
                onDone={endReplay}
              />
            ) : chronicle!.yesterday ? (
              <div className="flex flex-col gap-2.5">
                {chronicle!.yesterday.split(/\n{2,}/).map((para, idx) => (
                  <p
                    key={idx}
                    className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300"
                  >
                    <ChronicleText
                      serverId={serverId}
                      text={para.trim()}
                      zoneColor={zoneColor}
                      onGuild={openGuildByName}
                      onZone={openZoneByName}
                    />
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-zinc-400">이전 기록이 없습니다.</p>
            )
          ) : chronicleTab === 'today' ? (
            chronicle!.today ? (
              replayingTab === 'today' && replay ? (
                <ChronicleReplayPanel
                  key={`replay-${replay.kstDay}`}
                  text={chronicle!.today}
                  replay={replay}
                  zones={zones.map((z) => ({ id: z.id, name: z.name, mapX: z.mapX, mapY: z.mapY }))}
                  layer={replayLayer}
                  zoneColor={zoneColor}
                  onOwnerFlip={(zoneId, guild) => setReplayOwners((m) => ({ ...(m ?? {}), [zoneId]: guild }))}
                  onDone={endReplay}
                />
              ) : (
              <div className="flex flex-col gap-2.5">
                {chronicle!.today.split(/\n{2,}/).map((para, idx) => (
                  <p
                    key={idx}
                    className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300"
                  >
                    <ChronicleText
                      serverId={serverId}
                      text={para.trim()}
                      zoneColor={zoneColor}
                      onGuild={openGuildByName}
                      onZone={openZoneByName}
                    />
                  </p>
                ))}
              </div>
              )
            ) : (
              <p className="text-[13px] leading-relaxed text-zinc-400">
                오늘은 기록된 역사가 없습니다. [전체]에서 지난 기록을 확인하세요.
              </p>
            )
          ) : chronicle!.list.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-zinc-400">
              아직 대륙의 정세를 뒤흔든 큰 사건은 없었습니다. 판도가 바뀌는 날, 이곳에 기록됩니다.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
              {chronicle!.list.map((e) => (
                <li key={e.kstDay} className="flex gap-2.5 py-2 text-[13px] leading-relaxed">
                  <span className="shrink-0 pt-px font-mono text-[11px] tabular-nums text-zinc-400">
                    {e.kstDay.replace(/-/g, '.')}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-300">
                    <ChronicleText
                      serverId={serverId}
                      text={e.headline}
                      zoneColor={zoneColor}
                      onGuild={openGuildByName}
                      onZone={openZoneByName}
                    />
                  </span>
                </li>
              ))}
              {/* 로어 마감 — 더 오래된 기록은 소실됨을 암시. */}
              <li className="pt-3 text-center text-[11px] italic leading-relaxed text-zinc-400 dark:text-zinc-600">
                그 이전의 기록은 세월에 바래어, 이제는 아무도 알지 못한다.
              </li>
            </ul>
          )
        ) : (
          <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
            첫 전쟁의 불길이 일면, 그 역사가 기록될 것입니다.
          </p>
        )}
          </>
        ) : (
          <>
            {/* 점령 현황(OFF) — 지역 현황 / 길드 순위 탭(역사와 동일 구조). zones에서 파생. */}
            <div className="mb-2 flex justify-end">
              <div className="flex gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
                {(
                  [
                    ['region', '지역 현황'],
                    ['ranking', '길드 순위'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setStatusTab(k)}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition ${
                      statusTab === k
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                        : 'text-zinc-500'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {statusTab === 'region' ? (
              <div className="flex flex-col gap-3">
                {regionGroups.map(({ region, zoneList }) => (
                  <div key={region}>
                    <p className="mb-1 text-[12px] font-bold" style={{ color: REGION[region].color }}>
                      {REGION[region].label}{' '}
                      <span className="font-mono text-[10px] tabular-nums text-zinc-400">
                        {zoneList.filter((z) => z.ownerGuildId).length}/{zoneList.length}
                      </span>
                    </p>
                    <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                      {zoneList.map((z) => (
                        <li key={z.id} className="flex items-baseline justify-between gap-1 text-[11px]">
                          <span className="truncate text-zinc-500">{z.name}</span>
                          <span
                            className={`flex max-w-[55%] shrink-0 items-center gap-0.5 font-semibold ${
                              z.ownerGuildName
                                ? 'text-zinc-700 dark:text-zinc-300'
                                : 'text-zinc-300 dark:text-zinc-600'
                            }`}
                          >
                            {z.ownerGuildId && z.ownerEmblemUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={z.ownerEmblemUrl}
                                alt=""
                                aria-hidden
                                className="h-3 w-3 shrink-0"
                                style={{ imageRendering: 'pixelated' }}
                              />
                            ) : null}
                            <span className="truncate">{z.ownerGuildName ?? '중립'}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : guildRanking.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-zinc-400">
                아직 구역을 점령한 길드가 없습니다.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
                {guildRanking.map((g, i) => (
                  <li key={g.id} className="flex items-center gap-2.5 py-2 text-[13px]">
                    <span className="w-5 shrink-0 text-center font-bold tabular-nums text-zinc-400">
                      {i + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 items-center gap-1 font-semibold text-zinc-700 dark:text-zinc-200">
                      {g.emblemUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={g.emblemUrl}
                          alt=""
                          aria-hidden
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : null}
                      <span className="truncate">{g.name}</span>
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-amber-600 dark:text-amber-400">
                      {g.count}곳
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* 구역 상세 모달 */}
      {selected && (
        <ModalShell
          onClose={() => setSelectedId(null)}
          label={`${selected.name} 구역 정보`}
          className="max-h-[85vh] w-full max-w-[340px] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-950"
        >
            {/* 헤더 — 지역(6종) 배경 + 지역이름 + 전투보기 */}
            <div
              className="relative h-20 w-full"
              style={{ background: `linear-gradient(135deg, ${REGION[selected.region].color}, #0b0e16)` }}
            >
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${assetUrl(`/sprites/guild/region/${selected.region}.png`)})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
              <div className="relative flex h-full items-end justify-between gap-2 p-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                    {selected.name}
                  </h2>
                  <p className="truncate text-[10px] text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                    {ZONE_LORE[selected.id]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openBattle(selected.id)}
                  disabled={pending}
                  className="shrink-0 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/30 backdrop-blur-sm disabled:opacity-50"
                >
                  전투 기록
                </button>
              </div>
            </div>

            <div className="px-4 pb-4 pt-3">
              <dl className="space-y-1 text-[12px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-500">소유 길드</dt>
                  <dd className="flex min-w-0 items-center gap-1.5 font-semibold">
                    {selected.ownerGuildName ? (
                      <>
                        {selected.ownerEmblemUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selected.ownerEmblemUrl}
                            alt=""
                            aria-hidden
                            className="h-4 w-4 shrink-0 object-contain"
                            style={{ imageRendering: 'pixelated' }}
                          />
                        )}
                        <span className="truncate">{selected.ownerGuildName}</span>
                      </>
                    ) : (
                      <span className="text-zinc-400">중립</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">집행관</dt>
                  <dd className="font-semibold">
                    {selected.executorNickname ? (
                      selected.executorCode ? (
                        // 프로필 이동 — 복원 키를 남겨 뒤로가기 시 이 팝업이 다시 열린다.
                        <Link
                          prefetch={false}
                          href={profileHref(selected.executorCode, serverId)}
                          onClick={() => {
                            try {
                              sessionStorage.setItem('ig:worldmap-restore', String(selected.id));
                            } catch {
                              // 저장 실패 시 복원만 생략
                            }
                          }}
                          className="text-indigo-500 underline decoration-dotted underline-offset-2 dark:text-indigo-400"
                        >
                          {selected.executorNickname}
                        </Link>
                      ) : (
                        <span className="text-indigo-500 dark:text-indigo-400">{selected.executorNickname}</span>
                      )
                    ) : (
                      <span className="text-zinc-400">공석</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">거주 인원</dt>
                  <dd className="font-mono tabular-nums">{selected.residentCount.toLocaleString('ko-KR')}명</dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-zinc-500">
                    누적 세금
                    {/* 수금 — 그 구역 집행관 본인만(라벨 오른쪽 작은 버튼).
                        쿨다운 중엔 비활성 + ⏳ HH:MM 타이머(2026-07-21 문의 반영). */}
                    {myUserId != null &&
                      selected.executorUserId === myUserId &&
                      (() => {
                        const end =
                          selected.lastTaxAt != null
                            ? selected.lastTaxAt + TAX_COLLECT_COOLDOWN_MIN * 60_000
                            : 0;
                        const remMs = end - Date.now();
                        if (remMs > 0) {
                          const h = Math.floor(remMs / 3_600_000);
                          const m = Math.floor((remMs % 3_600_000) / 60_000);
                          return (
                            <button
                              type="button"
                              disabled
                              className="rounded-md border border-zinc-300 bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-bold text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-500"
                            >
                              ⏳ {h}:{String(m).padStart(2, '0')}
                            </button>
                          );
                        }
                        return (
                          <button
                            type="button"
                            onClick={() => {
                              setCollectConfirm(false);
                              setCollectNow(Date.now());
                              setCollectOpen(selected.id);
                            }}
                            className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white active:opacity-80"
                          >
                            수금
                          </button>
                        );
                      })()}
                  </dt>
                  <dd className="font-mono tabular-nums">💎{selected.taxDiamond}</dd>
                </div>
                {/* 다음 수금 — 쿨다운 남은 시간(모두에게 표시, 2026-07-21 문의 채택안 B).
                    소유 길드가 있을 때만(중립지는 수금 개념 없음). 시각은 절대 시각 병기. */}
                {selected.ownerGuildId != null && (
                  <div className="flex justify-between">
                    <dt className="text-zinc-500">다음 수금</dt>
                    <dd className="font-semibold">
                      {(() => {
                        const end =
                          selected.lastTaxAt != null
                            ? selected.lastTaxAt + TAX_COLLECT_COOLDOWN_MIN * 60_000
                            : 0;
                        const remMs = end - Date.now();
                        if (remMs <= 0)
                          return <span className="text-emerald-600 dark:text-emerald-400">즉시 가능</span>;
                        const remH = Math.ceil(remMs / 3_600_000);
                        const rem = remH >= 1 ? `${remH}시간 후` : `${Math.max(1, Math.ceil(remMs / 60_000))}분 후`;
                        const d = new Date(end);
                        const kst = new Intl.DateTimeFormat('ko-KR', {
                          timeZone: 'Asia/Seoul',
                          month: 'numeric',
                          day: 'numeric',
                          hour: 'numeric',
                        }).format(d);
                        return (
                          <span className="text-zinc-600 dark:text-zinc-300">
                            {rem} 가능 <span className="font-normal text-zinc-400">({kst})</span>
                          </span>
                        );
                      })()}
                    </dd>
                  </div>
                )}
              </dl>

            {canSetResidence &&
              (selected.id === residence ? (
                // 현재 위치 — '이동' 버튼과 동일 크기(레이아웃 시프트 방지)
                <button
                  type="button"
                  disabled
                  className="mt-3 w-full cursor-default rounded-lg bg-amber-500/15 py-2.5 text-sm font-bold text-amber-700 dark:text-amber-300"
                >
                  현재 위치
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => moveResidence(selected.id)}
                  disabled={pending}
                  className="mt-3 w-full rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  이동
                </button>
              ))}

              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="mt-3 w-full py-1.5 text-[11px] text-zinc-500"
              >
                닫기
              </button>
            </div>
        </ModalShell>
      )}

      {/* 세금 수금 모달 — 길드 90% / 집행관 10%, 3초 컨펌, 쿨다운 안내 */}
      {collectOpen != null &&
        (() => {
          const cz = zones.find((z) => z.id === collectOpen);
          if (!cz) return null;
          const tax = Number(cz.taxDiamond);
          const execCut = Math.floor(tax * GUILD_EXECUTOR_TAX_CUT);
          const guildCut = tax - execCut;
          const cdEnd = cz.lastTaxAt != null ? cz.lastTaxAt + TAX_COLLECT_COOLDOWN_MIN * 60_000 : 0;
          const remMs = cdEnd - collectNow;
          const onCd = remMs > 0;
          const hh = Math.floor(remMs / 3_600_000);
          const mm = Math.floor((remMs % 3_600_000) / 60_000);
          const close = () => {
            setCollectOpen(null);
            setCollectConfirm(false);
          };
          return (
            <ModalShell
              onClose={close}
              label={`${cz.name} 세금 수금`}
              className="w-full max-w-[260px] rounded-2xl bg-white p-4 dark:bg-zinc-950"
            >
                <h2 className="text-sm font-bold">{cz.name} 세금 수금</h2>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-zinc-100 py-2 dark:bg-zinc-900">
                    <p className="text-[10px] text-zinc-400">길드 90%</p>
                    <p className="font-mono text-[13px] font-bold text-emerald-600 dark:text-emerald-400">
                      💎 {guildCut.toLocaleString('ko-KR')}
                    </p>
                  </div>
                  <div className="rounded-lg bg-zinc-100 py-2 dark:bg-zinc-900">
                    <p className="text-[10px] text-zinc-400">집행관 10%</p>
                    <p className="font-mono text-[13px] font-bold text-indigo-500 dark:text-indigo-400">
                      💎 {execCut.toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>

                {onCd ? (
                  <p className="mt-3 rounded-lg bg-zinc-100 py-2 text-center text-[12px] font-semibold text-zinc-500 dark:bg-zinc-900">
                    {hh > 0 ? `${hh}시간 ` : ''}{mm}분 후 수금 가능
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (collectConfirm) {
                        collect(cz.id);
                      } else {
                        setCollectLeft(3);
                        setCollectConfirm(true);
                      }
                    }}
                    disabled={pending || tax <= 0}
                    className={`relative isolate mt-3 w-full overflow-hidden rounded-lg py-2 text-sm font-bold text-white transition-colors disabled:opacity-50 ${
                      collectConfirm ? 'bg-emerald-700' : 'bg-emerald-600'
                    }`}
                  >
                    {collectConfirm && (
                      <span
                        aria-hidden
                        className="absolute inset-0 bg-emerald-500"
                        style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
                      />
                    )}
                    <span className="relative">{collectConfirm ? `수금 ${collectLeft}s` : '수금'}</span>
                  </button>
                )}
                <button type="button" onClick={close} className="mt-1.5 w-full py-1 text-[11px] text-zinc-500">
                  닫기
                </button>
            </ModalShell>
          );
        })()}

      {/* 길드 상세 팝업 — 연대기 길드명 클릭 시(이름으로 요약 조회) */}
      {guildPopup && (
        <ModalShell
          onClose={() => setGuildPopup(null)}
          label={`${guildPopup.name} 길드 정보`}
          className="w-full max-w-[320px] rounded-2xl bg-white p-4 dark:bg-zinc-950"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl">
              {guildPopup.emblemUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={guildPopup.emblemUrl}
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
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-base font-bold">{guildPopup.name}</h2>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    guildPopup.joinPolicy === 'open'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                  }`}
                >
                  {guildPopup.joinPolicy === 'open' ? '자유' : '승인'}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Lv.{guildPopup.level} · {guildPopup.memberCount}명 · 전투력{' '}
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {guildPopup.combat.toLocaleString('ko-KR')}
                </span>
              </p>
              {guildPopup.leaderNickname ? (
                <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                  길드장{' '}
                  {guildPopup.leaderCode ? (
                    // 프로필 이동 — 복원 키(길드명)를 남겨 뒤로가기 시 이 팝업이 다시 열린다.
                    <Link
                      prefetch={false}
                      href={profileHref(guildPopup.leaderCode, serverId)}
                      onClick={() => {
                        try {
                          sessionStorage.setItem('ig:worldmap-restore-guild', guildPopup.name);
                        } catch {
                          // 저장 실패 시 복원만 생략
                        }
                      }}
                      className="font-semibold text-indigo-500 underline decoration-dotted underline-offset-2 dark:text-indigo-400"
                    >
                      {guildPopup.leaderNickname}
                    </Link>
                  ) : (
                    <span className="font-semibold">{guildPopup.leaderNickname}</span>
                  )}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-900">
            <p className="text-[11px] font-bold text-zinc-400">점령 구역 ({guildPopup.zones.length})</p>
            {guildPopup.zones.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {guildPopup.zones.map((z) => (
                  <span
                    key={z.name}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${REGION_META[z.region].chip}`}
                  >
                    {z.name}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-[12px] text-zinc-500">점령한 구역이 없습니다.</p>
            )}
          </div>
          <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-900">
            <p className="text-[11px] font-bold text-zinc-400">길드 소개</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {guildPopup.intro?.trim() ? guildPopup.intro : '등록된 소개가 없습니다.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGuildPopup(null)}
            className="mt-4 w-full rounded-lg bg-zinc-100 py-2.5 text-sm font-bold text-zinc-700 active:opacity-70 dark:bg-zinc-800 dark:text-zinc-200"
          >
            닫기
          </button>
        </ModalShell>
      )}
    </div>
  );
}
