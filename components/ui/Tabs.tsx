'use client';

/**
 * 공용 세그먼트 탭 — 화면마다 따로 만들던 탭 컨트롤의 단일 출처(2026-07-31).
 *
 * 종전에는 상점·친구·길드목록·랭킹·대난투·점령전·레이드초대가 각자 구현이라 컨테이너 반지름,
 * 항목 높이, 글자 크기, 활성색이 제각각이었다(여덟 축 중 전 화면이 일치하는 축이 없었다).
 * A안(현행 다수결)으로 통일 — 어두운 알약 + 흰 글자, 활성 배경은 다수인 zinc-950.
 * 앰버는 탭에 쓰지 않는다: 보상·강조·경고의 신호로 아껴 둔다.
 *
 * ⚠ 지도 위에 얹히는 오버레이 탭(DeployTerritoryTabs)은 여기 포함하지 않는다 — 이미지 위
 * 가독성을 위해 반투명 검정 배경 + 앰버 활성이 필요한 다른 문맥이다.
 */
export type TabItem<K extends string> = {
  key: K;
  label: string;
  /** 주목이 필요한 개수 — 붉은 알약(예: 받은 친구 요청). */
  badge?: number;
  /** 개수 없이 주목만 — 붉은 점(예: 오늘 받을 무료 보상). */
  dot?: boolean;
  /** 단순 정보성 개수 — 라벨 옆 회색 숫자(예: 초대 가능한 친구 수). 붉은 배지와 구분한다. */
  count?: number;
};

const SIZE = {
  md: {
    box: 'gap-1 rounded-xl p-1',
    item: 'rounded-lg py-1.5 text-[12.5px]',
  },
  sm: {
    box: 'gap-1 rounded-lg p-0.5',
    item: 'rounded-md py-1.5 text-[12px]',
  },
} as const;

export function Tabs<K extends string>({
  items,
  value,
  onChange,
  size = 'md',
  className = '',
}: {
  items: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  /** md = 페이지 · sm = 팝업/시트 */
  size?: 'md' | 'sm';
  className?: string;
}) {
  const s = SIZE[size];
  return (
    <div
      role="tablist"
      className={`flex bg-zinc-100 dark:bg-zinc-900 ${s.box} ${className}`}
    >
      {items.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`relative min-w-0 flex-1 truncate font-bold transition ${s.item} ${
              on
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50'
                : 'text-zinc-500'
            }`}
          >
            {t.label}
            {t.count != null ? (
              <span className="ml-1 tabular-nums opacity-80">{t.count}</span>
            ) : null}
            {t.badge ? (
              <span className="absolute right-1.5 top-1 inline-flex min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white tabular-nums">
                {t.badge}
              </span>
            ) : t.dot ? (
              <span className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
