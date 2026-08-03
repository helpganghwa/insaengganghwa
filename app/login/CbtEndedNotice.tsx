'use client';

import { useEffect, useState } from 'react';

import { BgmPlayer } from '@/components/audio/BgmPlayer';

import { OpenDateChangeModal } from './OpenDateChangeModal';

/**
 * CBT 종료 화면(0144, C안+결산 — 2026-07-31 확정) — system_mode 'cbt_ended' 동안 로그인
 * 화면을 대체. 세로 풀블리드 일러스트(오버레이: 감사 인사 + 카운트다운) 아래 CBT 실측
 * 결산 명판. 로그인 수단은 렌더하지 않는다(어드민·심사는 ?test=true 경로).
 *
 * 히어로 이미지: public/cbt-ended.webp (나노바나나 생성 768×1376 픽셀아트 — 새벽의 대장간).
 * 파일이 없으면 그라데이션 폴백이 그대로 보인다(CSS 배경 레이어 — 깨진 이미지 없음).
 */

/** 정식 오픈 시각(KST) — 카운트다운 목표. 오픈 일정이 바뀌면 여기만 고친다. */
export const OPEN_AT_ISO = '2026-08-24T11:00:00+09:00';
const OPEN_LABEL = '8월 24일 오전 11시';

/**
 * CBT 결산(프로덕션 실측, L-2 문장형 — 2026-07-31 확정) — 종료 시점 값으로 고정한다.
 * 라이브 집계를 쓰지 않는 이유: wipe 후엔 원본이 사라져 어차피 스냅샷이어야 하고,
 * 로그인 화면에 DB 왕복을 더할 이유도 없다. ⚠ 컷오버 데이(모드 켜기 직전) 최종 수치로 갱신.
 */
// CBT 종료 시점(2026-08-01 00:00 KST) 프로덕션 실측 — 동결 직전 마지막 갱신.
const STAT = {
  smiths: '256명',
  boxes: '832,901개',
  hammered: '431,370번',
  sparks: '266,468번', // 성공(success+mega)
  tempered: '164,902번', // 담금질 = 유지 + 하락
  peak: '+558',
  flags: '148번',
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
    <div
      className="flex-1 rounded-xl border border-amber-500/35 bg-[#17110c]/70 py-3 backdrop-blur-[2px]"
      style={{ boxShadow: '0 0 18px rgba(240,171,60,0.12)' }}
    >
      <div
        className="font-mono text-[24px] font-black leading-tight tabular-nums text-amber-300"
        style={{ textShadow: '0 0 14px rgba(252,211,77,0.45)' }}
      >
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
    <div className="relative flex w-full flex-1 flex-col overflow-hidden">
      {/* 배경음 — 연출용 강제 재생(설정 무관). 자동재생이 막히면 첫 터치에서 시작. */}
      <BgmPlayer track="forge-dawn" force />
      {/* 배경 — 콘텐츠 뒤 전면(2026-07-31 피드백: 이미지 상단이 빈 채 스크롤만 길어지던 구조
          → 배경화 + 콘텐츠를 위에서부터). 높이는 콘텐츠가 정하고 이미지는 cover로 채운다. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-cover bg-top"
        style={{
          backgroundImage:
            "url('/cbt-ended.webp'), radial-gradient(110% 70% at 50% 20%, #46331c 0%, #2a1d0e 50%, #17110c 100%)",
          imageRendering: 'pixelated',
        }}
      />
      {/* 가독 스크림 + 하단 페이드(푸터 배경 #17110c로 자연 연결) */}
      <div aria-hidden className="absolute inset-0 bg-[#17110c]/40" />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[#17110c]"
      />

      <div className="relative z-10 flex flex-1 flex-col px-6 pb-9 pt-14 text-center">
        <p className="text-[11px] font-extrabold tracking-[0.25em] text-amber-400/85">
          SEE YOU SOON
        </p>
        <h2 className="mt-2 text-[22px] font-extrabold leading-snug text-zinc-50 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          다음 대륙에서 만나요
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-zinc-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          비공개 테스트가 끝났습니다. 함께해 주셔서 감사합니다.
        </p>

        <p className="mt-7 text-[13px] font-bold text-zinc-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          정식 오픈 <span className="text-amber-300">{OPEN_LABEL}</span>
        </p>
        <div className="mt-2">
          <Countdown />
        </div>

        {/* 결산 — 하루의 서사+담금질+저마다의 시간(확정 문구). E-1 위계: 기조는 회색,
            앰버 강조는 셋만(두드림·정점·인원) — 서사가 카운트다운보다 무거우면 안 된다.
            줄은 의미 단위로 <span block> 분할해 390 폭에서 중간 줄바꿈이 생기지 않게 한다. */}
        <div className="mt-8 space-y-0.5 text-[12px] leading-[1.85] text-zinc-400 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
          <span className="block break-keep">
            아침이면 <b className="font-bold text-zinc-200">{STAT.boxes}</b>의 보급상자가 열렸고,
          </span>
          <span className="block break-keep">
            낮이면 망치 소리가 <b className="font-extrabold text-amber-300">{STAT.hammered}</b>{' '}
            울렸습니다.
          </span>
          <span className="block break-keep">
            <b className="font-bold text-zinc-200">{STAT.sparks}</b>은 불꽃이 됐고
          </span>
          <span className="block break-keep">
            <b className="font-bold text-zinc-200">{STAT.tempered}</b>은 담금질이 됐으며,
          </span>
          <span className="block break-keep">
            누군가는 <b className="font-extrabold text-amber-300">{STAT.peak}</b>까지 올랐습니다.
          </span>
          <span className="block break-keep">
            밤이면 대륙 어딘가에서 깃발이 <b className="font-bold text-zinc-200">{STAT.flags}</b>{' '}
            바뀌었습니다.
          </span>
          <span className="mt-2 block break-keep">
            그렇게 <b className="font-extrabold text-amber-300">{STAT.smiths}</b>의 대장장이가
            저마다의 시간으로
          </span>
          <span className="block break-keep">한 달의 대륙을 데웠습니다.</span>
          <span className="mt-2 block break-keep">
            이제 잠시 불을 끄고, <b className="font-bold text-zinc-200">8월 24일</b>에 다시
            만나요.
          </span>
        </div>
      </div>
      {/* 오픈일 변경(8/10 → 8/24) — 본문은 날짜만 바뀌므로 변경 사실은 이 팝업이 알린다. 기기별 1회. */}
      <OpenDateChangeModal />
    </div>
  );
}
