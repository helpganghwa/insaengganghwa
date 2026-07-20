'use client';

import { useEffect } from 'react';

import { chronicleReadKey } from '../../ConquestCardStatus';

/**
 * 연대기 열람 기록 — 세계지도 진입 시 최신 공개일을 localStorage에 남긴다.
 * 홈 카드의 '새로운 역사가 쓰였다' 티저(ConquestCardStatus)가 이 값으로 카운트다운 복귀를 판정.
 */
export function ChronicleReadMark({ serverId, day }: { serverId: number; day: string | null }) {
  useEffect(() => {
    if (!day) return;
    try {
      localStorage.setItem(chronicleReadKey(serverId), day);
    } catch {
      // localStorage 불가 — 티저가 유지될 뿐 기능 영향 없음
    }
  }, [serverId, day]);
  return null;
}
