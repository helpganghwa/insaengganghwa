'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  resetReportedNickname,
  resetReportedAvatar,
  warnProfile,
  banReportedUser,
  unbanReportedUser,
  dismissReports,
} from './actions';

const BAN_TEMPLATES = [
  '욕설·비방 등 부적절한 언행으로 이용을 제한합니다.',
  '버그·시스템 악용으로 이용을 제한합니다.',
  '비정상적인 결제·환불 어뷰징으로 이용을 제한합니다.',
  '부적절한 콘텐츠(닉네임·아바타) 반복으로 이용을 제한합니다.',
  '기타 운영정책 위반으로 이용을 제한합니다.',
];

type Action = () => Promise<{ status: string; code?: string }>;

export function AdminReportActions({ profileId, banned }: { profileId: string; banned: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [banOpen, setBanOpen] = useState(false);
  const [reason, setReason] = useState(BAN_TEMPLATES[0]!);
  const [permanent, setPermanent] = useState(true);
  const [until, setUntil] = useState('');

  const run = (fn: Action, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.status !== 'success') setMsg(`실패: ${r.code ?? '알 수 없음'}`);
      else router.refresh();
    });
  };

  const submitBan = () => {
    const r = reason.trim();
    if (!r) {
      setMsg('정지 사유를 입력하세요.');
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await banReportedUser(profileId, r, permanent ? null : until || null);
      if (res.status !== 'success') setMsg(`실패: ${res.code ?? '알 수 없음'}`);
      else {
        setBanOpen(false);
        router.refresh();
      }
    });
  };

  const btn = 'rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50';

  return (
    <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => resetReportedNickname(profileId), '닉네임을 "대장장이N"으로 강제 변경하고 변경 비용을 지급합니다. 계속할까요?')}
          className={`${btn} bg-amber-600 text-white`}
        >
          닉네임 초기화
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => resetReportedAvatar(profileId), '아바타를 기본 아바타로 변경하고 생성 비용을 지급합니다. 계속할까요?')}
          className={`${btn} bg-amber-600 text-white`}
        >
          기본 아바타 전환
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => warnProfile(profileId), '대상에게 경고 우편을 발송할까요?')}
          className={`${btn} border border-amber-400 text-amber-700 dark:border-amber-600 dark:text-amber-400`}
        >
          경고 우편
        </button>
        {banned ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => unbanReportedUser(profileId), '이 계정의 정지를 해제할까요?')}
            className={`${btn} border border-emerald-500 text-emerald-700 dark:text-emerald-400`}
          >
            정지 해제
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setBanOpen((v) => !v)}
            className={`${btn} bg-red-600 text-white`}
          >
            계정 정지
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => dismissReports(profileId), '신고를 기각하고 기록을 삭제합니다(우편 없음). 되돌릴 수 없습니다. 계속할까요?')}
          className={`${btn} border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300`}
        >
          기각
        </button>
      </div>

      {banOpen && !banned && (
        <div className="mt-2 space-y-2 rounded-lg border border-red-300 bg-red-50/50 p-2.5 dark:border-red-900/50 dark:bg-red-950/20">
          <div className="text-[11px] font-bold text-red-700 dark:text-red-300">계정 정지</div>
          <select
            value={BAN_TEMPLATES.includes(reason) ? reason : ''}
            onChange={(e) => e.target.value && setReason(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            {BAN_TEMPLATES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value="">직접 입력…</option>
          </select>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="정지 사유(로그인 시 사용자에게 노출)"
            className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-base dark:border-zinc-700 dark:bg-zinc-900"
          />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={permanent} onChange={(e) => setPermanent(e.target.checked)} />
            영구 정지
          </label>
          {!permanent && (
            <input
              type="datetime-local"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-base dark:border-zinc-700 dark:bg-zinc-900"
            />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setBanOpen(false)} disabled={pending} className={`${btn} flex-1 border border-zinc-300 dark:border-zinc-700`}>
              취소
            </button>
            <button type="button" onClick={submitBan} disabled={pending} className={`${btn} flex-1 bg-red-600 text-white`}>
              {pending ? '처리 중…' : '정지 적용'}
            </button>
          </div>
        </div>
      )}

      {msg && <p className="mt-1.5 text-[11px] text-red-500">{msg}</p>}
    </div>
  );
}
