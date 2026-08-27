/**
 * 칭호 표시 — 닉네임 옆 한 줄(TITLES.md §3). ExecutorTag를 일반화한다.
 * 위계: 닉네임·길드명보다 작고 가늘게(0.9em·600 — title-fx.css .ttag).
 * 스타일은 defs(공개)의 style만 사용 — 조건·난이도는 이 컴포넌트에 오지 않는다.
 * ⚠ 항상 shrink-0 — 좁은 곳에서 닉네임이 먼저 말줄임되고 칭호는 잘리지 않게(ExecutorTag 규칙 승계).
 */
import { TITLE_BY_CODE, type TitleStyle } from '@/lib/game/titles/defs';
import { ExecutorTag } from './ExecutorTag';

/** 파티클 — 기본 4점(위상을 넓게 흩어 동시에 1~2개만 보이게, 디자인 확정값). */
function Particles() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <i key={i} style={{ left: `${12 + i * 24}%`, animationDelay: `${(i * 1.35).toFixed(2)}s` }} />
      ))}
    </>
  );
}

/**
 * 퍼짐 파티클(후원 칭호, style.pc) — 글자 위 등간격 지점(8~92%)에서 생성돼 바깥으로 퍼진다.
 * 방향은 가장자리일수록 멀리·위아래 교대, 위상차는 주기(4.8s)/개수로 균등 — 개수가 몇이든
 * 항상 1~2개가 살아 있고 0%=100%(원점·투명)라 루프 이음새가 없다(2026-08-26 확정).
 */
function SpreadParticles({ count }: { count: number }) {
  const items = [];
  for (let k = 0; k < count; k++) {
    const x = count > 1 ? 8 + (84 * k) / (count - 1) : 42;
    const side = x < 50 ? -1 : 1;
    const up = k % 2 === 0 ? -1 : 1;
    const dx = side * (0.5 + (1.5 * Math.abs(x - 50)) / 50);
    const dy = up * (1.1 + (0.5 * (k % 3)) / 2);
    const delay = -((4.8 * k) / count);
    items.push(
      <i
        key={k}
        style={
          {
            '--x': `${x.toFixed(0)}%`,
            '--dx': `${dx.toFixed(2)}em`,
            '--dy': `${dy.toFixed(2)}em`,
            animationDelay: `${delay.toFixed(2)}s`,
          } as React.CSSProperties
        }
      />,
    );
  }
  return <>{items}</>;
}

/** 글자 단위 분리(style.split) — 문자별 애니메이션(후원 상위 2단계 '호흡'). 공백은 nbsp로 폭 유지. */
function SplitLabel({ label }: { label: string }) {
  return (
    <>
      {[...label].map((ch, i) => (
        <b key={i} style={{ '--i': i } as React.CSSProperties}>
          {ch === ' ' ? '\u00a0' : ch}
        </b>
      ))}
    </>
  );
}

function styleAttr(s: TitleStyle): React.CSSProperties | undefined {
  if (s.fx) return undefined; // 이펙트는 클래스가 전담
  if (s.gradient?.length) {
    if (s.glow) {
      // 어려움 조합(트랙 C) — 정적 글로우 대신 **흐르는** 지역색 그라데이션. 색을 주기
      // 패턴(첫 색 반복)으로 닫고 90deg·300%라 공용 flow 키프레임과 무결점 순환한다.
      return {
        background: `linear-gradient(90deg,${[...s.gradient, s.gradient[0]!].join(',')})`,
        backgroundSize: '300% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        animation: 'flow 7s linear infinite',
        filter: `drop-shadow(0 0 2px ${rgba(s.gradient[0]!, 0.45)})`,
      };
    }
    return {
      background: `linear-gradient(100deg,${s.gradient.join(',')})`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
    };
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
  still = false,
}: {
  /** 대표 칭호 code — null/미자격이면 호출부가 렌더 생략(활성 검증은 서버 몫). */
  code: string | null | undefined;
  /** 집행관 칭호일 때의 동적 라벨 재료(기존 ExecutorTag 데이터 그대로). */
  executorZone?: string | null;
  executorZoneRegion?: string | null;
  className?: string;
  /** 정적 모드 — 색은 유지하고 무한 애니메이션만 정지(채팅 행 등 대량 목록, title-fx.css .ttag-still). */
  still?: boolean;
}) {
  if (!code) return null;
  const def = TITLE_BY_CODE.get(code);
  if (!def) return null;
  const stillCls = still ? ' ttag-still' : '';

  // 집행관 — 구역을 알면 기존 표시(구역명=지역색+집행관=인디고), 모르면 정적 '집행관'(목록용).
  if (def.style.executor) {
    if (executorZone) return <ExecutorTag zone={executorZone} region={executorZoneRegion} className={className} />;
    return (
      <span className={`ttag shrink-0 whitespace-nowrap ${className}${stillCls}`}>
        <span style={{ color: '#a5b4fc' }}>집행관</span>
      </span>
    );
  }

  const label = def.label;
  const inner = def.style.fx ? (
    <span className={`fx fx-${def.style.fx}`}>
      {def.style.split ? <SplitLabel label={label} /> : label}
    </span>
  ) : (
    <span style={styleAttr(def.style)}>{label}</span>
  );

  return (
    <span className={`ttag shrink-0 whitespace-nowrap ${className}${stillCls}`}>
      {def.style.pt ? (
        <span className={`pt pt-${def.style.pt}`}>
          {inner}
          {def.style.pc ? <SpreadParticles count={def.style.pc} /> : <Particles />}
        </span>
      ) : (
        inner
      )}
    </span>
  );
}
