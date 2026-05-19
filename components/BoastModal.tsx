'use client';

import { useEffect, useState } from 'react';

import { formatCompactKR } from '@/lib/ui/format-number';
import { TranscendSprite } from '@/components/TranscendSprite';

const SLOT_EMOJI = { weapon: '⚔️', armor: '🛡️', accessory: '💍' } as const;

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
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareUrl(`${window.location.origin}/s/${encodeURIComponent(nickname)}`);
    }
  }, [nickname]);

  if (!open) return null;

  const text =
    kind === 'set'
      ? `${nickname}의 인생강화 — 총 전투력 ⚔️${formatCompactKR(set?.total ?? 0)}`
      : piece
        ? `${nickname} — ${piece.p.name} +${piece.p.enhanceLevel} ✦T${piece.p.transcendLevel} 달성!`
        : `${nickname}의 인생강화`;

  const doShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: '인생강화', text, url: shareUrl });
        return;
      } catch {
        /* 취소/미지원 → 복사로 폴백 */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard 거부 시 무시 */
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="자랑하기"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs overflow-hidden rounded-2xl bg-white dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 미리보기 카드 */}
        <div className="bg-gradient-to-br from-amber-500 to-amber-700 px-4 py-5 text-amber-50">
          <div className="text-[11px] font-medium opacity-90">
            {headline ?? (kind === 'set' ? '🏆 나의 장비 세트' : '✨ 강화 달성')}
          </div>
          <div className="mt-0.5 text-base font-bold">{nickname}</div>

          {kind === 'set' && set ? (
            <>
              <div className="mt-3 space-y-1">
                {(['weapon', 'armor', 'accessory'] as const).map((s) => {
                  const it = set.pieces.find((x) => x.slot === s);
                  return (
                    <div key={s} className="flex items-center gap-2 text-xs">
                      {it ? (
                        <>
                          <TranscendSprite
                            code={it.code}
                            slot={s}
                            level={it.transcendLevel}
                            isChampion={it.isChampion}
                            size={40}
                          />
                          <span className="truncate">
                            {it.name} +{it.enhanceLevel}
                          </span>
                        </>
                      ) : (
                        <>
                          <span aria-hidden>{SLOT_EMOJI[s]}</span>
                          <span className="opacity-60">미장착</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 border-t border-amber-400/40 pt-2 text-right text-sm font-bold">
                ⚔️ 총 전투력 {formatCompactKR(set.total)}
              </div>
            </>
          ) : null}

          {kind === 'piece' && piece ? (
            <div className="mt-3 flex items-center gap-3">
              <TranscendSprite
                code={piece.p.code}
                slot={piece.p.slot}
                level={piece.p.transcendLevel}
                isChampion={piece.p.isChampion}
                size={68}
              />
              <div>
                <div className="text-sm font-bold">
                  {piece.p.name}{' '}
                  <span className="opacity-80">+{piece.p.enhanceLevel}</span>
                </div>
                <div className="text-xs opacity-90">⚔️ 전투력 {formatCompactKR(piece.cp)}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-2 p-3">
          <button
            type="button"
            onClick={doShare}
            className="w-full rounded-full bg-zinc-900 py-2.5 text-sm font-bold text-white dark:bg-zinc-50 dark:text-zinc-950"
          >
            {copied ? '✓ 링크 복사됨' : '🔗 공유하기'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-1.5 text-xs text-zinc-500"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

/** 서버 컴포넌트에서 쓰는 자랑 버튼 런처(세트 단위). */
export function BoastLauncher({
  nickname,
  pieces,
  total,
}: {
  nickname: string;
  pieces: BoastPiece[];
  total: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-amber-300 bg-amber-50 py-2.5 text-sm font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      >
        🔗 내 세트 자랑하기
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
