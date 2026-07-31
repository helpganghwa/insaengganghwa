'use client';

import { PageHeader } from '@/components/ui/PageHeader';

/**
 * 길드 화면 헤더 — 공용 `PageHeader`의 얇은 래퍼(2026-07-31 승격).
 *
 * 원래 이 파일이 구현 본체였는데, 길드 밖 화면들도 같은 헤더가 필요해져
 * `components/ui/PageHeader`로 올렸다. 여기서는 길드 기본값(fallback='/guild')만
 * 채운다 — 호출부 10곳은 그대로 둔다.
 */
export function GuildPageHeader({
  title,
  kicker,
  icon,
  right,
  fallback = '/guild',
}: {
  title: React.ReactNode;
  kicker?: React.ReactNode;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  fallback?: string;
}) {
  return (
    <PageHeader title={title} kicker={kicker} icon={icon} right={right} fallback={fallback} />
  );
}
