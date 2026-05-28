/**
 * 프로필 초상 — 배경(cover) + 캐릭터(contain·바닥 정렬)를 하나의 정사각 박스로 통일 렌더.
 * /me 카드·프로필 선택화면이 동일 비율/정렬을 쓰게 해 통일감 확보(캐릭터가 배경 안에 서고
 * 떠 보이지 않음). OG(satori)는 같은 비율을 수동 재현. 서버/클라 공용(img만).
 */
export function ProfilePortrait({
  bgSrc,
  charSrc,
  className,
  rounded = true,
}: {
  bgSrc?: string | null;
  charSrc?: string | null;
  className?: string;
  rounded?: boolean;
}) {
  return (
    <div
      className={`relative aspect-square overflow-hidden ${rounded ? 'rounded-2xl' : ''} ${className ?? ''}`}
    >
      {/* 어두운 베이스 — 배경 없거나 투명 영역 비침 방지 */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-700 to-zinc-900" />
      {bgSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bgSrc}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      {charSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={charSrc}
          alt="프로필 캐릭터"
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain object-bottom"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
    </div>
  );
}
