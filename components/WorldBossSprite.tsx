import { assetUrl } from '@/lib/asset-versions';
import { worldBossAnimUrl, worldBossEmberUrl } from '@/lib/game/world-boss/bosses';

/**
 * 월드보스 그림 — 대기 애니(9프레임 띠 왕복) + 프레임별 불씨 맥동 + 숨쉬기. 모두 CSS라 훅이 없다.
 *
 * `attack`이 바뀔 때마다 공격 연출(앞으로 다가오기 + 불씨 플레어)을 한 번 재생한다 — 값이 key라
 * 바뀌면 그 층이 다시 붙어 애니메이션이 처음부터 돈다. null이면 공격 연출 없음.
 * 그림 색은 원본 그대로 둔다(날갯짓 생성 애니는 색·깃털 형태가 튀어 기각, 2026-10-09).
 * 움직임 줄이기 설정이면 globals.css에서 전부 멈추고 0번 프레임(정지 그림)만 보인다.
 */
export function WorldBossSprite({
  region,
  alt,
  attack = null,
  className = '',
  style,
}: {
  region?: string;
  alt: string;
  attack?: number | string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const strip = `url(${assetUrl(worldBossAnimUrl(region))})`;
  // 안쪽 층이 absolute라 기준 상자가 필요하다 — 호출부가 absolute/fixed로 놓으면 그대로 두고, 아니면 relative를 붙인다.
  const pos = /(^|\s)(absolute|fixed)(\s|$)/.test(className) ? '' : 'relative ';
  const ember = `url(${assetUrl(worldBossEmberUrl(region))})`;
  return (
    <div role="img" aria-label={alt} className={`wbs ${pos}${className}`} style={style}>
      <div className="wbs-breath">
        <div key={attack ?? 'idle'} className={`wbs-lunge ${attack != null ? 'wbs-atk' : ''}`}>
          <div className="wbs-strip" style={{ backgroundImage: strip }} />
          <div className="wbs-pulse">
            <div className="wbs-strip wbs-ember" style={{ backgroundImage: ember }} />
          </div>
        </div>
      </div>
    </div>
  );
}
