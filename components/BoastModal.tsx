'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { TranscendSprite } from '@/components/TranscendSprite';
import { rarityBorderStyle, hasRarityBorder, TranscendTag } from '@/components/RarityFrame';
import { GuildBadge } from '@/components/GuildBadge';
import { getEnhancingUserCount } from '@/app/(game)/me/actions';

// 공유는 **카카오톡 전용** — 사용자 결정. 링크 복사·navigator.share 분기 제거.
// 카카오 SDK 미로드 시(앱 외부 또는 로딩 실패) 안내 alert.

const SLOT_LABEL = { weapon: '무기', armor: '방어구', accessory: '장신구' } as const;
const SLOT_EMOJI = { weapon: '⚔️', armor: '🛡️', accessory: '💍' } as const;

export type BoastPiece = {
  slot: 'weapon' | 'armor' | 'accessory';
  code: string;
  name: string;
  enhanceLevel: number;
  transcendLevel: number;
  /** 해방 등수(강화랭킹 1~3위) — 후광 색용. null=해방 아님. */
  championRank: number | null;
  /** 미리보기 sprite 식별용. me/page에서 전달, 다른 경로는 optional. */
  catalogItemId?: number;
};

/**
 * 자랑/공유 모달 — WIREFRAMES §10. 두 단위: 'set'(3슬롯 세트) / 'piece'(장비 1개).
 * 등급 표기 없음(시스템 미존재) — 강화/초월/전투력으로 표현(CLAUDE §3.7).
 * 공유·OG URL은 불변 공개 코드 기반(/s/<code> → /u/<code>) — 닉 변경에도 안 깨짐.
 * 닉네임은 표시(타이틀·미리보기)용으로만 사용.
 */
export function BoastModal({
  open,
  onClose,
  nickname,
  publicCode,
  kind,
  set,
  piece,
  headline,
  profileImg,
  guildEmblemUrl = null,
  guildName = null,
  serverId = 1,
}: {
  open: boolean;
  onClose: () => void;
  nickname: string;
  /** 불변 공개 코드 — 공유/OG 링크 식별자. */
  publicCode: string;
  kind: 'set' | 'piece';
  set?: { pieces: BoastPiece[]; total: number };
  piece?: { p: BoastPiece; cp: number };
  headline?: string;
  /** 미리보기에 그릴 활성 프로필 캐릭터 이미지(me/page profileImg). null이면 폴백. */
  profileImg?: string | null;
  /** 닉네임 밑 길드 문양+이름(미소속/생성중이면 미표시). */
  guildEmblemUrl?: string | null;
  /** 캐릭터의 서버(SERVER.md) — 1이 아니면 공유/OG 링크에 ?s= 전파. */
  serverId?: number;
  guildName?: string | null;
}) {
  const [shareUrl, setShareUrl] = useState('');
  // 카카오 SDK는 next/script afterInteractive로 비동기 로드 → 첫 모달 오픈 시점에
  // 아직 init 안 됐을 수 있음. open 동안 200ms 폴링(최대 5s)로 ready 감지 후 활성.
  const [kakaoReady, setKakaoReady] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  // description의 'N명이 인생 강화중' — 모달 마운트 시 1회 fetch(60s 캐시).
  const [enhancingCount, setEnhancingCount] = useState<number | null>(null);
  // Portal — main(overflow-y-auto) 내부의 stacking 충돌로 BottomNav가 dim 위로 떠
  // 보이는 문제 회피. document.body 직속 렌더 → 무조건 root context.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sfx = serverId !== 1 ? `?s=${serverId}` : '';
      setShareUrl(`${window.location.origin}/s/${encodeURIComponent(publicCode)}${sfx}`);
    }
  }, [publicCode, serverId]);

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
    if (serverId !== 1) params.set('s', String(serverId));
    return `${origin}/og/${encodeURIComponent(publicCode)}?${params.toString()}`;
  }, [
    open, kind, publicCode, serverId,
    piece?.p.code, piece?.p.enhanceLevel, piece?.p.transcendLevel,
    set?.total,
  ]);

  // 모달 열릴 때마다 에러 상태 리셋(이전 시도의 onError를 다음 시도가 끌고 가지 않게).
  useEffect(() => {
    if (open) setImgErr(false);
  }, [open, imageUrl]);

  // 'N명이 인생 강화중' 카운트 — 모달 마운트 시 1회. (캐시 60s라 가볍게)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await getEnhancingUserCount();
        if (!cancelled) setEnhancingCount(c);
      } catch {
        if (!cancelled) setEnhancingCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open || !portalReady) return null;

  // 사용자 결정(2026-05-31): 타이틀·설명을 고정 문구로 통일.
  //   title       = "{nick} - '강화는 인생이다'"
  //   description = "인생강화에서 N명이 인생 강화중" (N=현재 강화중 distinct user)
  const setTitle =
    kind === 'set' ? `${nickname} - '강화는 인생이다'` : (headline ?? '✨ 강화 달성');
  const text =
    enhancingCount !== null
      ? `인생강화에서 ${enhancingCount.toLocaleString('ko-KR')}명이 인생 강화중`
      : '인생강화에서 지금도 누군가 인생 강화중';

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
    if (serverId !== 1) params.set('s', String(serverId));
    const imageUrl = `${origin}/og/${encodeURIComponent(publicCode)}?${params.toString()}`;
    // '인생강화 시작' — /s/[code]?start=1로 보내 pending_referral 쿠키를 세팅(추천 귀속) 후
    // 앱 시작(/)으로 리다이렉트. 직접 '/'로 보내면 쿠키가 없어 추천인 리워드가 누락됨.
    const startUrl = `${origin}/s/${encodeURIComponent(publicCode)}?start=1${serverId !== 1 ? `&s=${serverId}` : ''}`;
    k.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: setTitle,
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

  const kakaoIcon = (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
      <path d="M12 3C6.477 3 2 6.477 2 10.7c0 2.61 1.66 4.92 4.2 6.3l-.83 3.05a.4.4 0 0 0 .6.42l3.66-2.43c.77.12 1.56.19 2.37.19 5.523 0 10-3.477 10-7.74S17.523 3 12 3Z" />
    </svg>
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="자랑하기"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col isolate overflow-hidden rounded-2xl bg-zinc-950 shadow-[0_0_40px_rgba(245,158,11,0.18)] ring-1 ring-amber-700/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 카톡 헤더 — 카카오 노란 톤 */}
        <div className="flex items-center gap-1.5 bg-[#FEE500] px-3 py-2 text-[11px] font-bold text-[#191919]">
          <span className="text-[#191919]">{kakaoIcon}</span>
          카카오톡 공유 미리보기
        </div>

        {/* 미리보기 카드 — 프로필 페이지 프로필 섹션과 동일 구성(좌 캐릭터·우 장비 3종). */}
        <div className="flex-1 overflow-y-auto bg-zinc-950 p-3">
          <section className="rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-3">
            <div className="flex items-stretch gap-2">
              {/* 좌(4) — 닉네임 + 캐릭터(머리위 닉네임은 작게) */}
              <div className="flex basis-2/5 flex-col items-center gap-1">
                <span className="truncate text-xs font-normal text-white">{nickname}</span>
                <GuildBadge
                  emblemUrl={guildEmblemUrl}
                  name={guildName}
                  size={13}
                  pinEmblemRight
                  className="max-w-full text-[10px] text-white/70"
                />
                <div className="relative aspect-[3/4] h-36 overflow-hidden">
                  {profileImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profileImg}
                      alt=""
                      aria-hidden
                      draggable={false}
                      className="absolute inset-0 h-full w-full object-contain object-bottom"
                      style={{
                        imageRendering: 'pixelated',
                        // /me 프로필 섹션(3:4)과 동일 — 풀프레임을 박스에 채우는 scale 1.4.
                        transform: 'scale(1.4)',
                        transformOrigin: 'center bottom',
                      }}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-2xl text-white/40">
                      ✨
                    </div>
                  )}
                </div>
              </div>
              {/* 우(6) — 장비 3종(없으면 미장착 자리). me/page와 동일 — TranscendSprite + rarity border. */}
              <div className="flex basis-3/5 flex-col gap-1.5">
                {(['weapon', 'armor', 'accessory'] as const).map((s) => {
                  const it = set?.pieces.find((p) => p.slot === s);
                  if (!it) {
                    return (
                      <div
                        key={s}
                        className="flex flex-1 items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-2 text-[11px] text-white/45"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/5 text-base" aria-hidden>
                          {SLOT_EMOJI[s]}
                        </span>
                        <span>{SLOT_LABEL[s]} 미장착</span>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={s}
                      style={rarityBorderStyle(it.transcendLevel)}
                      className={`flex flex-1 items-center gap-2 rounded-xl border bg-white/5 px-2 ${
                        hasRarityBorder(it.transcendLevel) ? '' : 'border-white/10'
                      }`}
                    >
                      <div className="shrink-0">
                        <TranscendSprite
                          code={it.code}
                          slot={s}
                          level={it.transcendLevel}
                          championRank={it.championRank}
                          size={34}
                          frameless
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 break-keep text-[11px] leading-tight text-white/85">{it.name}</div>
                        <div className="text-[11px] font-bold tabular-nums text-white">
                          +{it.enhanceLevel}
                          <TranscendTag level={it.transcendLevel} className="ml-1" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 카톡 본문 텍스트 카드 */}
          <div className="mt-3 space-y-1 px-1">
            <div className="text-sm font-semibold text-zinc-100">{setTitle}</div>
            <div className="text-[12px] leading-relaxed text-zinc-400">{text}</div>
            <div className="text-[10px] text-zinc-500">insaengganghwa.com</div>
            <div className="mt-2 flex gap-1.5">
              <span className="flex-1 rounded border border-zinc-700 px-2 py-1 text-center text-[11px] text-zinc-300">
                인생강화 시작
              </span>
              <span className="flex-1 rounded border border-zinc-700 px-2 py-1 text-center text-[11px] text-zinc-300">
                이 플레이어 보기
              </span>
            </div>
          </div>

          {/* OG fetch 실패 시 디버그 정보(개발자만 보임, 사용자 무관). */}
          {imgErr ? (
            <div className="mt-2 break-all rounded bg-zinc-900 p-2 text-[9px] text-zinc-500">
              ⚠ OG 미리보기 fetch 실패: {imageUrl}
            </div>
          ) : null}
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              aria-hidden
              className="hidden"
              onError={() => {
                console.error('[BoastModal] og preview failed', imageUrl);
                setImgErr(true);
              }}
            />
          ) : null}
        </div>

        {/* 버튼 영역 — 스크롤 영역(위) 바깥, 모달 하단 고정. */}
        <div className="shrink-0 space-y-2 border-t border-zinc-900 bg-zinc-950 p-3">
          <button
            type="button"
            onClick={doShareKakao}
            disabled={!hasKakao}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3 text-sm font-bold text-[#191919] disabled:opacity-50"
          >
            {kakaoIcon}
            {hasKakao ? '카카오톡 공유' : '카카오톡 준비 중…'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-1.5 text-xs text-zinc-400"
          >
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 서버 컴포넌트에서 쓰는 자랑 버튼 런처(세트 단위). compact=헤더용 작은 칩 형태. */
export function BoastLauncher({
  nickname,
  publicCode,
  pieces,
  total,
  profileImg,
  compact = false,
  label,
  guildEmblemUrl = null,
  serverId = 1,
  guildName = null,
}: {
  nickname: string;
  /** 불변 공개 코드 — 공유/OG 링크 식별자. */
  publicCode: string;
  pieces: BoastPiece[];
  total: number;
  profileImg?: string | null;
  compact?: boolean;
  /** 풀 버튼 라벨 — 기본 '내 프로필 자랑하기'. 타인 프로필은 '프로필 공유하기' 등. */
  label?: string;
  guildEmblemUrl?: string | null;
  guildName?: string | null;
  /** 캐릭터의 서버 — 공유/OG 링크 ?s= 전파(기본 1). */
  serverId?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label ?? '카카오톡으로 자랑하기'}
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
        {compact ? '자랑' : (label ?? '내 프로필 자랑하기')}
      </button>
      <BoastModal
        open={open}
        onClose={() => setOpen(false)}
        nickname={nickname}
        publicCode={publicCode}
        kind="set"
        set={{ pieces, total }}
        profileImg={profileImg ?? null}
        guildEmblemUrl={guildEmblemUrl}
        guildName={guildName}
        serverId={serverId}
      />
    </>
  );
}
