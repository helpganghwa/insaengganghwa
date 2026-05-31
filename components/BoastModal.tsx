'use client';

import { useEffect, useMemo, useState } from 'react';

import { formatCompactKR } from '@/lib/ui/format-number';

// 공유는 **카카오톡 전용** — 사용자 결정. 링크 복사·navigator.share 분기 제거.
// 카카오 SDK 미로드 시(앱 외부 또는 로딩 실패) 안내 alert.

export type BoastPiece = {
  slot: 'weapon' | 'armor' | 'accessory';
  code: string;
  name: string;
  enhanceLevel: number;
  transcendLevel: number;
  /** 이 유저가 그 카탈로그 아이템의 챔피언(아이템별 1위) — BALANCE §3.3. */
  isChampion: boolean;
};

/**
 * 자랑/공유 모달 — WIREFRAMES §10. 두 단위: 'set'(3슬롯 세트) / 'piece'(장비 1개).
 * 등급 표기 없음(시스템 미존재) — 강화/초월/전투력으로 표현(CLAUDE §3.7).
 * 공유 URL은 짧은 링크 /s/<nickname> (→ /u/<nickname> 공개 프로필, 동적 OG).
 */
export function BoastModal({
  open,
  onClose,
  nickname,
  kind,
  set,
  piece,
  headline,
}: {
  open: boolean;
  onClose: () => void;
  nickname: string;
  kind: 'set' | 'piece';
  set?: { pieces: BoastPiece[]; total: number };
  piece?: { p: BoastPiece; cp: number };
  headline?: string;
}) {
  const [shareUrl, setShareUrl] = useState('');
  // 카카오 SDK는 next/script afterInteractive로 비동기 로드 → 첫 모달 오픈 시점에
  // 아직 init 안 됐을 수 있음. open 동안 200ms 폴링(최대 5s)로 ready 감지 후 활성.
  const [kakaoReady, setKakaoReady] = useState(false);
  const [imgErr, setImgErr] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareUrl(`${window.location.origin}/s/${encodeURIComponent(nickname)}`);
    }
  }, [nickname]);

  useEffect(() => {
    if (!open) return;
    const check = (): boolean => {
      const k = (window as unknown as { Kakao?: { isInitialized: () => boolean } }).Kakao;
      if (k && k.isInitialized()) {
        setKakaoReady(true);
        return true;
      }
      return false;
    };
    if (check()) return;
    const id = window.setInterval(() => {
      if (check()) window.clearInterval(id);
    }, 200);
    const timeout = window.setTimeout(() => window.clearInterval(id), 5000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(timeout);
    };
  }, [open]);

  // 모달 mount 시점 imageUrl 한 번 계산(매 공유 다른 OG). open=false면 빈 값.
  // ⚠ React #310 회피 — 모든 hook은 early return(`if (!open) return null`) **이전**에
  // 호출되어야 함. 같은 컴포넌트 인스턴스의 hook 호출 순서·갯수는 매 render 동일.
  // deps에 piece/set 원시값 추가 — 같은 모달 인스턴스에서 piece 변경 시 stale 회피.
  const imageUrl = useMemo(() => {
    if (!open || typeof window === 'undefined') return '';
    const origin = window.location.origin;
    const v = Math.random().toString(36).slice(2, 10);
    const params = new URLSearchParams({ v });
    if (kind === 'piece' && piece) {
      params.set('focus', 'piece');
      params.set('code', piece.p.code);
      params.set('lvl', String(piece.p.enhanceLevel));
      params.set('t', String(piece.p.transcendLevel));
    } else if (kind === 'set' && set) {
      params.set('focus', 'set');
      params.set('cp', String(set.total));
    }
    return `${origin}/og/${encodeURIComponent(nickname)}?${params.toString()}`;
  }, [
    open, kind, nickname,
    piece?.p.code, piece?.p.enhanceLevel, piece?.p.transcendLevel,
    set?.total,
  ]);

  // 모달 열릴 때마다 에러 상태 리셋(이전 시도의 onError를 다음 시도가 끌고 가지 않게).
  useEffect(() => {
    if (open) setImgErr(false);
  }, [open, imageUrl]);

  if (!open) return null;

  // ── 자랑 멘트 풀 ── 랜덤 노출(매 공유마다 변주). "단조"는 게임 타이틀(인생강화)에 맞춰
  // "강화" 표기. piece는 enhanceLevel 구간별 분기.
  const pickMsg = (): string => {
    if (kind === 'piece' && piece) {
      const lv = piece.p.enhanceLevel;
      const t = piece.p.transcendLevel;
      const pool =
        t >= 10
          ? [
              `✦✦✦ 초월 MAX 달성! 신화에 이름을 새겼다`,
              `최고의 자리에 올랐다 — ✦MAX 영광`,
              `별이 깃든 그 한 자루, ✦10 MAX`,
            ]
          : t >= 1
            ? [
                `✦ 초월 T${t} — 별의 결이 깃들었다`,
                `✦${t} 진화의 증거`,
                `평범한 강철을 넘어 ✦T${t}`,
              ]
            : lv >= 99
              ? [
                  `전설의 영역 — +99 강화 달성!`,
                  `+99, 그 한 끗을 넘었다`,
                  `한계 너머의 +99`,
                ]
              : lv >= 50
                ? [
                    `✨ +${lv} 강화 — 망치가 노래한다`,
                    `+${lv}의 결, 한 계단 위에서 보는 풍경`,
                    `쇠가 한 호흡 멈춘 그 순간 +${lv}`,
                  ]
                : lv >= 30
                  ? [
                      `+${lv} 단계 달성!`,
                      `30고지 돌파 — +${lv}`,
                      `한 망치 한 망치, +${lv}`,
                    ]
                  : [
                      `${piece.p.name} +${lv}!`,
                      `오늘의 한 단계, +${lv}`,
                      `${piece.p.name} 강화 진행 중`,
                    ];
      return `${nickname} — ${pool[Math.floor(Math.random() * pool.length)]}`;
    }
    const setPool = [
      `${nickname}의 인생강화 — 전투력 ${formatCompactKR(set?.total ?? 0)}`,
      `전투력 ${formatCompactKR(set?.total ?? 0)} — 망치의 결실`,
      `한 번에 하나씩, 전투력 ${formatCompactKR(set?.total ?? 0)}`,
      `오늘도 한 망치 — ${nickname}의 전투력 ${formatCompactKR(set?.total ?? 0)}`,
      `${nickname} · 강화의 길 · 전투력 ${formatCompactKR(set?.total ?? 0)}`,
    ];
    return setPool[Math.floor(Math.random() * setPool.length)]!;
  };
  // 매 모달 오픈 시 1회 고정 — 같은 모달 안에서 일관(공유 시 동일 텍스트).
  const text = pickMsg();

  // 카톡 전용 — Kakao.Share.sendDefault. imageUrl에 ?v=<random>으로 카톡 캐시
  // 우회 → 매 공유마다 다른 OG(서버 OG는 sprite·배경 랜덤 합성).
  type KakaoApi = {
    isInitialized: () => boolean;
    Share: {
      sendDefault: (opts: unknown) => void;
    };
  };
  const doShareKakao = () => {
    const k = (window as unknown as { Kakao?: KakaoApi }).Kakao;
    if (!k || !k.isInitialized()) {
      alert('카카오톡 공유가 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    const origin = window.location.origin;
    // imageUrl에 컨텍스트 query — /og route가 seed로 멘트·시각 분기 가능.
    // v=random은 카톡 캐시 우회. focus=piece 시 sprite 1개 강조 모드(OG route 분기).
    const v = Math.random().toString(36).slice(2, 10);
    const params = new URLSearchParams({ v });
    if (kind === 'piece' && piece) {
      params.set('focus', 'piece');
      params.set('code', piece.p.code);
      params.set('lvl', String(piece.p.enhanceLevel));
      params.set('t', String(piece.p.transcendLevel));
    } else if (kind === 'set' && set) {
      params.set('focus', 'set');
      params.set('cp', String(set.total));
    }
    const imageUrl = `${origin}/og/${encodeURIComponent(nickname)}?${params.toString()}`;
    const startUrl = `${origin}/`;
    k.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: kind === 'set' ? `${nickname}의 인생강화` : (headline ?? '✨ 강화 달성'),
        description: text, // 위 pickMsg() 풀에서 1개 — 매번 다른 멘트
        imageUrl,
        // ⚠ 실제 OG PNG 사이즈(1200×630)와 정확히 일치시켜야 카카오가 정상 처리.
        // 사이즈 mismatch면 카카오 image scraper가 무효 처리 후 엑박 캐시 가능.
        imageWidth: 1200,
        imageHeight: 630,
        link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
      },
      buttons: [
        {
          title: '인생강화 시작',
          link: { mobileWebUrl: startUrl, webUrl: startUrl },
        },
        {
          title: '이 플레이어 보기',
          link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
        },
      ],
    });
  };
  // 폴링 결과 — 초기 false, SDK 준비되면 true. (이전 동기 평가는 첫 렌더 1회만 되어
  // SDK 늦게 로드되면 영구 disabled 되는 문제 → 폴링으로 해결)
  const hasKakao = kakaoReady;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="자랑하기"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs overflow-hidden rounded-2xl bg-white shadow-[0_0_40px_rgba(245,158,11,0.18)] ring-1 ring-amber-700/40 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 카톡 메시지 카드 미리보기 — 실제 공유 이미지와 텍스트 */}
        <div className="bg-yellow-300 px-3 py-2 text-[10px] font-bold text-yellow-950">
          💬 카카오톡 공유 미리보기
        </div>
        <div className="bg-white dark:bg-zinc-950">
          {/* OG 이미지 — 실제 카톡 카드 비율 1200×630 ≈ 40:21. onError로 fetch 실패 가시화. */}
          <div className="relative overflow-hidden bg-zinc-900" style={{ aspectRatio: '40/21' }}>
            {imageUrl && !imgErr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="공유 이미지 미리보기"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => {
                  // 미리보기 fetch 실패 — URL을 콘솔에 노출(사용자 디버그 + 우리 후속 진단).
                  console.error('[BoastModal] og preview failed', imageUrl);
                  setImgErr(true);
                }}
              />
            ) : null}
            {imgErr ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-center text-[10px] leading-relaxed text-zinc-400">
                <span>⚠ 미리보기 로드 실패</span>
                <span className="break-all text-zinc-500">{imageUrl}</span>
              </div>
            ) : null}
          </div>
          {/* 카톡 본문 텍스트 카드 */}
          <div className="space-y-1 px-3 py-2.5">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {kind === 'set' ? `${nickname}의 인생강화` : (headline ?? '✨ 강화 달성')}
            </div>
            <div className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              {text}
            </div>
            <div className="text-[10px] text-zinc-400 dark:text-zinc-500">insaengganghwa.com</div>
            {/* 카톡 버튼 미리보기 */}
            <div className="mt-2 flex gap-1.5">
              <span className="flex-1 rounded border border-zinc-300 px-2 py-1 text-center text-[11px] text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
                인생강화 시작
              </span>
              <span className="flex-1 rounded border border-zinc-300 px-2 py-1 text-center text-[11px] text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
                이 플레이어 보기
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2 p-3">
          <button
            type="button"
            onClick={doShareKakao}
            disabled={!hasKakao}
            className="w-full rounded-full bg-yellow-300 py-2.5 text-sm font-bold text-yellow-950 disabled:opacity-50"
          >
            {hasKakao ? '💬 카카오톡 공유' : '💬 카카오톡 준비 중…'}
          </button>
          <button type="button" onClick={onClose} className="w-full py-1.5 text-xs text-zinc-500">
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

/** 서버 컴포넌트에서 쓰는 자랑 버튼 런처(세트 단위). compact=헤더용 작은 칩 형태. */
export function BoastLauncher({
  nickname,
  pieces,
  total,
  compact = false,
}: {
  nickname: string;
  pieces: BoastPiece[];
  total: number;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="카카오톡으로 자랑하기"
        className={
          compact
            ? 'inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-[#FEE500] px-2.5 text-xs font-semibold text-[#191919]'
            : 'flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-2.5 text-sm font-semibold text-[#191919]'
        }
      >
        {/* 카카오 말풍선 아이콘 (인라인 SVG — 외부 파일 의존 없음). */}
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}
          fill="currentColor"
        >
          <path d="M12 3C6.477 3 2 6.477 2 10.7c0 2.61 1.66 4.92 4.2 6.3l-.83 3.05a.4.4 0 0 0 .6.42l3.66-2.43c.77.12 1.56.19 2.37.19 5.523 0 10-3.477 10-7.74S17.523 3 12 3Z" />
        </svg>
        {compact ? '자랑' : '내 프로필 자랑하기'}
      </button>
      <BoastModal
        open={open}
        onClose={() => setOpen(false)}
        nickname={nickname}
        kind="set"
        set={{ pieces, total }}
      />
    </>
  );
}
