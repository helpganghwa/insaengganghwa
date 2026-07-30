'use client';

import { memo, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { profileHref } from '@/lib/game/profile/href';
import { LastSeen } from '@/components/LastSeen';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';
import { GUILD_MAX_VICE, GUILD_REJOIN_LOCK_HOURS } from '@/lib/game/guild/balance';
import { GUILD_PERM_ORDER, permKeys } from '@/lib/game/guild/permissions';

import { setViceAction, kickMemberAction, transferLeadershipAction } from './actions';
import { guildErrMsg } from './errors-msg';

type Slot = 'weapon' | 'armor' | 'accessory';
type Equipped = {
  slot: Slot;
  code: string;
  enhance: number;
  transcendLevel: number;
  /** 해방 등수(강화랭킹 1~3위) — 후광 연출. 미해방=null. */
  championRank: number | null;
};
export type RichMember = {
  userId: string;
  nickname: string;
  publicCode: string;
  role: 'leader' | 'vice' | 'member';
  /** 부길드장 권한 비트마스크(0142) — '권한 N/9' 배지. 길드장·길드원은 의미 없음. */
  permissions: number;
  avatar: string | null;
  /** 마지막 접속(ISO) — 접속 상태 표시. 없으면 null. */
  lastSeenAt: string | null;
  contribution: number;
  /** 오늘 기여(KST) — "누적(오늘)" 표기용. */
  contributionToday: number;
  combat: number;
  maxEnhance: number;
  totalEnhance: number;
  equipped: Equipped[];
};

type SortKey = 'combat' | 'contribution' | 'lastSeen';
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'contribution', label: '기여도' },
  { key: 'combat', label: '전투력' },
  { key: 'lastSeen', label: '최근접속' },
];

/** 좁은 카드용 컴팩트 수치(예: 53,000 → 5.3만). */
function fmtNum(n: number): string {
  return new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/** 정렬용 수치 — 최근접속은 epoch(최신 우선, 기록 없으면 0=맨 뒤). 그 외는 메트릭 값. */
function sortValue(m: RichMember, key: SortKey): number {
  if (key === 'lastSeen') return m.lastSeenAt ? Date.parse(m.lastSeenAt) : 0;
  return m[key];
}

/**
 * 길드원 행 — 본문은 프로필 링크, 관리(⋯)는 링크 밖 별도 버튼(중첩 금지).
 * 장비 3종 아이콘은 뺐다(2026-07-30) — 권한 배지와 ⋯ 가 들어가면 폭이 안 나온다.
 * 장비는 행을 눌러 프로필 상세에서 본다.
 */
const MemberRow = memo(function MemberRow({
  m,
  myUserId,
  serverId,
  onManage,
}: {
  m: RichMember;
  myUserId: string;
  serverId: number;
  /** 관리 가능하면 시트를 열 콜백, 아니면 undefined(버튼 미노출). */
  onManage?: (m: RichMember) => void;
}) {
  const isMe = m.userId === myUserId;
  const permCount = m.role === 'vice' ? permKeys(m.permissions).length : 0;
  return (
    <li className="flex items-center gap-1">
      <Link
        prefetch={false}
        href={profileHref(m.publicCode, serverId)}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 active:opacity-70"
      >
        {/* 아바타 — 접속 상태는 닉네임 옆 텍스트로만(점 표시는 제거, 2026-07-27 사용자 결정). */}
        <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
          {m.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.avatar}
              alt=""
              aria-hidden
              className="h-full w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[12.5px] font-semibold">{m.nickname}</span>
            {isMe ? (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-0 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                나
              </span>
            ) : null}
            {m.role === 'vice' ? (
              <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0 text-[9px] font-bold tabular-nums text-sky-700 dark:text-sky-300">
                권한 {permCount}/{GUILD_PERM_ORDER.length}
              </span>
            ) : null}
            {isMe || m.lastSeenAt != null ? (
              <LastSeen at={m.lastSeenAt} forceOnline={isMe} plain className="ml-auto shrink-0 text-[10px]" />
            ) : null}
          </div>
          <div className="mt-0.5 flex gap-2.5 text-[11px] text-zinc-500">
            <span className="truncate">
              기여{' '}
              <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                {m.contribution.toLocaleString('ko-KR')}({m.contributionToday.toLocaleString('ko-KR')})
              </span>
            </span>
            <span className="shrink-0">
              전투{' '}
              <span className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                {fmtNum(m.combat)}
              </span>
            </span>
          </div>
        </div>
      </Link>

      {onManage ? (
        <button
          type="button"
          onClick={() => onManage(m)}
          aria-label={`${m.nickname} 관리`}
          className="shrink-0 rounded-lg px-2 py-1.5 text-lg leading-none text-zinc-400 active:bg-zinc-100 dark:active:bg-zinc-800"
        >
          ⋯
        </button>
      ) : null}
    </li>
  );
});

export function GuildMemberList({
  members,
  myUserId,
  serverId,
  myRole = 'member',
  canKick = false,
}: {
  members: RichMember[];
  myUserId: string;
  serverId: number;
  /** 내 직책 — 관리 항목 노출 판단. 미전달이면 관리 없음(읽기 전용 화면 호환). */
  myRole?: RichMember['role'];
  /** kick 권한(0142) — 내보내기 항목 노출. */
  canKick?: boolean;
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [pending, start] = useTransition();
  const [sort, setSort] = useState<SortKey>('contribution');
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState<RichMember | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    label: string;
    tone: 'primary' | 'danger' | 'info';
    run: () => void;
  } | null>(null);

  const isLeader = myRole === 'leader';
  const viceCount = members.filter((m) => m.role === 'vice').length;

  // 직책별 그룹(길드장/부길드장/길드원) — 각 그룹 내부는 선택한 메트릭으로 정렬.
  // 접기는 두지 않는다(사용자 결정 2026-07-30) — 전원이 항상 보인다.
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = needle
      ? members.filter((m) => m.nickname.toLowerCase().includes(needle))
      : members;
    const byMetric = (a: RichMember, b: RichMember) =>
      sortValue(b, sort) - sortValue(a, sort) || a.nickname.localeCompare(b.nickname);
    const of = (role: RichMember['role']) => matched.filter((m) => m.role === role).sort(byMetric);
    return [
      { key: 'leader' as const, label: '길드장', rows: of('leader') },
      { key: 'vice' as const, label: '부길드장', rows: of('vice') },
      { key: 'member' as const, label: '길드원', rows: of('member') },
    ];
  }, [members, sort, q]);

  const matchedCount = groups.reduce((n, g) => n + g.rows.length, 0);

  /** 관리 버튼 노출 판정 — 자신은 제외, 부길드장 대상은 길드장만, 그 외는 kick 권한만 있어도 열린다. */
  const manageableBy = (m: RichMember): boolean => {
    if (m.userId === myUserId || m.role === 'leader') return false;
    if (m.role === 'vice') return isLeader;
    return isLeader || canKick;
  };

  const run = (fn: () => Promise<{ status: string; code?: string }>, okTitle: string) => {
    start(async () => {
      const r = await fn().catch(() => null);
      if (!r || r.status !== 'success') {
        showError(r?.code ? guildErrMsg(r.code) : '전송에 실패했어요. 다시 시도해 주세요.');
        return;
      }
      showHeaderToast({ title: okTitle });
      router.refresh();
    });
  };

  const askPromote = (m: RichMember) =>
    setConfirm({
      title: `${m.nickname}님을 부길드장으로 임명`,
      body: `부길드장 임명은 최대 ${GUILD_MAX_VICE}명이며 부길드장 권한은 권한 화면에서 설정가능합니다.`,
      label: '임명',
      tone: 'info',
      run: () => run(() => setViceAction(m.userId, true), '부길드장 임명'),
    });

  const askDemote = (m: RichMember) =>
    setConfirm({
      title: `${m.nickname}님을 부길드장에서 해제`,
      body: '부여한 권한도 함께 사라집니다. 다시 임명하면 권한을 재설정 해야합니다.',
      label: '해제',
      tone: 'primary',
      run: () => run(() => setViceAction(m.userId, false), '부길드장 해제'),
    });

  const askTransfer = (m: RichMember) =>
    setConfirm({
      title: `${m.nickname}님에게 길드장을 넘길까요?`,
      body: '넘기면 나는 길드원이 되고, 되돌리려면 상대가 다시 넘겨줘야 합니다.',
      label: '위임',
      tone: 'danger',
      run: () => run(() => transferLeadershipAction(m.userId), '길드장 위임'),
    });

  const askKick = (m: RichMember) =>
    setConfirm({
      title: `${m.nickname}님을 길드에서 내보냅니다`,
      body: `되돌릴 수 없습니다. 내보낸 길드원은 ${GUILD_REJOIN_LOCK_HOURS}시간동안 다시 가입 할 수 없습니다.`,
      label: '내보내기',
      tone: 'danger',
      run: () => run(() => kickMemberAction(m.userId), '길드에서 내보냈습니다'),
    });

  return (
    <section className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      {/* 제목은 페이지 헤더가 맡는다 — 여기선 정렬만(중복 제거, 2026-07-30). */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-zinc-400">정렬</span>
        <div className="flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold transition ${
                sort === s.key
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                  : 'text-zinc-500'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* 검색 — 정원 상한이 50명이라 스크롤만으론 못 찾는다. ZoomSafeInput(포커스 확대 방지). */}
      <ZoomSafeInput
        value={q}
        onChange={(e) => setQ(e.target.value.slice(0, 20))}
        placeholder="닉네임 검색"
        wrapClassName="mt-2 h-9 w-full"
        className="rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
      />

      {q.trim() && matchedCount === 0 ? (
        <p className="mt-3 text-center text-[12px] text-zinc-400">
          ‘{q.trim()}’과 일치하는 길드원이 없습니다.
        </p>
      ) : null}

      {groups.map(({ key, label, rows }) =>
        rows.length === 0 ? null : (
          <div key={key} className="mt-3">
            <div className="flex items-baseline justify-between gap-2 px-1 pb-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                {label}
                {key === 'vice' ? (
                  <span className="ml-1 tabular-nums">
                    {viceCount} / {GUILD_MAX_VICE}
                  </span>
                ) : key === 'member' ? (
                  <span className="ml-1 tabular-nums">{rows.length}</span>
                ) : null}
              </p>
              {/* 임명 경로를 그룹 헤더에 드러낸다 — ⋯ 안에만 있으면 찾지 못한다. */}
              {key === 'vice' && isLeader && viceCount < GUILD_MAX_VICE ? (
                <button
                  type="button"
                  onClick={() => setPromoteOpen(true)}
                  className="text-[10px] font-bold text-sky-600 active:opacity-60 dark:text-sky-400"
                >
                  + 임명
                </button>
              ) : null}
            </div>
            <ul>
              {rows.map((m) => (
                <MemberRow
                  key={m.userId}
                  m={m}
                  myUserId={myUserId}
                  serverId={serverId}
                  onManage={manageableBy(m) ? setSheet : undefined}
                />
              ))}
            </ul>
          </div>
        ),
      )}

      {/* 부길드장이 0명이고 길드장이면 — 그룹이 없어 헤더도 없으니 임명 경로를 따로 준다. */}
      {isLeader && viceCount === 0 && !q.trim() ? (
        <button
          type="button"
          onClick={() => setPromoteOpen(true)}
          className="mt-3 w-full rounded-lg border border-sky-500/40 py-2 text-[12px] font-bold text-sky-600 active:opacity-70 dark:text-sky-400"
        >
          + 부길드장 임명
        </button>
      ) : null}

      {/* 관리 시트 — 공용 팝업(프로젝트 전체 규칙). */}
      {sheet ? (
        <ModalShell onClose={() => setSheet(null)} label={`${sheet.nickname} 관리`}>
          <ModalLayout
            title={sheet.nickname}
            subtitle={
              sheet.role === 'vice' ? (
                <span className="font-bold text-sky-600 dark:text-sky-400">
                  부길드장 · 권한 {permKeys(sheet.permissions).length} / {GUILD_PERM_ORDER.length}
                </span>
              ) : (
                '길드원'
              )
            }
            bodyPad="sm"
            footer={
              <ModalButton tone="ghost" onClick={() => setSheet(null)}>
                닫기
              </ModalButton>
            }
          >
            <div className="space-y-0.5">
              {sheet.role === 'vice' && isLeader ? (
                <Link
                  prefetch={false}
                  href={`/guild/roles?u=${sheet.userId}`}
                  onClick={() => setSheet(null)}
                  className="block rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold text-sky-600 active:bg-zinc-100 dark:text-sky-400 dark:active:bg-zinc-800"
                >
                  권한 설정
                </Link>
              ) : null}
              {isLeader ? (
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold text-zinc-700 active:bg-zinc-100 dark:text-zinc-200 dark:active:bg-zinc-800"
                  onClick={() => {
                    const m = sheet;
                    setSheet(null);
                    if (m.role === 'vice') askDemote(m);
                    else askPromote(m);
                  }}
                >
                  {sheet.role === 'vice' ? '부길드장 해제' : '부길드장 임명'}
                </button>
              ) : null}
              {isLeader ? (
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold text-amber-600 active:bg-zinc-100 dark:text-amber-400 dark:active:bg-zinc-800"
                  onClick={() => {
                    const m = sheet;
                    setSheet(null);
                    askTransfer(m);
                  }}
                >
                  길드장 위임
                </button>
              ) : null}
              {isLeader || (canKick && sheet.role === 'member') ? (
                <button
                  type="button"
                  className="w-full rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold text-red-600 active:bg-zinc-100 dark:text-red-400 dark:active:bg-zinc-800"
                  onClick={() => {
                    const m = sheet;
                    setSheet(null);
                    askKick(m);
                  }}
                >
                  길드에서 내보내기
                </button>
              ) : null}
            </div>
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 임명 대상 고르기 — 길드원만 대상. 검색 없이도 정렬(기여도순)로 충분한 규모. */}
      {promoteOpen ? (
        <ModalShell onClose={() => setPromoteOpen(false)} label="부길드장 임명">
          <ModalLayout
            title="부길드장 임명"
            subtitle={
              <span className="font-bold text-sky-600 dark:text-sky-400">
                {viceCount} / {GUILD_MAX_VICE} 명
              </span>
            }
            bodyPad="sm"
            maxBodyClass="max-h-[46vh]"
            footer={
              <ModalButton tone="ghost" onClick={() => setPromoteOpen(false)}>
                닫기
              </ModalButton>
            }
          >
            {groups.find((g) => g.key === 'member')!.rows.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-zinc-400">임명할 길드원이 없습니다.</p>
            ) : (
              <ul className="space-y-0.5">
                {groups
                  .find((g) => g.key === 'member')!
                  .rows.map((m) => (
                    <li key={m.userId}>
                      <button
                        type="button"
                        onClick={() => {
                          setPromoteOpen(false);
                          askPromote(m);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left active:bg-zinc-100 dark:active:bg-zinc-800"
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                          {m.nickname}
                        </span>
                        <span className="shrink-0 text-[10.5px] tabular-nums text-zinc-500">
                          기여 {m.contribution.toLocaleString('ko-KR')}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </ModalLayout>
        </ModalShell>
      ) : null}

      {/* 되돌릴 수 없는 동작 확인 — 임명·해제·위임·내보내기 공용. */}
      {confirm ? (
        <ModalShell
          onClose={() => setConfirm(null)}
          onSubmit={() => {
            const c = confirm;
            setConfirm(null);
            c.run();
          }}
          label={confirm.title}
        >
          <ModalLayout
            title={confirm.title}
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setConfirm(null)} disabled={pending}>
                  취소
                </ModalButton>
                <ModalButton
                  tone={confirm.tone}
                  onClick={() => {
                    const c = confirm;
                    setConfirm(null);
                    c.run();
                  }}
                  disabled={pending}
                >
                  {confirm.label}
                </ModalButton>
              </>
            }
          >
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {confirm.body}
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}
    </section>
  );
}
