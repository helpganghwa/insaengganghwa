// 임시 리뷰 페이지 — 150종 카탈로그 스프라이트·이름·키·로어 일괄 검수용.
// 리뷰 끝나면 이 디렉터리 통째 삭제.
import { CATALOG_ITEMS, type CatalogSlot } from '@/lib/game/equipment/catalog';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';

const SLOT_LABEL: Record<CatalogSlot, string> = {
  weapon: '무기',
  armor: '방어구',
  accessory: '장신구',
};
const SLOT_ORDER: CatalogSlot[] = ['weapon', 'armor', 'accessory'];

export default function SpriteReviewPage() {
  const grouped = SLOT_ORDER.reduce<Record<CatalogSlot, typeof CATALOG_ITEMS>>(
    (acc, slot) => {
      acc[slot] = CATALOG_ITEMS.filter((c) => c.slot === slot);
      return acc;
    },
    { weapon: [], armor: [], accessory: [] },
  );

  return (
    <main className="mx-auto w-full max-w-[390px] px-3 py-4 text-neutral-900 dark:text-neutral-100">
      <header className="mb-4">
        <h1 className="text-lg font-bold">스프라이트 리뷰</h1>
        <p className="text-[11px] text-neutral-500">
          150종 · 이미지/이름/키/로어 일괄 검수용 · 리뷰 후 삭제 예정
        </p>
      </header>

      {SLOT_ORDER.map((slot) => (
        <section key={slot} className="mb-6">
          <h2 className="sticky top-0 z-10 -mx-3 mb-2 bg-white/95 px-3 py-1 text-sm font-semibold backdrop-blur dark:bg-neutral-950/95">
            {SLOT_LABEL[slot]} <span className="text-neutral-500">({grouped[slot].length})</span>
          </h2>
          <ul className="space-y-3">
            {grouped[slot].map((item, idx) => {
              const src = spritePath(item.key);
              return (
                <li
                  key={item.key}
                  className="rounded-md border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-900/40"
                >
                  <div className="flex gap-3">
                    <div className="shrink-0 self-start">
                      {src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt={item.nameKo}
                          width={96}
                          height={96}
                          className="block h-24 w-24 bg-neutral-100 dark:bg-neutral-800"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      ) : (
                        <div className="flex h-24 w-24 items-center justify-center bg-neutral-200 text-xs text-neutral-500 dark:bg-neutral-800">
                          no img
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="truncate text-[13px] font-semibold">
                          <span className="mr-1 text-neutral-400">#{idx + 1}</span>
                          {item.nameKo}
                        </h3>
                      </div>
                      <div className="mt-0.5 text-[10px] text-neutral-500">
                        {item.region} · {item.tone}
                      </div>
                      <code className="mt-1 block break-all font-mono text-[10px] text-neutral-400">
                        {item.key}
                      </code>
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {item.lore}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <footer className="mt-8 border-t border-neutral-200 pt-3 text-center text-[10px] text-neutral-400 dark:border-neutral-800">
        리뷰 종료 후 <code>app/sprite-review/</code> 삭제
      </footer>
    </main>
  );
}
