'use client';

import { useEffect } from 'react';

import { BGM_EVENT, bgmEnabled, playBgm, stopBgm, type BgmTrack } from '@/lib/audio/bgm';

/**
 * 배경음 재생 마운트 — 화면에 두면 해당 트랙을 재생하고 언마운트 시 페이드아웃.
 *
 * - 기본: 설정('ig:bgm', 기본 OFF)을 따르고, 설정 변경(같은 탭 커스텀 이벤트/다른 탭
 *   storage)에 실시간 반응한다. 게임 레이아웃에 상시 마운트해도 꺼진 기기에선 무음.
 * - force: 설정 무시하고 재생 — CBT 종료 화면 같은 연출용. 자동재생이 정책에 막히면
 *   (제스처 전) 첫 터치/키 입력에서 시작한다. 실제 소리 시점은 브라우저가 정하는 것이라
 *   "자동재생"은 최선 시도 + 제스처 폴백이다.
 */
export function BgmPlayer({ track, force = false }: { track: BgmTrack; force?: boolean }) {
  useEffect(() => {
    let disposed = false;
    let playing = false;

    const want = () => force || bgmEnabled();

    const tryStart = () => {
      if (disposed || playing || !want() || document.visibilityState !== 'visible') return;
      void playBgm(track).then((ok) => {
        if (disposed) return;
        playing = ok; // 실패(자동재생 차단)면 제스처 리스너가 다음 기회에 재시도
        if (ok) removeGesture();
      });
    };

    // 제스처 폴백 — 자동재생이 막힌 동안만 유지, 시작 성공 시 해제.
    const onGesture = () => tryStart();
    const addGesture = () => {
      window.addEventListener('pointerdown', onGesture);
      window.addEventListener('touchend', onGesture);
      window.addEventListener('keydown', onGesture);
    };
    const removeGesture = () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('touchend', onGesture);
      window.removeEventListener('keydown', onGesture);
    };

    // 백그라운드 정지/복귀 재개 — 숨은 탭에서 앰비언트가 계속 울리지 않게.
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        playing = false;
        stopBgm(0.3);
      } else {
        tryStart();
      }
    };

    // 설정 토글 실시간 반영 — 같은 탭(BGM_EVENT)/다른 탭(storage).
    const onSetting = () => {
      if (want()) tryStart();
      else {
        playing = false;
        stopBgm();
      }
    };

    addGesture();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener(BGM_EVENT, onSetting);
    window.addEventListener('storage', onSetting);
    tryStart();

    return () => {
      disposed = true;
      removeGesture();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener(BGM_EVENT, onSetting);
      window.removeEventListener('storage', onSetting);
      stopBgm();
    };
  }, [track, force]);

  return null;
}
