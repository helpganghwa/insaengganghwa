import { redirect } from 'next/navigation';

/** 목록 페이지는 두지 않는다(2026-10-08 사용자) — 머무는 보스는 세계지도 띠가 보여 준다. */
export default function WorldBossIndex() {
  redirect('/guild/map');
}
