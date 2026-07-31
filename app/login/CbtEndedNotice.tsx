'use client';

import { useEffect, useState } from 'react';

import { OpenAlertSection } from './OpenAlertSection';

/**
 * CBT 종료 화면(0144, C안+결산 — 2026-07-31 확정) — system_mode 'cbt_ended' 동안 로그인
 * 화면을 대체. 세로 풀블리드 일러스트(오버레이: 감사 인사 + 카운트다운) 아래 CBT 실측
 * 결산 명판. 로그인 수단은 렌더하지 않는다(어드민·심사는 ?test=true 경로).
 *
 * 히어로 이미지: public/cbt-ended.webp (나노바나나 생성, 864×1536, 하단 #17110c 페이드).
 * 파일이 없으면 그라데이션 폴백이 그대로 보인다(CSS 배경 레이어 — 깨진 이미지 없음).
 */

/** 정식 오픈 시각(KST) — 카운트다운 목표. 오픈 일정이 바뀌면 여기만 고친다. */
export const OPEN_AT_ISO = '2026-08-10T11:00:00+09:00';
const OPEN_LABEL = '8월 10일 오전 11시';

/**
 * CBT 결산(프로덕션 실측, L-2 문장형 — 2026-07-31 확정) — 종료 시점 값으로 고정한다.
 * 라이브 집계를 쓰지 않는 이유: wipe 후엔 원본이 사라져 어차피 스냅샷이어야 하고,
 * 로그인 화면에 DB 왕복을 더할 이유도 없다. ⚠ 컷오버 데이(모드 켜기 직전) 최종 수치로 갱신.
 */
const STAT = {
  smiths: '256명',
  hammered: '408,234번',
  peak: '+488',
  battles: '143번',
} as const;

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
    <div className="flex-1 rounded-xl bg-white/[0.07] py-2.5 backdrop-blur-[2px]">
      <div className="font-mono text-[22px] font-black leading-tight tabular-nums text-amber-300">
        {v == null ? '--' : String(v).padStart(2, '0')}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold text-zinc-400">{label}</div>
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
    <div className="w-full">
      {/* 풀블리드 히어로 — 이미지 위 하단 오버레이(감사 + 카운트다운). */}
      <div
        className="relative flex aspect-[864/1536] w-full flex-col justify-end bg-cover bg-top"
        style={{
          // 이미지 없으면 아래 그라데이션이 폴백 — url이 앞이라 파일이 생기면 자동 교체.
          backgroundImage:
            "url('/cbt-ended.webp'), radial-gradient(110% 70% at 50% 20%, #46331c 0%, #2a1d0e 50%, #17110c 100%)",
        }}
      >
        <div className="bg-gradient-to-t from-[#17110c] from-45% via-[#17110c]/75 to-transparent px-6 pb-2 pt-24 text-center">
          <p className="text-[11px] font-extrabold tracking-[0.25em] text-amber-400/85">
            SEE YOU SOON
          </p>
          <h2 className="mt-2 text-[22px] font-extrabold leading-snug text-zinc-50">
            다음 대륙에서 만나요
          </h2>
          <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
            비공개 테스트가 끝났습니다. 함께해 주셔서 감사합니다.
          </p>
          <p className="mt-5 text-[12px] font-bold text-zinc-300">
            정식 오픈 <span className="text-amber-300">{OPEN_LABEL}</span>
          </p>
          <div className="mt-2">
            <Countdown />
          </div>
        </div>
      </div>

      {/* 결산 — 표가 아니라 이야기(L-2). 숫자만 앰버 강조, 수치는 종료 시점 고정(위 STAT 주석).
          "기록 위에서 시작" 같은 승계 암시 문구는 쓰지 않는다 — 데이터는 초기화된다. */}
      <div className="px-6 pt-5">
        <p className="text-center text-[13.5px] leading-loose text-zinc-300">
          CBT 한 달 동안 <b className="font-extrabold text-amber-300">{STAT.smiths}</b>의 대장장이가
          <br />
          망치를 <b className="font-extrabold text-amber-300">{STAT.hammered}</b> 내리쳤고,
          <br />
          누군가는 <b className="font-extrabold text-amber-300">{STAT.peak}</b>까지 올랐으며,
          <br />
          대륙에선 <b className="font-extrabold text-amber-300">{STAT.battles}</b>의 점령전이
          벌어졌습니다.
        </p>

        {/* 명예의 전당 — 실측 1위들(2026-07-31 채굴). 닉네임 노출은 랭킹과 동일 공개 범위.
            수치·이름은 컷오버 데이 최종 갱신 대상(위 STAT과 함께). */}
        <div className="mt-6">
          <p className="text-center text-[10px] font-extrabold tracking-[0.22em] text-amber-400/70">
            CBT 명예의 전당
          </p>
          <div className="mt-2.5 space-y-1.5 text-center text-[12px] leading-relaxed text-zinc-400">
            <p>
              아바타를 <b className="font-bold text-zinc-200">96개</b>나 만든{' '}
              <b className="font-bold text-amber-300">SEB</b>
            </p>
            <p>
              망치를 <b className="font-bold text-zinc-200">13,171번</b> 두드린{' '}
              <b className="font-bold text-amber-300">Eclipse</b>
            </p>
            <p>
              가장 높은 곳(<b className="font-bold text-zinc-200">+488</b>)에 오른{' '}
              <b className="font-bold text-amber-300">미르</b>
            </p>
            <p>
              상자 <b className="font-bold text-zinc-200">19,804개</b>를 열고 대난투{' '}
              <b className="font-bold text-zinc-200">9번</b> 우승한{' '}
              <b className="font-bold text-amber-300">LEGEND</b>
            </p>
            <p>
              친구 <b className="font-bold text-zinc-200">10명</b>을 데려오고 문의{' '}
              <b className="font-bold text-zinc-200">29건</b>을 보내준{' '}
              <b className="font-bold text-amber-300">여왕</b>
            </p>
          </div>
        </div>

        {/* 오픈 알림(0145) — 종료 화면 트래픽을 오픈일 복귀로 전환하는 유일한 접점. */}
        <OpenAlertSection />
      </div>
    </div>
  );
}
