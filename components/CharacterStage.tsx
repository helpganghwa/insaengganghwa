/**
 * 캐릭터 무대 — 배경 이미지 없이 캐릭터를 돋보이게 (미니멀, 2026-05-28 사용자 결정).
 * 어두운 그라디언트 베이스 + 발밑 타원 그림자 + 캐릭터(scale·바닥 정렬).
 * /me·/u 공용. OG(satori)·선택화면은 같은 비주얼을 각자 재현.
 */
export function CharacterStage({
  charSrc,
  className,
  rounded = true,
}: {
  charSrc?: string | null;
  className?: string;
  rounded?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-b from-zinc-700 via-zinc-900 to-zinc-950 ${rounded ? 'rounded-2xl' : ''} ${className ?? ''}`}
    >
      {charSrc && (
        <>
          {/* 발밑 타원 그림자 — 캐릭터가 바닥에 서 있는 느낌 */}
          <div className="absolute bottom-[6%] left-1/2 h-[7%] w-1/2 -translate-x-1/2 rounded-[50%] bg-black/45 blur-[6px]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={charSrc}
            alt="프로필 캐릭터"
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain object-bottom"
            style={{ imageRendering: 'pixelated', transform: 'scale(1.3) translateY(7%)', transformOrigin: 'center bottom' }}
          />
        </>
      )}
    </div>
  );
}
