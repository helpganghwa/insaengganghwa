'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { profileHref } from '@/lib/game/profile/href';
import { BackBar } from '@/components/BackNav';
import { LastSeen } from '@/components/LastSeen';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { useResourceToast } from '@/components/ResourceToast';
import { GUILD_JOIN_REQUEST_TTL_DAYS, type GuildJoinPolicy } from '@/lib/game/guild/balance';

import { approveJoinAction, rejectJoinAction, setJoinPolicyAction } from '../actions';
import { guildErrMsg } from '../errors-msg';

type Request = {
  userId: string;
  nickname: string;
  publicCode: string;
  /** 만료까지 남은 일수 — 서버 계산(렌더 중 시계 접근 금지). */
  expiresInDays: number;
  lastSeenAt: string | null;
  avatar: string | null;
  combat: number;
  maxEnhance: number;
  totalEnhance: number;
};

/** 만료 경고를 띄우는 남은 일수 — 이틀 안이면 놓치기 쉬우므로 배지로 알린다. */
const WARN_DAYS = 2;

/** 좁은 폭용 컴팩트 수치(53,000 → 5.3만). */
const fmt = (n: number) =>
  new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/**
 * 가입 신청(J-1 확정안) — 리스트 + 인라인 [승인][거절].
 *
 *  - 행에 판단 근거를 붙인다: 전투력 · 최근 접속 · 최고/합산 강화.
 *  - 신청 경과 일수는 쓰지 않고 **만료 경고만** 보여준다(사용자 결정 2026-07-30).
 *  - 정원이 차면 승인을 막고 이유를 화면에서 말한다 — 서버 GUILD_FULL을 미리 설명.
 *  - 거절은 확인 팝업(공용 ModalShell)을 한 번 거친다.
 */
export function JoinRequestBoard({
  guildName,
  serverId,
  policy: initialPolicy,
  memberCount,
  capacity,
  requests: initialRequests,
}: {
  guildName: string;
  serverId: number;
  policy: GuildJoinPolicy;
  memberCount: number;
  capacity: number;
  requests: Request[];
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [pending, start] = useTransition();
  const [policy, setPolicy] = useState<GuildJoinPolicy>(initialPolicy);
  const [rows, setRows] = useState<Request[]>(initialRequests);
  const [reject, setReject] = useState<Request | null>(null);

  const full = memberCount >= capacity;

  const drop = (userId: string) => setRows((l) => l.filter((r) => r.userId !== userId));

  const doApprove = (r: Request) => {
    const prev = rows;
    drop(r.userId); // 낙관적 제거
    start(async () => {
      const res = await approveJoinAction(r.userId).catch(() => null);
      if (!res || res.status !== 'success') {
        setRows(prev);
        showError(res?.code ? guildErrMsg(res.code) : '전송에 실패했어요. 다시 시도해 주세요.');
        return;
      }
      showHeaderToast({ title: `${r.nickname}님이 길드에 합류했습니다` });
      router.refresh();
    });
  };

  const doReject = (r: Request) => {
    const prev = rows;
    drop(r.userId);
    start(async () => {
      const res = await rejectJoinAction(r.userId).catch(() => null);
      if (!res || res.status !== 'success') {
        setRows(prev);
        showError(res?.code ? guildErrMsg(res.code) : '전송에 실패했어요. 다시 시도해 주세요.');
        return;
      }
      showHeaderToast({ title: '신청을 거절했습니다' });
      router.refresh();
    });
  };

  const changePolicy = (next: GuildJoinPolicy) => {
    if (next === policy) return;
    const prev = policy;
    setPolicy(next);
    start(async () => {
      const res = await setJoinPolicyAction(next).catch(() => null);
      if (!res || res.status !== 'success') {
        setPolicy(prev);
        showError(res?.code ? guildErrMsg(res.code) : '전송에 실패했어요. 다시 시도해 주세요.');
        return;
      }
      showHeaderToast({ title: next === 'approval' ? '승인제로 변경' : '자유 가입으로 변경' });
      router.refresh();
    });
  };

  return (
    <div className="px-4 py-5">
      <BackBar title={`${guildName} · 가입 신청`} />

      <div className="px-0.5">
        <p className="text-[10px] font-semibold tracking-wide text-zinc-400">
          {policy === 'approval' ? `대기 ${rows.length}건` : '자유 가입'}
        </p>
        <h1 className="text-base font-extrabold leading-tight">가입 신청</h1>
      </div>

      {/* 가입 방식 + 정원 */}
      <section className="mt-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold">가입 방식</h2>
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
        <p className="mt-1.5 text-[11px] text-zinc-500">
          정원{' '}
          <b className="tabular-nums text-zinc-700 dark:text-zinc-200">
            {memberCount} / {capacity}
          </b>
          {full ? (
            <span className="ml-1.5 font-bold text-red-500">가득 찼습니다 — 승인할 수 없어요</span>
          ) : null}
        </p>
      </section>

      {policy !== 'approval' ? (
        <p className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-6 text-center text-[12px] leading-relaxed text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          자유 가입이라 신청 없이 바로 들어옵니다.
          <br />
          승인제로 바꾸면 신청을 받아 여기서 처리합니다.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-zinc-200 bg-white px-3 py-6 text-center text-[12px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          대기 중인 신청이 없습니다.
        </p>
      ) : (
        <ul className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-950">
          {rows.map((r) => {
            const warn = r.expiresInDays <= WARN_DAYS;
            return (
              <li
                key={r.userId}
                className="flex items-start gap-2 border-b border-zinc-100 py-2.5 last:border-b-0 dark:border-zinc-900"
              >
                <Link
                  prefetch={false}
                  href={profileHref(r.publicCode, serverId)}
                  className="flex min-w-0 flex-1 items-start gap-2 active:opacity-70"
                >
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-100 dark:bg-zinc-900">
                    {r.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.avatar}
                        alt=""
                        aria-hidden
                        className="h-full w-full object-contain"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="truncate text-[12.5px] font-semibold">{r.nickname}</span>
                      {warn ? (
                        <span className="shrink-0 rounded-full bg-red-500/15 px-1.5 py-0 text-[9px] font-bold text-red-600 dark:text-red-400">
                          {r.expiresInDays <= 1 ? '오늘 만료' : `${r.expiresInDays}일 뒤 만료`}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-zinc-500">
                      전투력{' '}
                      <b className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                        {fmt(r.combat)}
                      </b>
                      {r.lastSeenAt ? (
                        <>
                          {' · '}
                          <LastSeen at={r.lastSeenAt} plain className="text-[11px]" />
                        </>
                      ) : null}
                    </span>
                    <span className="block text-[11px] text-zinc-500">
                      최고{' '}
                      <b className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                        +{r.maxEnhance}
                      </b>
                      {' · 합산 '}
                      <b className="font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
                        +{r.totalEnhance.toLocaleString('ko-KR')}
                      </b>
                    </span>
                  </span>
                </Link>

                <span className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => doApprove(r)}
                    disabled={pending || full}
                    className="rounded-lg bg-amber-600 px-3 py-1 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    승인
                  </button>
                  <button
                    type="button"
                    onClick={() => setReject(r)}
                    disabled={pending}
                    className="rounded-lg border border-zinc-300 px-3 py-1 text-[11px] font-semibold text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    거절
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {policy === 'approval' ? (
        <p className="mt-2.5 px-0.5 text-[11px] leading-relaxed text-zinc-500">
          신청은 {GUILD_JOIN_REQUEST_TTL_DAYS}일이 지나면 자동으로 사라집니다. 이름을 누르면
          프로필을 볼 수 있습니다.
        </p>
      ) : null}

      {/* 거절 확인 — 신청자에게 알림이 간다. */}
      {reject ? (
        <ModalShell
          onClose={() => setReject(null)}
          onSubmit={() => {
            const r = reject;
            setReject(null);
            doReject(r);
          }}
          label="가입 거절 확인"
        >
          <ModalLayout
            title={`${reject.nickname}님의 가입을 거절할까요?`}
            subtitle={
              <span className="font-bold text-zinc-600 dark:text-zinc-300">
                신청자에게 알림이 갑니다
              </span>
            }
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setReject(null)} disabled={pending}>
                  취소
                </ModalButton>
                <ModalButton
                  tone="danger"
                  onClick={() => {
                    const r = reject;
                    setReject(null);
                    doReject(r);
                  }}
                  disabled={pending}
                >
                  거절
                </ModalButton>
              </>
            }
          >
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              거절해도 다시 신청할 수 있습니다.
            </p>
          </ModalLayout>
        </ModalShell>
      ) : null}
    </div>
  );
}
