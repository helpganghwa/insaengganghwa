/**
 * 길드 소속 배지 — 닉네임 옆/아래에 해당 유저의 길드 문양(+선택적 이름) 노출.
 * 길드 없으면(emblemUrl·name 모두 없음) 미표시(null). 서버/클라 양쪽 사용 가능(훅 없음).
 *
 * - emblem-only: name 미전달 → 문양만(emblemUrl 있을 때만). 랭킹·레이드·친구·헤더용.
 * - with-name: name 전달 → 문양 + 이름. 내정보/공개프로필/자랑카드용.
 *
 * ⚠ 문양 없을 때(미소속·생성중 포함)는 🛡️ 등 폴백 없이 영역을 비운다(문양 슬롯 미렌더).
 */
export function GuildBadge({
  emblemUrl,
  name = null,
  size = 16,
  className = '',
}: {
  emblemUrl: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}) {
  if (!emblemUrl && !name) return null;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      {emblemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={emblemUrl}
          alt=""
          aria-hidden
          className="shrink-0 object-contain"
          style={{ width: size, height: size, imageRendering: 'pixelated' }}
        />
      ) : null}
      {name ? <span className="truncate">{name}</span> : null}
    </span>
  );
}
