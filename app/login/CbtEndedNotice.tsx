'use client';

import { useEffect, useState } from 'react';

/**
 * CBT 종료 안내(0144) — system_mode 'cbt_ended' 동안 로그인 화면에 노출.
 * 감사 인사 + 정식 오픈 카운트다운 + 이월 안내. 로그인 수단은 렌더하지 않는다
 * (일반 유저는 오픈까지 입장 불가 — 어드민·심사는 ?test=true 경로).
 */

/** 정식 오픈 시각(KST) — 카운트다운 목표. 오픈 일정이 바뀌면 여기만 고친다. */
export const OPEN_AT_ISO = '2026-08-10T10:00:00+09:00';
const OPEN_LABEL = '8월 10일 오전 10시';

function diffParts(target: number, now: number) {
  const ms = Math.max(0, target - now);
  return {
    d: Math.floor(ms / 86_400_000),
    h: Math.floor(ms / 3_600_000) % 24,
    m: Math.floor(ms / 60_000) % 60,
    s: Math.floor(ms / 1_000) % 60,
    done: ms <= 0,
  };
}

function Countdown() {
  // 하이드레이션 안전 — 서버/첫 클라 렌더는 자리표시자, 마운트 후 1초 틱.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = Date.parse(OPEN_AT_ISO);
  const p = now == null ? null : diffParts(target, now);
  const cell = (v: number | null, label: string) => (
    <div className="flex-1 rounded-xl bg-white/[0.06] py-3">
      <div className="font-mono text-2xl font-black tabular-nums text-amber-300">
        {v == null ? '--' : String(v).padStart(2, '0')}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold text-zinc-500">{label}</div>
    </div>
  );
  if (p?.done) {
    return (
      <p className="rounded-xl bg-amber-500/15 py-3 text-[14px] font-bold text-amber-300">
        곧 문이 열립니다 — 잠시 후 다시 접속해 주세요.
      </p>
    );
  }
  return (
    <div className="flex gap-2 text-center">
      {cell(p?.d ?? null, '일')}
      {cell(p?.h ?? null, '시간')}
      {cell(p?.m ?? null, '분')}
      {cell(p?.s ?? null, '초')}
    </div>
  );
}

export function CbtEndedNotice({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-[11px] leading-relaxed text-amber-200/90">
        CBT 종료 — 정식 오픈({OPEN_LABEL})까지 관리자·심사 계정만 로그인할 수 있습니다.
      </p>
    );
  }
  return (
    <div className="w-full text-center">
      <p className="text-[11px] font-bold tracking-[0.2em] text-amber-400/80">CBT CLOSED</p>
      <h2 className="mt-2 text-xl font-extrabold leading-snug text-zinc-100">
        비공개 테스트가 끝났습니다
      </h2>
      <p className="mt-3 text-[13px] leading-relaxed text-zinc-400">
        한 달 동안 대륙을 함께 두드려 주신 모든 테스터분들께 감사드립니다.
        <br />
        보내주신 문의와 제보 하나하나가 게임을 단단하게 만들었습니다.
      </p>

      <div className="mt-6">
        <p className="mb-2 text-[12px] font-bold text-zinc-300">
          정식 오픈 <span className="text-amber-300">{OPEN_LABEL}</span>
        </p>
        <Countdown />
      </div>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-[12px] leading-relaxed text-zinc-400">
        <p className="font-semibold text-zinc-300">정식 오픈 때 이렇게 시작합니다</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>게임 데이터는 초기화되고, 쓰시던 닉네임은 그대로 유지됩니다.</li>
          <li>CBT 참여 감사 보상이 우편으로 도착해 있습니다.</li>
          <li>친구 초대 보상은 초대 실적만큼 다시 지급됩니다.</li>
        </ul>
      </div>
    </div>
  );
}
