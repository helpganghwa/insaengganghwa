import { transcendStyle, TRANSCEND_TUNING } from '@/lib/game/equipment/transcend';

/**
 * 카드 보더로 등급 frame을 흡수하는 absolute overlay.
 * 부모 컨테이너는 `position: relative` + `aspect-square`(혹은 정사각) 필요.
 * Frame mask는 사각형 외곽 ring + 코너 ornate 형태(중앙은 투명) →
 * 부모 카드의 내용물(이미지·이름·레벨)을 가리지 않음.
 *
 * 사용 컨텍스트: 인벤토리·도감·강화소·가챠 결과 등 sprite + 메타가 있는 카드.
 * sprite는 frameless로 그려 시각 외곽선이 카드 보더(=등급 frame)에 단일화됨.
 */
function starPoints(R: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 === 0 ? R : R * 0.4;
    const a = (i * 45 - 90) * (Math.PI / 180);
    pts.push(`${(R + Math.cos(a) * rr).toFixed(2)},${(R + Math.sin(a) * rr).toFixed(2)}`);
  }
  return pts.join(' ');
}

// 원본 sprite 디자인 의도 보존: 별은 모서리 안쪽에 *작게*.
// 카드(부모 영역) 기준 — frame mask의 외측 확장과는 별개 좌표계.
const STAR_BOX = 9; // 카드 폭의 9% (원본 sprite 64px 안에서 16% ≈ 10px과 시각적 동급)
const STAR_INSET = 4.5; // 별 좌상 좌표 inset (% — 별 중심이 카드 모서리에서 9% 안쪽)

export function RarityFrame({
  level,
  className,
}: {
  /** transcend_level (0..MAX). +0이면 frame 없음(null 반환). */
  level: number;
  /** 부모는 반드시 position:relative. 이 컴포넌트는 부모 영역 전체를 absolute로 덮음. */
  className?: string;
}) {
  const st = transcendStyle(level);
  if (!st.hasFrame) return null;
  const [r, g, b] = st.colorRgb;
  const frameCol = `rgb(${r},${g},${b})`;
  const starCol = `rgb(${Math.round(r + (255 - r) * 0.3)},${Math.round(g + (255 - g) * 0.3)},${Math.round(b + (255 - b) * 0.3)})`;
  const corners: { style: React.CSSProperties }[] = [
    { style: { left: `${STAR_INSET}%`, top: `${STAR_INSET}%` } },
    { style: { right: `${STAR_INSET}%`, top: `${STAR_INSET}%` } },
    { style: { left: `${STAR_INSET}%`, bottom: `${STAR_INSET}%` } },
    { style: { right: `${STAR_INSET}%`, bottom: `${STAR_INSET}%` } },
  ];
  // Frame mask asset(transcend-frame.png)은 내부 ring 디자인이라 inset:0이면
  // ring이 카드 *안쪽*에 떨어져 보더 대체 느낌이 안 남. 두 레이어 분리:
  //  (1) frame mask — inset:'-8%'로 카드 외측까지 확장(ring이 보더 자리에)
  //  (2) 별 — inset:0 (카드 영역 기준). 원본 디자인 비율(작게·모서리 안쪽) 보존.
  return (
    <>
      {/* (1) Frame 본체 — 외측 확장 */}
      <div
        aria-hidden
        className={className}
        style={{
          position: 'absolute',
          inset: '-8%',
          pointerEvents: 'none',
          backgroundColor: frameCol,
          WebkitMaskImage: `url(${TRANSCEND_TUNING.frameAsset})`,
          maskImage: `url(${TRANSCEND_TUNING.frameAsset})`,
          WebkitMaskSize: '100% 100%',
          maskSize: '100% 100%',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
        }}
      />
      {/* (2) 별 4개 — 카드 영역 기준. sub=1(짝수 등급)일 때만. */}
      {st.sub === 1 ? (
        <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {corners.map((c, i) => (
            <svg
              key={i}
              aria-hidden
              viewBox={`0 0 ${STAR_BOX} ${STAR_BOX}`}
              style={{
                position: 'absolute',
                width: `${STAR_BOX}%`,
                height: `${STAR_BOX}%`,
                ...c.style,
              }}
            >
              <polygon points={starPoints(STAR_BOX / 2)} fill={starCol} />
              <circle cx={STAR_BOX / 2} cy={STAR_BOX / 2} r={STAR_BOX * 0.09} fill="rgba(255,255,255,0.92)" />
            </svg>
          ))}
        </div>
      ) : null}
    </>
  );
}
