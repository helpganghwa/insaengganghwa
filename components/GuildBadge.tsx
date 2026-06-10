/**
 * 길드 소속 배지 — 닉네임 옆/아래에 해당 유저의 길드 문양(+선택적 이름) 노출.
 * 길드 없으면(emblemUrl·name 모두 없음) 미표시(null). 서버/클라 양쪽 사용 가능(훅 없음).
 *
 * 순서는 항상 **이름 + 문양**(2026-06-10 변경 — 길드이름 먼저, 문양 뒤).
 * - emblem-only: name 미전달 → 문양만(emblemUrl 있을 때만). 랭킹·레이드·친구·헤더용.
 * - with-name: name 전달 → 이름 + 문양. 내정보/공개프로필/자랑카드/친구용.
 *
 * ⚠ 문양 없을 때(미소속·생성중 포함)는 🛡️ 등 폴백 없이 영역을 비운다(문양 슬롯 미렌더).
 */
export function GuildBadge({
  emblemUrl,
  name = null,
  size = 16,
  className = '',
  pinEmblemRight = false,
}: {
  emblemUrl: string | null;
  name?: string | null;
  size?: number;
  className?: string;
  /** true=이름을 중앙정렬하고 문양을 이름 오른쪽에 절대배치(이름 중심 유지). 내정보/공개프로필용. */
  pinEmblemRight?: boolean;
}) {
  if (!emblemUrl && !name) return null;
  const img = emblemUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={emblemUrl}
      alt=""
      aria-hidden
      className="shrink-0 object-contain"
      style={{ width: size, height: size, imageRendering: 'pixelated' }}
    />
  ) : null;

  // 이름 중앙정렬 + 문양은 이름 오른쪽 절대배치(문양이 이름 중심을 밀지 않음).
  if (pinEmblemRight && name) {
    return (
      <span className={`relative inline-flex max-w-full items-center ${className}`}>
        <span className="truncate">{name}</span>
        {emblemUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={emblemUrl}
            alt=""
            aria-hidden
            className="absolute left-full top-1/2 ml-1 -translate-y-1/2 object-contain"
            style={{ width: size, height: size, imageRendering: 'pixelated' }}
          />
        ) : null}
      </span>
    );
  }

  // 기본 — 이름 + 문양(순서: 이름 먼저).
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      {name ? <span className="truncate">{name}</span> : null}
      {img}
    </span>
  );
}
