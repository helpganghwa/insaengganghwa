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

// 5분(2026-08-06, 감사 후 60초→5분) — 배포 감지는 긴급성이 낮고, 전 유저 상시 루프라
// 주기가 곧 함수 호출량. /api/health가 CDN 30초 캐시를 얹어 origin 부하는 추가로 상수화.
const POLL_INTERVAL_MS = 300_000;
// 포그라운드 복귀 재확인 스로틀 — 앱 전환을 빠르게 오가는 유저의 연타 방지(채팅 폴링과 동일 패턴).
const VISIBILITY_THROTTLE_MS = 30_000;
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
    let lastCheckAt = 0;

    async function check() {
      lastCheckAt = Date.now();
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
          // 쿨다운 내면 핑퐁 가능성 — 이번 사이클은 건너뛴다. 기준(firstDpl)은 덮어쓰지 않는다:
          // 덮어쓰면 쿨다운 안에 나온 두 번째 배포(2026-09-01 10:29→10:32 연속 배포)가 영영 적용되지
          // 않고 재접속을 기다린다. 기준을 유지하면 다음 폴링(5분)에 쿨다운이 끝난 뒤 정상 새로고침되고,
          // 핑퐁이 나더라도 새로고침은 10분당 최대 1회로 상한이 그대로다.
          const last = Number(localStorage.getItem(RELOAD_TS) ?? '0');
          if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
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
      if (document.visibilityState === 'visible' && Date.now() - lastCheckAt > VISIBILITY_THROTTLE_MS)
        check();
    };

    check();
    // 백그라운드 탭은 스킵 — 복귀 시 onVisibility가 따라잡는다(채팅 폴링과 동일 패턴).
    const id = setInterval(() => {
      if (!document.hidden) check();
    }, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null; // UI 없음 — 자동 새로고침 + 새로고침 후 토스트만.
}
