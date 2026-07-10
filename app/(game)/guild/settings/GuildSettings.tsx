'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { DistributeBoard } from '../distribute/DistributeBoard';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import { ModalShell } from '@/components/ModalShell';
import {
  GUILD_EMBLEM_REROLL_COST_DIAMOND,
  GUILD_INTRO_MAX_LEN,
  GUILD_NOTICE_MAX_LEN,
  MAX_GUILD_EMBLEMS,
  type GuildJoinPolicy,
} from '@/lib/game/guild/balance';
import type { EmblemSelection } from '@/lib/game/guild/emblem-vocab';

import {
  setActiveEmblemAction,
  deleteEmblemAction,
  setJoinPolicyAction,
  setGuildNoticeAction,
  setGuildIntroAction,
  setGuildOpenchatAction,
  approveJoinAction,
  rejectJoinAction,
  disbandGuildAction,
  setViceAction,
  kickMemberAction,
  transferLeadershipAction,
} from '../actions';
import { EmblemPicker, DEFAULT_EMBLEM } from '../EmblemPicker';
import { guildErrMsg } from '../errors-msg';

type Role = 'leader' | 'vice' | 'member';
type JoinRequest = { userId: string; nickname: string };
type MemberLite = { userId: string; nickname: string; role: Role };
type SettingsView = {
  name: string;
  taxPool: string;
  joinPolicy: GuildJoinPolicy;
  notice: string;
  intro: string;
  openchatUrl: string;
  emblemUrl: string | null;
  emblemColor: string | null;
};
type EmblemItem = { id: string; emblemUrl: string | null; emblemColor: string | null; isActive: boolean };

// 통일 버튼 스타일 — 모두 rounded-lg. 섹션 주버튼(primary/ghost) + 가입신청 인라인(smPrimary/smNeutral).
// 구성원 액션은 색버튼 나열 대신 ⋯ 액션시트로 모음(아래 actionMember).
const BTN = {
  primary: 'rounded-lg bg-amber-600 px-3.5 py-1.5 text-[12px] font-bold text-white active:opacity-90 disabled:opacity-40',
  ghost: 'rounded-lg px-3 py-1.5 text-[12px] font-semibold text-zinc-500 disabled:opacity-50',
  smPrimary: 'rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50',
  smNeutral:
    'rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300',
} as const;

export function GuildSettings({
  guild,
  emblems,
  joinRequests,
  members,
  myUserId,
  myRole,
}: {
  guild: SettingsView;
  emblems: EmblemItem[];
  joinRequests: JoinRequest[];
  members: MemberLite[];
  myUserId: string;
  myRole: Role;
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamond();
  const [pending, start] = useTransition();
  const [genOpen, setGenOpen] = useState(false);
  const [genPending, setGenPending] = useState(false); // 낙관적 '생성 중' 슬롯
  const [genStartMs, setGenStartMs] = useState<number | null>(null); // 생성 시작시각(경과 표시)
  const [nowMs, setNowMs] = useState<number | null>(null); // 라이브 클럭(마운트 후 — 하이드레이션 안전)
  // 문양 사용/삭제 3초 인-버튼 컨펌(만료 자동 해제) — { action, id } + 남은 초.
  const [armed, setArmed] = useState<{ action: 'use' | 'del'; id: string } | null>(null);
  const [armedLeft, setArmedLeft] = useState(0);
  const [genConfirm, setGenConfirm] = useState(false); // 생성 3초 인-버튼 컨펌
  const [genConfirmLeft, setGenConfirmLeft] = useState(0);

  // 생성 버튼 3초 컨펌(만료 자동 해제) — 남은 초 표기.
  useEffect(() => {
    if (!genConfirm) return;
    const id = setInterval(() => {
      setGenConfirmLeft((s) => {
        if (s <= 1) {
          setGenConfirm(false);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [genConfirm]);

  // 생성 중이면 1초마다 라이브 클럭 갱신(경과 시간 표시).
  useEffect(() => {
    if (!genPending) return;
    const tick = () => setNowMs(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [genPending]);

  // 생성 경과 시간 — 시작시각 대비. 마운트 전(nowMs null)엔 미표시(하이드레이션 안전).
  const genElapsedSec =
    genStartMs != null && nowMs != null ? Math.max(0, Math.floor((nowMs - genStartMs) / 1000)) : null;
  const genElapsedText =
    genElapsedSec == null
      ? null
      : genElapsedSec < 60
        ? `${genElapsedSec}초`
        : `${Math.floor(genElapsedSec / 60)}분 ${genElapsedSec % 60}초`;

  // 사용/삭제 버튼 3초 컨펌(만료 자동 해제) — 남은 초 표기.
  useEffect(() => {
    if (!armed) return;
    const id = setInterval(() => {
      setArmedLeft((s) => {
        if (s <= 1) {
          setArmed(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [armed]);
  const isArmed = (action: 'use' | 'del', id: string) => armed?.action === action && armed?.id === id;

  // 생성중 상태 영속 — 생성은 수십초 걸려 재진입 시 로컬 genPending이 사라지는 문제.
  // localStorage에 시작시각·기준 문양수 저장 → 재진입/타임아웃에도 '생성중' 유지. 새 문양 도착(개수 증가)
  // 또는 TTL(3분) 경과 시 자동 정리. (단일 기기 길드장 액션이라 브라우저 영속으로 충분, DB 미접근.)
  useEffect(() => {
    const sync = () => {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem('guildEmblemGen');
      } catch {
        return;
      }
      if (!raw) return;
      let alive = false;
      let startAt: number | null = null;
      try {
        const { at, base } = JSON.parse(raw) as { at: number; base: number };
        alive = Date.now() - at < 180_000 && emblems.length <= base;
        startAt = at;
      } catch {
        alive = false;
      }
      if (alive) {
        setGenPending(true);
        if (startAt != null) setGenStartMs(startAt);
      }
      else {
        try {
          localStorage.removeItem('guildEmblemGen');
        } catch {
          /* noop */
        }
        setGenPending(false);
      }
    };
    sync();
  }, [emblems]);
  const armOr = (action: 'use' | 'del', id: string, run: () => void) => {
    if (isArmed(action, id)) {
      setArmed(null);
      run();
      return;
    }
    setArmed({ action, id });
    setArmedLeft(3);
  };

  const [emblem, setEmblem] = useState<EmblemSelection>(DEFAULT_EMBLEM);
  const [tab, setTab] = useState<'settings' | 'members' | 'tax' | 'emblem'>('settings');
  const isLeader = myRole === 'leader';

  // 낙관적 UI — 서버 응답 전 즉시 반영, 실패 시 롤백.
  const [memberList, setMemberList] = useState(members);
  const [requests, setRequests] = useState(joinRequests);
  const [policy, setPolicy] = useState<GuildJoinPolicy>(guild.joinPolicy);
  const [taxPool, setTaxPool] = useState(guild.taxPool);
  const [emblemList, setEmblemList] = useState(emblems);
  // 서버 props가 바뀌면(refresh) 로컬 낙관 상태를 서버 값으로 재동기화(렌더 중 가드 — useEffect 캐스케이드 회피).
  const [synced, setSynced] = useState({ members, joinRequests, emblems, p: guild.joinPolicy, t: guild.taxPool });
  if (
    synced.members !== members ||
    synced.joinRequests !== joinRequests ||
    synced.emblems !== emblems ||
    synced.p !== guild.joinPolicy ||
    synced.t !== guild.taxPool
  ) {
    setSynced({ members, joinRequests, emblems, p: guild.joinPolicy, t: guild.taxPool });
    setMemberList(members);
    setRequests(joinRequests);
    setEmblemList(emblems);
    setPolicy(guild.joinPolicy);
    setTaxPool(guild.taxPool);
  }

  // 확인 팝업(위임·추방·해산) — alert 대신 중앙 모달(길드 탈퇴와 동일 패턴).
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // 구성원 액션 시트 — 행에 색버튼 나열 대신 ⋯로 모아 정리(컴팩트·모던·통일).
  const [actionMember, setActionMember] = useState<MemberLite | null>(null);

  const setVice = (userId: string, makeVice: boolean) => {
    const prev = memberList;
    setMemberList((l) =>
      l.map((m) => (m.userId === userId ? { ...m, role: makeVice ? 'vice' : 'member' } : m)),
    );
    start(async () => {
      const r = await setViceAction(userId, makeVice);
      if (r.status !== 'success') {
        setMemberList(prev);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: makeVice ? '부길드장 임명' : '부길드장 해제' });
    });
  };

  const doKick = (userId: string) => {
    const prev = memberList;
    setMemberList((l) => l.filter((m) => m.userId !== userId)); // 낙관적 제거
    start(async () => {
      const r = await kickMemberAction(userId);
      if (r.status !== 'success') {
        setMemberList(prev);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '추방 완료' });
    });
  };
  const kick = (userId: string, nickname: string) =>
    setConfirmModal({
      title: '구성원 추방',
      message: `${nickname}님을 추방할까요?\n24시간 동안 다시 가입할 수 없습니다.`,
      confirmLabel: '추방',
      onConfirm: () => doKick(userId),
    });

  const doTransfer = (userId: string) =>
    start(async () => {
      const r = await transferLeadershipAction(userId);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '길드장 위임 완료' });
      router.replace('/guild'); // 위임 후 임원 아님 — 길드 홈으로
    });
  const transfer = (userId: string, nickname: string) =>
    setConfirmModal({
      title: '길드장 위임',
      message: `${nickname}님에게 길드장을 위임할까요?\n되돌릴 수 없습니다.`,
      confirmLabel: '위임',
      onConfirm: () => doTransfer(userId),
    });

  const manageable = memberList.filter((m) => m.userId !== myUserId && m.role !== 'leader');

  const changePolicy = (next: GuildJoinPolicy) => {
    if (next === policy) return;
    const prev = policy;
    setPolicy(next); // 낙관적
    start(async () => {
      const r = await setJoinPolicyAction(next);
      if (r.status !== 'success') {
        setPolicy(prev);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: next === 'open' ? '자유 가입으로 변경' : '승인 가입으로 변경' });
    });
  };

  // 길드 공지 — 임원(길드장·부길드장) 편집. 저장 시에만 반영(낙관적 X).
  const [notice, setNotice] = useState(guild.notice);
  const noticeDirty = notice.trim() !== guild.notice.trim();
  const saveNotice = () =>
    start(async () => {
      const r = await setGuildNoticeAction(notice.trim());
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '공지 저장 완료' });
      router.refresh();
    });

  // 길드 소개(공개) — 임원 편집. 목록 팝업 노출. 저장 시에만 반영.
  const [intro, setIntro] = useState(guild.intro);
  const introDirty = intro.trim() !== guild.intro.trim();
  const saveIntro = () =>
    start(async () => {
      const r = await setGuildIntroAction(intro.trim());
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '소개 저장 완료' });
      router.refresh();
    });

  // 오픈채팅 링크 — 임원 편집. 빈 값 저장 = 제거. 형식 검증은 서버 권위(OPENCHAT_INVALID).
  const [openchat, setOpenchat] = useState(guild.openchatUrl);
  const openchatDirty = openchat.trim() !== guild.openchatUrl.trim();
  const saveOpenchat = () =>
    start(async () => {
      const r = await setGuildOpenchatAction(openchat.trim());
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: openchat.trim() ? '오픈채팅 링크 저장' : '오픈채팅 링크 제거' });
      router.refresh();
    });

  const approve = (userId: string) => {
    const prev = requests;
    setRequests((l) => l.filter((r) => r.userId !== userId)); // 낙관적
    start(async () => {
      const r = await approveJoinAction(userId);
      if (r.status !== 'success') {
        setRequests(prev);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '가입 승인' });
      router.refresh(); // 새 구성원 목록 반영
    });
  };

  const reject = (userId: string) => {
    const prev = requests;
    setRequests((l) => l.filter((r) => r.userId !== userId)); // 낙관적
    start(async () => {
      const r = await rejectJoinAction(userId);
      if (r.status !== 'success') {
        setRequests(prev);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '가입 거절' });
    });
  };

  // 생성 — 라우트 핸들러 fetch(서버 액션 트랜지션 밖)로 호출해 생성 중에도 앱이 안 멈춤.
  //  낙관적: '생성 중' 슬롯 즉시 표시 + 다이아 선차감, 실패 시 롤백.
  const generate = async () => {
    setGenOpen(false);
    // 생성중 영속 플래그(재진입 표시용) — 시작시각 + 기준 문양수.
    const at = Date.now();
    setGenStartMs(at);
    try {
      localStorage.setItem('guildEmblemGen', JSON.stringify({ at, base: emblemList.length }));
    } catch {
      /* noop */
    }
    setGenPending(true);
    // 첫 문양은 무료(결성 무료문양 실패 복구) — 차감/낙관조정 없음.
    const wasFree = emblemList.length === 0;
    if (!wasFree) optimisticAdjust(BigInt(-GUILD_EMBLEM_REROLL_COST_DIAMOND));
    // 생성은 수십초 걸릴 수 있어 긴 요청이 끊길 수 있음 — 응답을 단정적 실패로 보지 않고,
    // 명시적 에러 코드만 토스트, 그 외(네트워크/지연)는 새로고침으로 실제 상태 반영(서버가
    // 성공했으면 새 문양·차감이 반영됨). 다이아는 일단 되돌리고 refresh로 실값 재동기화.
    let r: { status?: string; code?: string } | null = null;
    try {
      const res = await fetch('/api/guild/emblem', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ selection: emblem }),
      });
      r = (await res.json()) as { status?: string; code?: string };
    } catch {
      r = null; // 네트워크/파싱 실패 — 서버는 성공했을 수 있음.
    }
    if (r?.status === 'success') {
      showHeaderToast({ title: '문양 생성 완료' });
      // 생성중 플래그는 새 문양 도착(emblems 증가) 시 effect가 정리 — 부드러운 전환.
    } else {
      if (!wasFree) optimisticAdjust(BigInt(GUILD_EMBLEM_REROLL_COST_DIAMOND)); // 비성공 추정 — 복원(refresh가 실값 재동기화)
      if (r?.status === 'error') {
        try {
          localStorage.removeItem('guildEmblemGen'); // 명시적 실패 — 생성중 즉시 해제
        } catch {
          /* noop */
        }
        setGenPending(false);
        showError(guildErrMsg(r.code ?? 'UNKNOWN'));
      }
      // null(네트워크/타임아웃): 서버가 생성 중일 수 있어 플래그 유지(effect/TTL이 정리).
    }
    router.refresh(); // 성공/불명확 모두 실제 상태 반영.
  };

  // 생성 버튼 — 1차 탭=3초 컨펌 무장, 2차 탭(3초 내)=실제 생성.
  const armGenerate = () => {
    if (genPending) return;
    if (!genConfirm) {
      setGenConfirmLeft(3);
      setGenConfirm(true);
      return;
    }
    setGenConfirm(false);
    generate();
  };

  // 사용(활성화) — 3초 컨펌(armOr)을 거쳐 실행. 낙관적 활성.
  const doSelect = (id: string) => {
    const prev = emblemList;
    setEmblemList((l) => l.map((e) => ({ ...e, isActive: e.id === id }))); // 낙관적
    start(async () => {
      const r = await setActiveEmblemAction(id);
      if (r.status !== 'success') {
        setEmblemList(prev);
        return showError(guildErrMsg(r.code));
      }
    });
  };

  // 삭제 — 3초 컨펌(armOr)을 거쳐 실행. 낙관적 제거.
  const doDelete = (id: string) => {
    const prev = emblemList;
    setEmblemList((l) => l.filter((e) => e.id !== id)); // 낙관적
    start(async () => {
      const r = await deleteEmblemAction(id);
      if (r.status !== 'success') {
        setEmblemList(prev);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '문양 삭제됨' });
    });
  };


  const doDisband = () =>
    start(async () => {
      const r = await disbandGuildAction();
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '길드 해산됨' });
      router.replace('/guild');
    });
  const disband = () =>
    setConfirmModal({
      title: '길드 해산',
      message: '길드를 해산할까요?\n되돌릴 수 없습니다.',
      confirmLabel: '해산',
      onConfirm: doDisband,
    });

  return (
    <div className="space-y-3 px-3 py-3">
      {/* 헤더 — 길드 문양 + 이름 + 관리 컨텍스트(다른 상세 화면과 통일). */}
      <div className="flex items-center gap-2.5 px-0.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900">
          {guild.emblemUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={guild.emblemUrl}
              alt="길드 문양"
              className="h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : (
            <span className="text-xl">🛡️</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-wide text-zinc-400">길드 관리</p>
          <h1 className="truncate text-base font-extrabold leading-tight">{guild.name}</h1>
        </div>
      </div>

      {/* 탭 — 길드 설정 / 구성원 관리 / 가입 관리 */}
      <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {(
          [
            ['settings', '길드 정보'],
            ['members', '구성원'],
            ...(isLeader ? [['tax', '세금'] as const, ['emblem', '문양'] as const] : []),
          ] as [typeof tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`relative flex-1 rounded-lg py-2 text-[13px] font-bold transition ${
              tab === k
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                : 'text-zinc-500'
            }`}
          >
            {label}
            {k === 'members' && isLeader && policy === 'approval' && requests.length > 0 ? (
              <span className="absolute right-1 top-0.5 rounded-full bg-amber-600 px-1 text-[9px] font-bold leading-tight text-white">
                {requests.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* 길드 정보 — 공지·소개·오픈채팅(임원 편집). 성격이 같은 텍스트 필드를 한 카드로 묶음. */}
      {tab === 'settings' && (
      <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-bold">길드 정보</h3>

        {/* 공지 — 길드 홈 정보에 노출 */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">공지</span>
            <span className="text-[10px] tabular-nums text-zinc-400">
              {notice.length}/{GUILD_NOTICE_MAX_LEN}
            </span>
          </div>
          <textarea
            value={notice}
            onChange={(e) => setNotice(e.target.value.slice(0, GUILD_NOTICE_MAX_LEN))}
            placeholder="길드원에게 보일 공지를 입력하세요 (길드 정보에 노출)"
            rows={2}
            className="mt-1.5 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-base outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
          />
          <div className="mt-2 flex justify-end gap-1.5">
            {notice.length > 0 && (
              <button type="button" onClick={() => setNotice('')} disabled={pending} className={BTN.ghost}>
                비우기
              </button>
            )}
            <button type="button" onClick={saveNotice} disabled={pending || !noticeDirty} className={BTN.primary}>
              저장
            </button>
          </div>
        </div>

        {/* 소개(공개) — 랭킹/검색 목록 팝업에 노출 */}
        <div className="border-t border-zinc-100 pt-3 dark:border-zinc-900">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">소개 (공개)</span>
            <span className="text-[10px] tabular-nums text-zinc-400">
              {intro.length}/{GUILD_INTRO_MAX_LEN}
            </span>
          </div>
          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value.slice(0, GUILD_INTRO_MAX_LEN))}
            placeholder="공개 소개를 입력하세요"
            rows={2}
            className="mt-1.5 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-base outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
          />
          <div className="mt-2 flex justify-end gap-1.5">
            {intro.length > 0 && (
              <button type="button" onClick={() => setIntro('')} disabled={pending} className={BTN.ghost}>
                비우기
              </button>
            )}
            <button type="button" onClick={saveIntro} disabled={pending || !introDirty} className={BTN.primary}>
              저장
            </button>
          </div>
        </div>

        {/* 카카오 오픈채팅 — 길드 홈에 입장 버튼 노출 */}
        <div className="border-t border-zinc-100 pt-3 dark:border-zinc-900">
          <span className="text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">카카오 오픈채팅</span>
          <input
            type="url"
            inputMode="url"
            value={openchat}
            onChange={(e) => setOpenchat(e.target.value.slice(0, 80))}
            placeholder="https://open.kakao.com/o/…"
            className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-base outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
          />
          <p className="mt-1 text-[10px] text-zinc-400">
            등록하면 길드 홈에 입장 버튼이 보입니다. 비우고 저장하면 제거됩니다.
          </p>
          <div className="mt-2 flex justify-end gap-1.5">
            {openchat.length > 0 && (
              <button type="button" onClick={() => setOpenchat('')} disabled={pending} className={BTN.ghost}>
                비우기
              </button>
            )}
            <button type="button" onClick={saveOpenchat} disabled={pending || !openchatDirty} className={BTN.primary}>
              저장
            </button>
          </div>
        </div>
      </section>
      )}

      {/* 구성원 관리 */}
      {tab === 'members' && (
      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-bold">구성원 관리</h3>
        {manageable.length === 0 ? (
          <p className="mt-3 text-[12px] text-zinc-400">관리할 구성원이 없습니다.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {manageable.map((m) => (
              <li key={m.userId} className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold">{m.nickname}</span>
                  {m.role === 'vice' && (
                    <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0 text-[9px] font-bold text-sky-700 dark:text-sky-300">
                      부길드장
                    </span>
                  )}
                </div>
                {/* 액션은 ⋯ 시트로 모음 — 행은 닉네임+역할만, 색버튼 나열 제거(컴팩트·모던).
                    부길드장은 일반 멤버만 관리 가능하므로 그 외엔 버튼 숨김. */}
                {(isLeader || m.role === 'member') && (
                  <button
                    type="button"
                    onClick={() => setActionMember(m)}
                    disabled={pending}
                    aria-label={`${m.nickname} 관리`}
                    className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-zinc-400 active:bg-zinc-100 disabled:opacity-50 dark:active:bg-zinc-800"
                  >
                    ⋯
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {/* 가입 방식 + 신청 — 구성원 탭에 통합. **길드장 전용**(2026-07-10 권한 조정 —
          서버 액션도 NOT_LEADER 게이트라 UI 숨김은 혼란 방지용). */}
      {tab === 'members' && isLeader && (
      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">가입 방식</h3>
          <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
            {(
              [
                ['open', '자유'],
                ['approval', '승인'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => changePolicy(key)}
                disabled={pending}
                className={`rounded-md px-3 py-1 text-[12px] font-bold transition disabled:opacity-50 ${
                  policy === key
                    ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                    : 'text-zinc-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {policy === 'approval' && (
          <div className="mt-3">
            <p className="text-[11px] font-semibold text-zinc-500">가입 신청 ({requests.length})</p>
            {requests.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-zinc-400">대기 중인 신청이 없습니다.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {requests.map((r) => (
                  <li key={r.userId} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] font-semibold">{r.nickname}</span>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => approve(r.userId)} disabled={pending} className={BTN.smPrimary}>
                        승인
                      </button>
                      <button type="button" onClick={() => reject(r.userId)} disabled={pending} className={BTN.smNeutral}>
                        거절
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      )}

      {/* 세금 (길드장) — 분배 상세를 탭 안에 바로 노출(별도 페이지 이동 없이). */}
      {tab === 'tax' && isLeader && (
        <DistributeBoard myUserId={myUserId} pool={taxPool} members={members} />
      )}

      {/* 길드 문양 보관함 (길드장) — 별도 '문양' 탭. 최대 5개 보관, 1개 선택 사용. */}
      {tab === 'emblem' && isLeader && (
        <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="mb-2 text-sm font-bold">길드 문양</h3>
          {/* 항상 5칸 고정 — 채워진 칸은 아래 [사용]/[삭제], 빈칸은 클릭해 생성(💎비용 표시). */}
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: MAX_GUILD_EMBLEMS }).map((_, i) => {
              const filled = i < emblemList.length ? emblemList[i] : null;
              const pendingSlot = !filled && i === emblemList.length && genPending;
              if (filled) {
                return (
                  <div key={filled.id} className="flex flex-col items-center gap-1">
                    <div
                      className={`aspect-square w-full overflow-hidden rounded-lg border-2 bg-zinc-50 dark:bg-zinc-900 ${
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
                    </div>
                    {filled.isActive ? (
                      <span className="w-full rounded-md bg-amber-500 py-0.5 text-center text-[9px] font-bold text-white">
                        사용중
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => armOr('use', filled.id, () => doSelect(filled.id))}
                        disabled={pending}
                        className={`relative isolate w-full overflow-hidden rounded-md py-0.5 text-center text-[9px] font-bold transition-colors active:opacity-70 disabled:opacity-50 ${
                          isArmed('use', filled.id)
                            ? 'bg-amber-600 text-white'
                            : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        {isArmed('use', filled.id) && (
                          <span
                            aria-hidden
                            className="absolute inset-0 bg-amber-400"
                            style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
                          />
                        )}
                        <span className="relative">
                          {isArmed('use', filled.id) ? `사용 ${armedLeft}s` : '사용'}
                        </span>
                      </button>
                    )}
                    {emblemList.length > 1 && (
                      <button
                        type="button"
                        onClick={() => armOr('del', filled.id, () => doDelete(filled.id))}
                        disabled={pending}
                        className={`relative isolate w-full overflow-hidden rounded-md py-0.5 text-center text-[9px] font-bold transition-colors active:opacity-70 disabled:opacity-50 ${
                          isArmed('del', filled.id) ? 'bg-red-600 text-white' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {isArmed('del', filled.id) && (
                          <span
                            aria-hidden
                            className="absolute inset-0 bg-red-500"
                            style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
                          />
                        )}
                        <span className="relative">
                          {isArmed('del', filled.id) ? `삭제 ${armedLeft}s` : '삭제'}
                        </span>
                      </button>
                    )}
                  </div>
                );
              }
              return (
                <div key={`empty-${i}`} className="flex flex-col items-center gap-1">
                  {pendingSlot ? (
                    <div className="flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/30">
                      <span className="text-[8px] font-semibold text-amber-600 dark:text-amber-400">
                        생성 중…
                      </span>
                      {genElapsedText && (
                        <span className="font-mono text-[8px] tabular-nums text-amber-500 dark:text-amber-400/80">
                          {genElapsedText}
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setGenConfirm(false);
                        setGenOpen(true);
                      }}
                      disabled={pending || genPending}
                      className="flex aspect-square w-full flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-zinc-300 text-zinc-400 transition active:scale-95 disabled:opacity-50 dark:border-zinc-700"
                    >
                      <span className="text-lg leading-none">+</span>
                      <span className="text-[8px] font-bold">
                        {emblemList.length === 0
                          ? '무료'
                          : `💎${GUILD_EMBLEM_REROLL_COST_DIAMOND.toLocaleString('ko-KR')}`}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 위험 구역 (길드장) — 되돌릴 수 없는 작업을 한 곳에. 길드장 위임은 '구성원' 탭에서. */}
      {tab === 'settings' && isLeader && (
        <section className="rounded-xl border border-red-300 bg-red-50/50 p-3 dark:border-red-500/40 dark:bg-red-950/20">
          <p className="text-[11px] leading-relaxed text-red-600/80 dark:text-red-300/70">
            되돌릴 수 없는 작업이에요. 길드장 위임은 ‘구성원’ 탭에서 할 수 있어요.
          </p>
          <button
            type="button"
            onClick={disband}
            disabled={pending}
            className="mt-2 w-full rounded-lg border border-red-300 py-2.5 text-sm font-bold text-red-600 active:bg-red-100 disabled:opacity-50 dark:border-red-500/40 dark:text-red-400 dark:active:bg-red-950/40"
          >
            길드 해산
          </button>
        </section>
      )}

      {/* 부길드장 안내 — 길드장 전용 항목(세금·문양·해산)이 안 보이는 이유 명시. */}
      {tab === 'settings' && !isLeader && (
        <p className="px-1 text-center text-[11px] text-zinc-400">
          세금·문양·해산은 길드장만 관리할 수 있어요.
        </p>
      )}

      {/* 새 문양 생성 모달 — 중앙 모달 */}
      {genOpen && (
        <ModalShell
          onClose={() => {
            setGenOpen(false);
            setGenConfirm(false);
          }}
          label="새 문양 생성"
          className="max-h-[85vh] w-full max-w-[340px] overflow-y-auto rounded-2xl bg-white p-4 dark:bg-zinc-950"
        >
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold">새 문양 생성</h2>
              <button
                type="button"
                onClick={() => {
                  setGenOpen(false);
                  setGenConfirm(false);
                }}
                className="text-xs text-zinc-500"
              >
                닫기
              </button>
            </div>
            <div className="mt-3">
              <EmblemPicker value={emblem} onChange={setEmblem} disabled={pending} />
            </div>
            <button
              type="button"
              onClick={armGenerate}
              disabled={pending}
              className={`relative isolate mt-3 w-full overflow-hidden rounded-lg py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-50 ${
                genConfirm ? 'bg-amber-700' : 'bg-amber-600'
              }`}
            >
              {genConfirm ? (
                <span
                  aria-hidden
                  className="absolute inset-0 bg-amber-500"
                  style={{ animation: 'confirm-bg-pulse 1.2s ease-in-out infinite' }}
                />
              ) : null}
              <span className="relative">
                {(() => {
                  const price =
                    emblemList.length === 0
                      ? '무료'
                      : `💎${GUILD_EMBLEM_REROLL_COST_DIAMOND.toLocaleString('ko-KR')}`;
                  return genConfirm ? `생성하기 ${price} ${genConfirmLeft}s` : `생성하기 ${price}`;
                })()}
              </span>
            </button>
        </ModalShell>
      )}

      {/* 구성원 액션 시트 — ⋯에서 열림. 액션을 행으로 정렬, 위험(추방)은 빨강. */}
      {actionMember &&
        (() => {
          const m = actionMember;
          const rowCls =
            'w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold transition active:bg-zinc-100 dark:active:bg-zinc-800';
          return (
            <ModalShell
              onClose={() => setActionMember(null)}
              label={`${m.nickname} 관리`}
              className="w-full max-w-[320px] rounded-2xl bg-white p-3 dark:bg-zinc-950"
            >
              <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
                <span className="truncate text-sm font-bold">{m.nickname}</span>
                {m.role === 'vice' && (
                  <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0 text-[9px] font-bold text-sky-700 dark:text-sky-300">
                    부길드장
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                {isLeader &&
                  (m.role === 'vice' ? (
                    <button
                      type="button"
                      className={`${rowCls} text-zinc-700 dark:text-zinc-200`}
                      onClick={() => {
                        setVice(m.userId, false);
                        setActionMember(null);
                      }}
                    >
                      부길드장 해제
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${rowCls} text-sky-600 dark:text-sky-400`}
                      onClick={() => {
                        setVice(m.userId, true);
                        setActionMember(null);
                      }}
                    >
                      부길드장 임명
                    </button>
                  ))}
                {isLeader && (
                  <button
                    type="button"
                    className={`${rowCls} text-amber-600 dark:text-amber-400`}
                    onClick={() => {
                      setActionMember(null);
                      transfer(m.userId, m.nickname);
                    }}
                  >
                    길드장 위임
                  </button>
                )}
                {(isLeader || m.role === 'member') && (
                  <button
                    type="button"
                    className={`${rowCls} text-red-600 dark:text-red-400`}
                    onClick={() => {
                      setActionMember(null);
                      kick(m.userId, m.nickname);
                    }}
                  >
                    추방
                  </button>
                )}
              </div>
            </ModalShell>
          );
        })()}

      {/* 확인 팝업 — 위임·추방·해산(alert 대체) */}
      {confirmModal && (
        <ModalShell
          onClose={() => setConfirmModal(null)}
          label={confirmModal.title}
          className="w-full max-w-[320px] rounded-2xl bg-white p-4 dark:bg-zinc-950"
        >
            <h2 className="text-sm font-bold">{confirmModal.title}</h2>
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {confirmModal.message}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className="flex-1 rounded-lg border border-zinc-300 py-2 text-sm font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => {
                  const fn = confirmModal.onConfirm;
                  setConfirmModal(null);
                  fn();
                }}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-bold text-white"
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
        </ModalShell>
      )}
    </div>
  );
}
