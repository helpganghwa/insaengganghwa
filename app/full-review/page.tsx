// 전체 154종 (weapon 50 + armor 50 + accessory 54) 최종 리뷰 페이지.
// 사용자가 번호로 재생성 항목 지정용. 리뷰 종료 후 디렉터리 삭제.
import { CATALOG_NEXT } from '@/lib/game/equipment/catalog-next';

export const dynamic = 'force-dynamic';

interface Item {
  key: string;
  slot: string;
  nameKo: string;
  region: string;
  tone: string;
  lore: string;
}

export default function FullReviewPage() {
  const weapon = CATALOG_NEXT.filter((i) => i.slot === 'weapon');
  const armor = CATALOG_NEXT.filter((i) => i.slot === 'armor');
  const accessory = CATALOG_NEXT.filter((i) => i.slot === 'accessory');

  let counter = 0;
  const num = () => ++counter;

  return (
    <main className="mx-auto w-full max-w-[390px] px-2 py-3 text-neutral-900 dark:text-neutral-100">
      <header className="mb-3">
        <h1 className="text-base font-bold">전체 154종 최종 리뷰</h1>
        <p className="text-[10px] text-neutral-500">
          weapon 50 · armor 50 · accessory 54. 번호로 재생성 항목 지정.
        </p>
      </header>

      <Section title="weapon (1–50)" items={weapon as Item[]} startFrom={() => num()} />
      <Section title="armor (51–100)" items={armor as Item[]} startFrom={() => num()} />
      <Section title="accessory (101–154)" items={accessory as Item[]} startFrom={() => num()} />
    </main>
  );
}

function Section({
  title,
  items,
  startFrom,
}: {
  title: string;
  items: Item[];
  startFrom: () => number;
}) {
  return (
    <section className="mb-6">
      <h2 className="sticky top-0 z-10 -mx-2 mb-2 bg-white/95 px-2 py-1 text-sm font-semibold backdrop-blur dark:bg-neutral-950/95">
        {title}
      </h2>
      <ul className="grid grid-cols-1 gap-2">
        {items.map((it) => {
          const n = startFrom();
          return (
            <li
              key={it.key}
              className="flex gap-2 rounded border border-neutral-200 p-2 dark:border-neutral-800"
            >
              <div className="flex shrink-0 flex-col items-center gap-1">
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                  {n}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/sprites-next/${it.slot}/${it.key}.png`}
                  alt={it.nameKo}
                  className="h-20 w-20 bg-neutral-50 dark:bg-neutral-900"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] leading-snug">
                <div className="font-semibold">{it.nameKo}</div>
                <div className="text-[10px] text-neutral-500">
                  {it.region} · {it.tone} · <span className="font-mono">{it.key}</span>
                </div>
                <p className="text-[10px] text-neutral-700 dark:text-neutral-300">{it.lore}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
