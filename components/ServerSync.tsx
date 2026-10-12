'use client';

import { useEffect } from 'react';

/**
 * 탭 사이 서버 동기화(10-12 2서버 조사 C4) — srv 쿠키는 기기에 하나인데 탭은 여럿일 수 있다. 한 탭이 서버를 바꾸면(알림 링크·
 * 서버 전환) 다른 탭은 옛 서버 화면 위에서 새 서버 쿠키로 액션을 보내 헤더·잔액·채팅이 섞인다. localStorage에 현재 서버를 적고,
 * 다른 탭의 변경(storage 이벤트)을 들으면 그 탭을 다시 읽어 서버를 맞춘다.
 */
const KEY = 'ig:srv';

export function ServerSync({ serverId }: { serverId: number }) {
  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(serverId));
    } catch {
      /* 저장소 차단 환경 — 동기화 없이 진행 */
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== KEY || e.newValue == null) return;
      if (Number(e.newValue) !== serverId) location.reload();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [serverId]);
  return null;
}
