'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import { toPng } from 'html-to-image';

import { useResourceToast } from '@/components/ResourceToast';

/**
 * 오늘의 성장 공유(2026-07-16 확정) — 미리보기 = 실제 OG PNG 직표시(카톡과 물리적 동일 파일).
 * 버튼: 카카오톡 공유 · 링크 복사 · 💾 이미지로 저장(같은 PNG 다운로드).
 */
export function TodayShareBox({
  mode = 'today',
  nickname,
  publicCode,
  serverId,
  statsLine,
}: {
  /** today=오늘의 성장 카드, all=통산(나의 인생강화) 카드 — 문구·OG 레이아웃 분기. */
  mode?: 'today' | 'all';
  nickname: string;
  publicCode: string;
  serverId: number;
  statsLine: string;
}) {
  const [open, setOpen] = useState(false);
  const [kakaoReady, setKakaoReady] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const { showHeaderToast, showError } = useResourceToast();

  // 매 오픈마다 새 OG(v=rand — 카톡 캐시 우회 + 최신 수치 반영).
  const ogUrl = useMemo(() => {
    if (!open || typeof window === 'undefined') return '';
    const v = Math.random().toString(36).slice(2, 10);
    return `${window.location.origin}/og/today/${encodeURIComponent(publicCode)}?s=${serverId}&v=${v}${mode === 'all' ? '&mode=all' : ''}`;
  }, [open, publicCode, serverId, mode]);

  useEffect(() => {
    if (!open) return;
    setImgLoaded(false);
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

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/s/${encodeURIComponent(publicCode)}?s=${serverId}`
      : '';

  const doShare = () => {
    type KakaoApi = { isInitialized: () => boolean; Share: { sendDefault: (o: unknown) => void } };
    const k = (window as unknown as { Kakao?: KakaoApi }).Kakao;
    if (!k || !k.isInitialized()) {
      showError('카카오톡 공유가 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    const origin = window.location.origin;
    const startUrl = `${origin}/s/${encodeURIComponent(publicCode)}?start=1&s=${serverId}`;
    k.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: mode === 'all' ? `${nickname} - 나의 인생강화` : `${nickname} - 오늘도 강화는 인생이다`,
        description: statsLine,
        imageUrl: ogUrl,
        imageWidth: 1200,
        imageHeight: 630,
        link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
      },
      buttons: [
        { title: '인생강화 시작', link: { mobileWebUrl: startUrl, webUrl: startUrl } },
        { title: '이 플레이어 보기', link: { mobileWebUrl: shareUrl, webUrl: shareUrl } },
      ],
    });
  };

  const [saving, setSaving] = useState(false);
  // 저장 = 페이지 전체 캡처(2026-07-16 확정 — 타이틀·날짜 포함, 탭 필터·하단 버튼만 제외).
  // filter로 [data-capture-exclude] 노드를 클론에서 제거. style 오버라이드 없음(레이아웃 변형이
  // 우측 잘림을 유발했음) — 페이지 자체 패딩(px-4 py-4)이 여백 역할.
  const doSaveImage = async () => {
    if (saving) return;
    const node = document.getElementById('today-page');
    if (!node) return;
    setSaving(true);
    try {
      const dark = document.documentElement.classList.contains('dark');
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: dark ? '#09090b' : '#ffffff',
        width: node.offsetWidth,
        height: node.offsetHeight,
        filter: (n) => !(n instanceof HTMLElement && n.dataset.captureExclude != null),
      });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `${mode === 'all' ? '나의인생강화' : '오늘의인생강화'}_${nickname}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: mode === 'all' ? '나의 인생강화' : '오늘의 인생강화' });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = file.name;
        a.click();
      }
    } catch {
      /* 사용자 취소(AbortError) 포함 — 무시 */
    } finally {
      setSaving(false);
    }
  };

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showHeaderToast({ title: '링크를 복사했어요' });
    } catch {
      showHeaderToast({ title: '복사에 실패했어요' });
    }
  };

  return (
    <>
      <div data-capture-exclude>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3 text-sm font-extrabold text-[#191919] active:scale-[0.99]"
        >
          💬 {mode === 'all' ? '나의 인생강화 자랑하기' : '오늘의 성장 자랑하기'}
        </button>
        <button
          type="button"
          onClick={doSaveImage}
          disabled={saving}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 py-2.5 text-[12.5px] font-bold text-zinc-600 active:scale-[0.99] disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300"
        >
          {saving ? '이미지 준비 중…' : '💾 이미지로 저장'}
        </button>
      </div>

      {open
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="성장 자랑하기"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            >
              <div
                className="w-full max-w-sm overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-amber-700/40"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="bg-[#FEE500] px-3 py-2 text-[11px] font-bold text-[#191919]">
                  카카오톡 공유 미리보기
                </div>
                <div className="p-3">
                  {/* 미리보기 = 실제 OG PNG(카톡이 가져가는 그 파일) — 어긋날 수 없음. */}
                  <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-xl bg-zinc-900">
                    {!imgLoaded ? (
                      <div className="absolute inset-0 flex items-center justify-center text-[11px] text-zinc-500">
                        카드 생성 중…
                      </div>
                    ) : null}
                    {ogUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ogUrl}
                        alt="오늘의 성장 카드"
                        className="h-full w-full object-cover"
                        onLoad={() => setImgLoaded(true)}
                      />
                    ) : null}
                  </div>
                  <div className="mt-2 space-y-0.5 px-1">
                    <div className="text-[13px] font-semibold text-zinc-100">{nickname} - {mode === 'all' ? '나의 인생강화' : '오늘도 강화는 인생이다'}</div>
                    <div className="text-[11px] text-zinc-400">{statsLine}</div>
                  </div>
                </div>
                <div className="space-y-2 border-t border-zinc-900 p-3">
                  <button
                    type="button"
                    onClick={doShare}
                    disabled={!kakaoReady}
                    className="w-full rounded-xl bg-[#FEE500] py-3 text-sm font-bold text-[#191919] disabled:opacity-50"
                  >
                    {kakaoReady ? '💬 카카오톡 공유' : '카카오톡 준비 중…'}
                  </button>
                  <button
                    type="button"
                    onClick={doCopy}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-2.5 text-sm font-bold text-zinc-200"
                  >
                    🔗 링크 복사
                  </button>
                  <button type="button" onClick={() => setOpen(false)} className="w-full py-1 text-xs text-zinc-400">
                    닫기
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
