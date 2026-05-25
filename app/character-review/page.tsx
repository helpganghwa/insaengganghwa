// 임시 리뷰 페이지 — 캐릭터 디자인 prototype·일관성 검증용.
// public/sprites/characters/ 디렉터리를 스캔해 자동 표시. 신규 이미지 추가 시
// 새로고침만으로 반영. 채택 완료되면 본 페이지 + 디렉터리 정리.
//
// 파일명 규약: {npcKey}-{poseKey}.png 권장 (예: blacksmith-default.png,
// blacksmith-hammer.png, merchant-default.png). 그룹화 + 정렬에 활용.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '캐릭터 리뷰 — 인생강화',
  description: '캐릭터 prototype·일관성 검증.',
};

// 그룹 라벨(NPC key → 한국어). 미정의 키는 그대로 표시.
const NPC_LABEL: Record<string, { ko: string; role: string }> = {
  blacksmith: { ko: '대장장이', role: '강화소' },
  merchant: { ko: '상인', role: '보급/상점' },
  courier: { ko: '배달부', role: '우편함' },
  scholar: { ko: '사서', role: '도감' },
  herald: { ko: '헤럴드', role: '랭킹·공지' },
};

type Item = {
  file: string;
  href: string;
  npc: string;
  pose: string;
  sizeKb: number;
  mtime: number;
};

function loadItems(): Item[] {
  const dir = join(process.cwd(), 'public', 'sprites', 'characters');
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.png') && !n.includes('.bak'));
  } catch {
    return [];
  }
  return names
    .map((file) => {
      const base = file.replace(/\.png$/, '');
      const dash = base.indexOf('-');
      const npc = dash > 0 ? base.slice(0, dash) : base;
      const pose = dash > 0 ? base.slice(dash + 1) : 'default';
      const st = statSync(join(dir, file));
      return {
        file,
        href: `/sprites/characters/${file}`,
        npc,
        pose,
        sizeKb: Math.round(st.size / 1024),
        mtime: st.mtimeMs,
      };
    })
    .sort((a, b) => {
      if (a.npc !== b.npc) return a.npc.localeCompare(b.npc);
      // default 포즈 먼저, 그 외는 알파벳
      if (a.pose === 'default') return -1;
      if (b.pose === 'default') return 1;
      return a.pose.localeCompare(b.pose);
    });
}

export default function CharacterReviewPage() {
  const items = loadItems();
  const byNpc = new Map<string, Item[]>();
  for (const it of items) {
    const arr = byNpc.get(it.npc) ?? [];
    arr.push(it);
    byNpc.set(it.npc, arr);
  }

  return (
    <main className="mx-auto w-full max-w-[820px] bg-zinc-950 px-4 py-6 text-zinc-50">
      <header className="mb-5">
        <h1 className="text-xl font-bold">🎭 캐릭터 리뷰</h1>
        <p className="mt-1 text-[12px] text-zinc-400">
          NPC prototype·일관성 검증 · 채택 완료 후 본 페이지 정리 · 파일명 규약{' '}
          <code className="rounded bg-zinc-800 px-1">{'{npc}-{pose}.png'}</code>
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          총 {items.length}장 · NPC {byNpc.size}종 · 디렉터리{' '}
          <code className="rounded bg-zinc-800 px-1">public/sprites/characters/</code>
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-[12px] text-zinc-500">
          이미지 없음 — <code className="rounded bg-zinc-800 px-1">public/sprites/characters/</code>
          에 추가하면 새로고침 시 자동 노출됩니다.
        </p>
      ) : null}

      {Array.from(byNpc.entries()).map(([npc, list]) => {
        const meta = NPC_LABEL[npc];
        return (
          <section key={npc} className="mb-6">
            <h2 className="sticky top-0 z-10 -mx-4 mb-2 bg-zinc-950/95 px-4 py-1 text-sm font-semibold backdrop-blur">
              {meta ? `${meta.ko} (${npc})` : npc}{' '}
              <span className="text-zinc-500">
                · {list.length}장{meta ? ` · ${meta.role}` : ''}
              </span>
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {list.map((it) => (
                <figure
                  key={it.file}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2"
                >
                  <div className="relative aspect-square overflow-hidden rounded-md bg-zinc-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.href}
                      alt={it.file}
                      draggable={false}
                      className="absolute inset-0 h-full w-full object-contain"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                  <figcaption className="mt-2 flex items-baseline justify-between gap-1 text-[10px]">
                    <span className="truncate font-mono text-zinc-300">{it.pose}</span>
                    <span className="shrink-0 text-zinc-500 tabular-nums">{it.sizeKb}KB</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        );
      })}

      <footer className="mt-6 text-[10px] text-zinc-500">
        파일 추가 흐름: <code className="rounded bg-zinc-800 px-1">bun run scripts/_gen-character-*.ts</code>{' '}
        → <code className="rounded bg-zinc-800 px-1">cp /tmp/...png public/sprites/characters/</code>{' '}
        → 새로고침
      </footer>
    </main>
  );
}
