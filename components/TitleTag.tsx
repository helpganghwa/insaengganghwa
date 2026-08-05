/**
 * 칭호 표시 — 닉네임 옆 한 줄(TITLES.md §3). ExecutorTag를 일반화한다.
 * 위계: 닉네임·길드명보다 작고 가늘게(0.9em·600 — title-fx.css .ttag).
 * 스타일은 defs(공개)의 style만 사용 — 조건·난이도는 이 컴포넌트에 오지 않는다.
 * ⚠ 항상 shrink-0 — 좁은 곳에서 닉네임이 먼저 말줄임되고 칭호는 잘리지 않게(ExecutorTag 규칙 승계).
 */
import { TITLE_BY_CODE, type TitleStyle } from '@/lib/game/titles/defs';
import { ExecutorTag } from './ExecutorTag';

/** 파티클 4점 — 위상을 넓게 흩어 동시에 1~2개만 보이게(디자인 확정값). */
function Particles() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <i key={i} style={{ left: `${12 + i * 24}%`, animationDelay: `${(i * 1.35).toFixed(2)}s` }} />
      ))}
    </>
  );
}

function styleAttr(s: TitleStyle): React.CSSProperties | undefined {
  if (s.fx) return undefined; // 이펙트는 클래스가 전담
  if (s.gradient?.length) {
    const grad: React.CSSProperties = {
      background: `linear-gradient(100deg,${s.gradient.join(',')})`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
    };
    if (s.glow) {
      const c = s.gradient[0]!;
      grad.filter = `drop-shadow(0 0 2px ${rgba(c, 0.45)})`;
    }
    return grad;
  }
  const out: React.CSSProperties = { color: s.color ?? '#a5b4fc' };
  if (s.glow && s.color) out.textShadow = `0 0 3px ${rgba(s.color, 0.4)}`;
  return out;
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function TitleTag({
  code,
  executorZone,
  executorZoneRegion,
  className = '',
}: {
  /** 대표 칭호 code — null/미자격이면 호출부가 렌더 생략(활성 검증은 서버 몫). */
  code: string | null | undefined;
  /** 집행관 칭호일 때의 동적 라벨 재료(기존 ExecutorTag 데이터 그대로). */
  executorZone?: string | null;
  executorZoneRegion?: string | null;
  className?: string;
}) {
  if (!code) return null;
  const def = TITLE_BY_CODE.get(code);
  if (!def) return null;

  // 집행관 — 기존 표시 유지(구역명=지역색 + 집행관=인디고, 사용자 확정)
  if (def.style.executor) {
    return <ExecutorTag zone={executorZone} region={executorZoneRegion} className={className} />;
  }

  const label = def.label;
  const inner = def.style.fx ? (
    <span className={`fx fx-${def.style.fx}`}>{label}</span>
  ) : (
    <span style={styleAttr(def.style)}>{label}</span>
  );

  return (
    <span className={`ttag shrink-0 whitespace-nowrap ${className}`}>
      {def.style.pt ? (
        <span className={`pt pt-${def.style.pt}`}>
          {inner}
          <Particles />
        </span>
      ) : (
        inner
      )}
    </span>
  );
}
