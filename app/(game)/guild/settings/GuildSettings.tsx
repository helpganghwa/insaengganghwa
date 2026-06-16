'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamond } from '@/components/DiamondContext';
import { ModalShell } from '@/components/ModalShell';
import {
  GUILD_EMBLEM_REROLL_COST_DIAMOND,
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
  taxPool: string;
  joinPolicy: GuildJoinPolicy;
  notice: string;
  openchatUrl: string;
  emblemUrl: string | null;
  emblemColor: string | null;
};
type EmblemItem = { id: string; emblemUrl: string | null; emblemColor: string | null; isActive: boolean };

// 통일 버튼 스타일 — 모두 rounded-lg. 섹션 주버튼(md) / 인라인 액션(sm, 색만 변형).
const BTN = {
  primary: 'rounded-lg bg-amber-600 px-3.5 py-1.5 text-[12px] font-bold text-white active:opacity-90 disabled:opacity-40',
  ghost: 'rounded-lg px-3 py-1.5 text-[12px] font-semibold text-zinc-500 disabled:opacity-50',
  smPrimary: 'rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50',
  smNeutral:
    'rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300',
  smSky:
    'rounded-lg border border-sky-300 px-2.5 py-1 text-[11px] font-semibold text-sky-600 disabled:opacity-50 dark:border-sky-800 dark:text-sky-400',
  smAmber:
    'rounded-lg border border-amber-300 px-2.5 py-1 text-[11px] font-semibold text-amber-600 disabled:opacity-50 dark:border-amber-800 dark:text-amber-400',
  smDanger:
    'rounded-lg border border-red-300 px-2.5 py-1 text-[11px] font-semibold text-red-500 disabled:opacity-50 dark:border-red-900/60',
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
  const [tab, setTab] = useState<'settings' | 'members' | 'joins'>('settings');
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
    setGenPending(true);
    optimisticAdjust(BigInt(-GUILD_EMBLEM_REROLL_COST_DIAMOND));
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
    setGenPending(false);
    if (r?.status === 'success') {
      showHeaderToast({ title: '문양 생성 완료' });
    } else {
      optimisticAdjust(BigInt(GUILD_EMBLEM_REROLL_COST_DIAMOND)); // 비성공 추정 — 일단 복원(refresh가 실값으로 재동기화)
      if (r?.status === 'error') showError(guildErrMsg(r.code ?? 'UNKNOWN')); // 명시적 에러만 안내
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
      {/* 탭 — 길드 설정 / 구성원 관리 / 가입 관리 */}
      <div className="flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {(
          [
            ['settings', '길드 설정'],
            ['members', '구성원 관리'],
            ['joins', '가입 관리'],
          ] as const
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
            {k === 'joins' && policy === 'approval' && requests.length > 0 ? (
              <span className="absolute right-1 top-0.5 rounded-full bg-amber-600 px-1 text-[9px] font-bold leading-tight text-white">
                {requests.length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* 길드 공지 — 길드정보 섹션에 노출됨(임원 편집) */}
      {tab === 'settings' && (
      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">길드 공지</h3>
          <span className="text-[10px] tabular-nums text-zinc-400">
            {notice.length}/{GUILD_NOTICE_MAX_LEN}
          </span>
        </div>
        <textarea
          value={notice}
          onChange={(e) => setNotice(e.target.value.slice(0, GUILD_NOTICE_MAX_LEN))}
          placeholder="길드원에게 보일 공지를 입력하세요 (길드 정보에 노출)"
          rows={2}
          className="mt-2 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-base outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
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
      </section>
      )}

      {/* 카카오 오픈채팅 — 별도 섹션(문양·세금과 동일). 인게임 채팅 대신 외부 소통(카카오 위임), 길드 홈에 입장 버튼 노출 */}
      {tab === 'settings' && (
      <section className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <h3 className="text-sm font-bold">카카오 오픈채팅</h3>
        <input
          type="url"
          inputMode="url"
          value={openchat}
          onChange={(e) => setOpenchat(e.target.value.slice(0, 80))}
          placeholder="https://open.kakao.com/o/…"
          className="mt-2 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-base outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
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
                <div className="flex shrink-0 items-center gap-1">
                  {isLeader &&
                    (m.role === 'vice' ? (
                      <button type="button" onClick={() => setVice(m.userId, false)} disabled={pending} className={BTN.smNeutral}>
                        부길드장 해제
                      </button>
                    ) : (
                      <button type="button" onClick={() => setVice(m.userId, true)} disabled={pending} className={BTN.smSky}>
                        부길드장 임명
                      </button>
                    ))}
                  {isLeader && (
                    <button type="button" onClick={() => transfer(m.userId, m.nickname)} disabled={pending} className={BTN.smAmber}>
                      길드장 위임
                    </button>
                  )}
                  {/* 부길드장은 일반 멤버만 추방 가능 */}
                  {(isLeader || m.role === 'member') && (
                    <button type="button" onClick={() => kick(m.userId, m.nickname)} disabled={pending} className={BTN.smDanger}>
                      추방
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {/* 가입 방식 + 신청 */}
      {tab === 'joins' && (
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

      {/* 세금 풀 분배 (길드장) */}
      {tab === 'settings' && isLeader && (
        <section className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <h3 className="text-sm font-bold">길드 세금</h3>
            <p className="text-[11px] text-zinc-500">💎 {taxPool}</p>
          </div>
          <Link href="/guild/distribute" className={`shrink-0 ${BTN.primary}`}>
            분배
          </Link>
        </section>
      )}

      {/* 길드 문양 보관함 (길드장) — 최대 3개 보관, 1개 선택 사용. */}
      {tab === 'settings' && isLeader && (
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
                    <div className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/30">
                      <span className="text-[8px] font-semibold text-amber-600 dark:text-amber-400">
                        생성 중…
                      </span>
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
                        💎{GUILD_EMBLEM_REROLL_COST_DIAMOND.toLocaleString('ko-KR')}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 해산 (길드장) */}
      {tab === 'settings' && isLeader && (
        <button
          type="button"
          onClick={disband}
          disabled={pending}
          className="w-full rounded-lg py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50 dark:text-red-400"
        >
          길드 해산
        </button>
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
                {genConfirm
                  ? `한번 더 💎${GUILD_EMBLEM_REROLL_COST_DIAMOND.toLocaleString('ko-KR')} ${genConfirmLeft}s`
                  : `생성하기 💎${GUILD_EMBLEM_REROLL_COST_DIAMOND.toLocaleString('ko-KR')}`}
              </span>
            </button>
        </ModalShell>
      )}

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
