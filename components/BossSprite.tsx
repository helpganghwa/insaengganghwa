import { getBossSprite } from '@/lib/game/raid/boss-sprites';
import { assetUrl } from '@/lib/asset-versions';

/**
 * 레이드 보스 렌더 — 정적 PNG는 상시 부유(boss-float)로 역동적,
 * `__anim.png` 스프라이트(APNG)가 있으면 브라우저 네이티브 재생으로 자동 업그레이드.
 * 서버/클라이언트 양쪽에서 사용 가능(순수 CSS, 훅 없음).
 */
export function BossSprite({
  code,
  size = 96,
  className,
}: {
  code: string;
  size?: number;
  className?: string;
}) {
  const entry = getBossSprite(code);
  if (!entry) {
    return (
      <span
        aria-hidden
        className={`inline-flex items-center justify-center ${className ?? ''}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.7) }}
      >
        👹
      </span>
    );
  }
  const src = entry.apng ?? entry.static;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={assetUrl(src)}
      alt=""
      width={size}
      height={size}
      className={`pointer-events-none select-none ${
        entry.apng ? '' : 'animate-boss-float'
      } ${className ?? ''}`}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
