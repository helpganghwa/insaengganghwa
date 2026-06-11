'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { josa } from 'es-hangul';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { assetUrl } from '@/lib/asset-versions';
import { GUILD_EXECUTOR_TAX_CUT, TAX_COLLECT_COOLDOWN_MIN } from '@/lib/game/guild/balance';

import { setResidenceAction, getZoneBattleAction, collectTaxAction } from '../actions';
import { guildErrMsg } from '../errors-msg';

import { ZONE_LORE } from '@/lib/game/guild/zone-lore';

type Region = 'volcano' | 'temple' | 'swamp' | 'orc' | 'kingdom' | 'angel';

type Zone = {
  id: number;
  region: Region;
  name: string;
  mapX: number;
  mapY: number;
  ownerGuildId: string | null;
  ownerGuildName: string | null;
  ownerEmblemUrl: string | null;
  executorUserId: string | null;
  executorNickname: string | null;
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
// \}+ — AI가 닫는 중괄호를 겹쳐 쓰는 경우({z|왕성}}) 여분까지 흡수.
const CHRONICLE_TOKEN_RE = /\{([guz])\|([^}]+)\}+/g;

// 마커 직후 조사 보정용 — AI가 쓴 한쪽 조사를 이름 받침에 맞게 교정(은↔는 등).
// 긴 조사부터 검사(으로부터>로>... 접두 충돌 방지). es-hangul josa.pick으로 정확 산출.
const JOSA_PARTICLES: { p: string; pair: Parameters<typeof josa>[1] }[] = [
  { p: '으로부터', pair: '으로부터/로부터' }, { p: '로부터', pair: '으로부터/로부터' },
  { p: '으로서', pair: '으로서/로서' }, { p: '로서', pair: '으로서/로서' },
  { p: '으로써', pair: '으로써/로써' }, { p: '로써', pair: '으로써/로써' },
  { p: '이에요', pair: '이에요/예요' }, { p: '예요', pair: '이에요/예요' },
  { p: '이란', pair: '이란/란' }, { p: '란', pair: '이란/란' },
  { p: '이랑', pair: '이랑/랑' }, { p: '랑', pair: '이랑/랑' },
  { p: '이나', pair: '이나/나' }, { p: '나', pair: '이나/나' },
  { p: '이라', pair: '이라/라' }, { p: '라', pair: '이라/라' },
  { p: '으로', pair: '으로/로' }, { p: '로', pair: '으로/로' },
  { p: '은', pair: '은/는' }, { p: '는', pair: '은/는' },
  { p: '이', pair: '이/가' }, { p: '가', pair: '이/가' },
  { p: '을', pair: '을/를' }, { p: '를', pair: '을/를' },
  { p: '와', pair: '와/과' }, { p: '과', pair: '와/과' },
  { p: '아', pair: '아/야' }, { p: '야', pair: '아/야' },
];

/** 마커(name) 직후 텍스트(after)의 선두 조사를 이름 받침에 맞게 교정. 교정 조사 + 소비 길이 반환(없으면 null). */
function fixLeadingJosa(name: string, after: string): { josa: string; len: number } | null {
  for (const { p, pair } of JOSA_PARTICLES) {
    if (!after.startsWith(p)) continue;
    // 조사 뒤가 한글 음절이면 단어 일부일 수 있어 보정 안 함(공백·문장부호·끝만 조사로 인정).
    const next = after[p.length];
    if (next !== undefined && /[가-힣]/.test(next)) return null;
    return { josa: josa.pick(name, pair), len: p.length };
  }
  return null;
}

function ChronicleText({ text, zoneColor }: { text: string; zoneColor: (name: string) => string | null }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  CHRONICLE_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CHRONICLE_TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) out.push(<span key={key++}>{text.slice(last, m.index)}</span>);
    const type = m[1];
    const name = m[2];
    if (type === 'g') {
      // 길드 — 색으로만 구분(굵기·스타일 없음). 지역색·유저(핑크)와 겹치지 않는 중성 회청(슬레이트).
      out.push(
        <span key={key++} className="text-slate-600 dark:text-slate-400">
          {name}
        </span>,
      );
    } else if (type === 'u') {
      // 인물 — 차분한 웜 그레이(스톤) + 밑줄 + 클릭 시 프로필 상세(/u/[nickname]). 길드(쿨 슬레이트)와 톤 구분.
      out.push(
        <Link
          key={key++}
          href={`/u/${encodeURIComponent(name)}`}
          className="text-stone-500 underline decoration-stone-400/60 underline-offset-2 dark:text-stone-400"
        >
          {name}
        </Link>,
      );
    } else {
      // 구역 — 지도 노드처럼 지역색 배경 칩(옅은 채움 + 얇은 테두리). 본문보다 2px 작게(13→11px).
      const c = zoneColor(name);
      out.push(
        <strong
          key={key++}
          className="mx-px rounded-[3px] px-1 align-baseline text-[11px] font-semibold"
          style={
            c
              ? { color: c, backgroundColor: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}55` }
              : undefined
          }
        >
          {name}
        </strong>,
      );
    }
    last = m.index + m[0].length;
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

const REGION: Record<Region, { label: string; color: string }> = {
  volcano: { label: '드래곤 화산', color: '#ef4444' },
  temple: { label: '잊힌 신전', color: '#60a5fa' },
  swamp: { label: '슬라임 늪', color: '#22c55e' },
  orc: { label: '오크 부락', color: '#f97316' },
  kingdom: { label: '왕국', color: '#fbbf24' },
  angel: { label: '타락 천사 부유섬', color: '#c084fc' },
};


export function WorldMapView({
  mapSrc,
  residenceZoneId,
  canSetResidence,
  myUserId,
  chronicle,
  zones,
  adjacency,
}: {
  mapSrc: string;
  residenceZoneId: number | null;
  canSetResidence: boolean;
  myUserId: string | null;
  chronicle: { today: string | null; list: { kstDay: string; headline: string }[] } | null;
  zones: Zone[];
  adjacency: { a: number; b: number }[];
}) {
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const router = useRouter();
  const [residence, setResidence] = useState<number | null>(residenceZoneId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showNames, setShowNames] = useState(true);
  const [chronicleTab, setChronicleTab] = useState<'today' | 'full'>('today');
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

  // 연대기 {z|이름} 강조용 — 개별 구역 이름 → 그 구역의 지역색. (지역 카테고리는 색칠 안 함.)
  const zoneColorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of zones) m.set(z.name, REGION[z.region].color);
    return m;
  }, [zones]);
  const zoneColor = (name: string) => zoneColorMap.get(name) ?? null;

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
      optimisticAdjust(BigInt(r.executorGain));
      showHeaderToast({ title: `세금 수금 +${Number(r.executorGain).toLocaleString('ko-KR')}💎` });
      setCollectOpen(null);
      router.refresh();
    });
  };



  return (
    <div className="flex min-h-full flex-col">
      {/* 지도 + 네모 노드 오버레이 — 풀폭 플러시(좌우 여백·모서리 제거). */}
      <div className="relative aspect-square w-full shrink-0 overflow-hidden border-b border-zinc-800 bg-zinc-950">
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
        {/* 지역 이름 오버레이 토글 — 텍스트 없이 스위치만(우하단). */}
        <span className="absolute bottom-2 right-2 z-30 inline-flex rounded-full bg-black/45 p-1 backdrop-blur-sm">
          <ToggleSwitch on={showNames} onToggle={() => setShowNames((v) => !v)} small label="지역 이름 표시" />
        </span>
        {zones.map((z) => {
          const owned = z.ownerGuildId != null;
          const isResidence = z.id === residence;
          const color = REGION[z.region].color;
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => setSelectedId(z.id)}
              aria-label={z.name}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${z.mapX}%`,
                top: `${z.mapY}%`,
                zIndex: isResidence ? 20 : owned ? 10 : 1,
              }}
            >
              <span
                className="relative block h-[17px] w-[17px] overflow-hidden rounded-[4px] ring-1 ring-black/70 transition"
                style={{
                  // 점령 시: 배경 투명(문양만) + 얇은 지역색 보더. 중립: 어두운 배경 + 흐린 지역색.
                  backgroundColor: owned ? 'transparent' : 'rgba(10,12,20,0.45)',
                  boxShadow: owned ? `0 0 4px ${color}88` : 'none',
                  outline: `1px solid ${color}${owned ? '' : '88'}`,
                  // 0: 색상 보더를 요소 가장자리에 붙여 배경↔보더 빈공간 제거(배경이 보더까지 꽉 참).
                  outlineOffset: 0,
                }}
              >
                {/* 점령 길드 문양(있으면) */}
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
              {/* 내 위치 — 네모 상단에 둥둥 떠 있는 amber 핀(부유 + 글로우 펄스) */}
              {isResidence && (
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2">
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
              {/* 지역 이름 라벨(토글 시) — 노드 하단, 지역색 텍스트, 클릭 통과 */}
              {showNames && (
                <span
                  className="pointer-events-none absolute left-1/2 top-full mt-[2px] -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/70 px-0.5 text-[5px] font-bold leading-[1.4] shadow-[0_1px_2px_rgba(0,0,0,0.75)]"
                  style={{ color }}
                >
                  {z.name}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 세계 연대기 — 점령전 발표(KST 12:00)와 함께 매일 AI 갱신(큰 사건 있는 날만). [오늘]=긴 기록 / [전체]=날짜별 한 줄.
          남은 세로 영역을 가득 채워(flex-1) 페이지에 빈 공간이 없게. */}
      <section className="flex flex-1 flex-col bg-white px-4 pb-4 pt-3 dark:bg-zinc-950">
        {hasChronicle ? (
          <div className="mb-2 flex justify-end">
            <div className="flex gap-0.5 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
              {(
                [
                  ['today', '오늘'],
                  ['full', '전체'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setChronicleTab(k)}
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
          chronicleTab === 'today' ? (
            chronicle!.today ? (
              <div className="flex flex-col gap-2.5">
                {chronicle!.today.split(/\n{2,}/).map((para, idx) => (
                  <p
                    key={idx}
                    className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300"
                  >
                    <ChronicleText text={para.trim()} zoneColor={zoneColor} />
                  </p>
                ))}
              </div>
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
                    <ChronicleText text={e.headline} zoneColor={zoneColor} />
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
      </section>

      {/* 구역 상세 모달 */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-[340px] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
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
                      <span className="text-indigo-500 dark:text-indigo-400">{selected.executorNickname}</span>
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
                    {/* 수금 — 그 구역 집행관 본인만(라벨 오른쪽 작은 버튼) */}
                    {myUserId != null && selected.executorUserId === myUserId && (
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
                    )}
                  </dt>
                  <dd className="font-mono tabular-nums">💎 {selected.taxDiamond}</dd>
                </div>
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
          </div>
        </div>
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
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
              onClick={close}
            >
              <div
                className="w-full max-w-[260px] rounded-2xl bg-white p-4 dark:bg-zinc-950"
                onClick={(e) => e.stopPropagation()}
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
                    <span className="relative">{collectConfirm ? `한번 더 ${collectLeft}s` : '수금'}</span>
                  </button>
                )}
                <button type="button" onClick={close} className="mt-1.5 w-full py-1 text-[11px] text-zinc-500">
                  닫기
                </button>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
