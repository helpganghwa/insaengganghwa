'use client';

import { useEffect } from 'react';

import { setServerNow } from '@/lib/client/server-clock';

/** 서버 렌더 시각을 클라 시계 offset으로 등록 — 시간 판정이 있는 페이지(강화·파견)에 배치. */
export function ServerClockSync({ nowIso }: { nowIso: string }) {
  useEffect(() => {
    setServerNow(nowIso);
  }, [nowIso]);
  return null;
}
