// Pixellab effect animation PoC 리뷰 — 2종 sprite + 9 프레임 시퀀스 비교.
'use client';
import { useEffect, useState } from 'react';

export const dynamic = 'force-dynamic';

interface Item {
  key: string;
  slot: 'weapon' | 'armor' | 'accessory';
  effect: string;
  note: string;
}

const ITEMS: Item[] = [
  {
    key: 'volcano_first_ember_hammer',
    slot: 'weapon',
    effect: '가운데 잉걸 박동 (빨강 → 노랑 → 빨강 펄스)',
    note: '원본 색 유지 + 효과 자연스러움. 9 프레임 사이클 OK.',
  },
  {
    key: 'volcano_phoenix_blade',
    slot: 'weapon',
    effect: '빨간 룬 흐름 + 불꽃 wisp 상승',
    note: '효과는 OK이나 원본 황금 → 어두운 청록으로 색상 변경됨.',
  },
];

function AnimatedSprite({ slug, fps = 8 }: { slug: string; fps?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % 9), 1000 / fps);
    return () => clearInterval(id);
  }, [fps]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/effect-poc/${slug}/frame_${i}.png`}
      alt={`${slug} frame ${i}`}
      className="h-32 w-32 bg-neutral-50 dark:bg-neutral-900"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

export default function EffectPocPage() {
  return (
    <main className="mx-auto w-full max-w-[390px] px-3 py-4 text-neutral-900 dark:text-neutral-100">
      <header className="mb-4">
        <h1 className="text-base font-bold">Pixellab 이펙트 PoC</h1>
        <p className="text-[11px] text-neutral-500">
          최고강화자 보상용 effect animation 테스트. 9 프레임 = 8 fps loop.
        </p>
      </header>

      {ITEMS.map((it) => (
        <section
          key={it.key}
          className="mb-6 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
        >
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{it.key}</h2>
            <span className="text-[10px] text-neutral-500">{it.slot}</span>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-neutral-500">원본 (정적)</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/sprites/${it.slot}/${it.key}.png`}
                alt={`${it.key} static`}
                className="h-32 w-32 bg-neutral-50 dark:bg-neutral-900"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-neutral-500">이펙트 (9 프레임 loop)</span>
              <AnimatedSprite slug={it.key} />
            </div>
          </div>

          <div className="space-y-1 text-[11px] leading-relaxed">
            <p>
              <span className="text-neutral-500">효과:</span> {it.effect}
            </p>
            <p className="text-neutral-600 dark:text-neutral-400">{it.note}</p>
          </div>

          <details className="mt-2">
            <summary className="cursor-pointer text-[10px] text-neutral-500">
              9 프레임 펼치기
            </summary>
            <div className="mt-2 grid grid-cols-5 gap-1">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] text-neutral-400">{i}</span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/effect-poc/${it.key}/frame_${i}.png`}
                    alt={`f${i}`}
                    className="h-12 w-12 bg-neutral-50 dark:bg-neutral-900"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
              ))}
            </div>
          </details>
        </section>
      ))}

      <footer className="mt-6 text-center text-[10px] text-neutral-400">
        PoC 종료 후 <code>app/effect-poc/</code> + <code>public/effect-poc/</code> 삭제
      </footer>
    </main>
  );
}
