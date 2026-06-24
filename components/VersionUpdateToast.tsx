/**
 * 새 배포 자동 적용 — PWA standalone에서 종료/재실행 없이 최신 버전으로 자동 갱신.
 *
 * 동작:
 *  1. mount 시 /api/health → 현재 deployment id 기록(firstDpl)
 *  2. 1분 interval + visibility 변경(백그라운드→포그라운드) 시 폴링
 *  3. dpl 변경 감지 → 플래그 저장 + **자동 새로고침**(기존 '지금 적용' 버튼 제거)
 *  4. 새로고침 후 mount 시 플래그 있으면 "새 버전으로 자동 업데이트 되었어요" 헤더 토스트
 *
 * 로컬 dev(dpl='dev')에선 트리거 X. Vercel preview/production만 작동.
 */
'use client';

import { useEffect } from 'react';

import { useResourceToast } from '@/components/ResourceToast';

const POLL_INTERVAL_MS = 60_000;
const UPDATED_FLAG = 'ig:auto-updated';
const RELOAD_TS = 'ig:last-auto-reload';
// 롤링 배포 중 인스턴스별 dpl이 엇갈리면(핑퐁) 무한 새로고침 위험 → 브라우저당 쿨다운 1회.
const RELOAD_COOLDOWN_MS = 10 * 60_000;

export function VersionUpdateToast() {
  const { showHeaderToast } = useResourceToast();

  // 자동 새로고침 직후 — 안내 토스트 1회.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(UPDATED_FLAG)) {
      sessionStorage.removeItem(UPDATED_FLAG);
      showHeaderToast({ title: '✨ 새 버전으로 자동 업데이트 되었어요 ✨' });
    }
  }, [showHeaderToast]);

  // 새 배포 감지 → 자동 새로고침.
  useEffect(() => {
    let firstDpl: string | null = null;
    let reloaded = false;

    async function check() {
      try {
        const r = await fetch('/api/health', { cache: 'no-store' });
        if (!r.ok) return;
        const j = (await r.json()) as { dpl?: string };
        const cur = j.dpl;
        if (!cur || cur === 'dev') return; // 로컬 dev — 폴링 의미 없음
        if (firstDpl === null) {
          firstDpl = cur;
          return;
        }
        if (cur !== firstDpl && !reloaded) {
          // 쿨다운 내면 핑퐁 가능성 — 새로고침 대신 기준만 갱신해 루프 차단.
          const last = Number(localStorage.getItem(RELOAD_TS) ?? '0');
          if (Date.now() - last < RELOAD_COOLDOWN_MS) {
            firstDpl = cur;
            return;
          }
          reloaded = true;
          localStorage.setItem(RELOAD_TS, String(Date.now()));
          sessionStorage.setItem(UPDATED_FLAG, '1'); // 새로고침 후 토스트용
          window.location.reload();
        }
      } catch {
        // 네트워크 실패 — 다음 사이클 재시도
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null; // UI 없음 — 자동 새로고침 + 새로고침 후 토스트만.
}
