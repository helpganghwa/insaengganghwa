/**
 * 길드 소속 배지 — 닉네임 옆/아래에 해당 유저의 길드 문양(+선택적 이름) 노출.
 * 길드 없으면(emblemUrl·name 모두 없음) 미표시(null). 서버/클라 양쪽 사용 가능(훅 없음).
 *
 * 순서는 항상 **문양 + 이름**(2026-07-23 변경 — 전 화면 공통 규칙
 * '닉네임 → 길드문양 → 길드명 → 집행관'에 맞춤).
 * - emblem-only: name 미전달 → 문양만(emblemUrl 있을 때만). 랭킹·레이드·친구·헤더용.
 * - with-name: name 전달 → 문양 + 이름. 내정보/공개프로필/자랑카드/친구용.
 *
 * 문양이 아직 없을 때(생성 중·실패)는 길드 색으로 채운 **기본 방패 실루엣**을 그린다(2026-08-06).
 * 이전엔 빈 칸이라 생성 실패한 길드가 다른 화면에서 '길드 없는 사람'처럼 보였다.
 * 미소속(name도 없음)은 그대로 미렌더 — 폴백은 '길드는 있는데 문양만 없는' 경우에만.
 */
export function GuildBadge({
  emblemUrl,
  name = null,
  emblemColor = null,
  size = 16,
  className = '',
  pinEmblemRight = false,
}: {
  emblemUrl: string | null;
  name?: string | null;
  /** 문양 미완 시 폴백 방패 색 — 길드 대표색. 없으면 인디고. */
  emblemColor?: string | null;
  size?: number;
  className?: string;
  /** true=이름을 중앙정렬하고 문양을 이름 **왼쪽**에 절대배치(문양이 이름 중심을 밀지 않음).
   *  내정보/공개프로필처럼 이름이 가운데 정렬돼야 하는 곳 전용. (이름은 prop 그대로 pinEmblemRight) */
  pinEmblemRight?: boolean;
}) {
  if (!emblemUrl && !name) return null;
  /** 문양 미완 폴백 — 길드 색(없으면 인디고) 방패 실루엣. 실제 문양과 헷갈리지 않게 채도를 낮춘다. */
  const fallback = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden
      className="shrink-0 opacity-70"
      style={{ color: emblemColor ?? '#a5b4fc' }}
    >
      <path d="M8 1.2 2.6 3.1v5.2c0 3 2.3 5.4 5.4 6.5 3.1-1.1 5.4-3.5 5.4-6.5V3.1L8 1.2Z" fill="currentColor" />
    </svg>
  );
  const img = emblemUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={emblemUrl}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      className="shrink-0 object-contain"
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
    />
  ) : name ? (
    fallback
  ) : null;

  // 이름 중앙정렬 + 문양은 이름 왼쪽 절대배치(문양이 이름 중심을 밀지 않음).
  if (pinEmblemRight && name) {
    return (
      <span className={`relative inline-flex max-w-full items-center ${className}`}>
        <span className="absolute right-full top-1/2 mr-1 -translate-y-1/2">
          {emblemUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={emblemUrl}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              className="object-contain"
              style={{ width: size, height: size, imageRendering: 'pixelated' }}
            />
          ) : (
            fallback
          )}
        </span>
        <span className="truncate">{name}</span>
      </span>
    );
  }

  // 기본 — 문양 + 이름(순서: 문양 먼저).
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      {img}
      {name ? <span className="truncate">{name}</span> : null}
    </span>
  );
}
