'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 어드민 공용 검색창 — 유저코드 / 닉네임 / 거래(주문)ID. 제출 시 현재 경로에 ?q= 부착.
 * 검색 모드에서는 날짜 필터를 무시하고 전체에서 조회(서버 페이지가 처리).
 */
export function AdminSearch({ basePath, initialQuery }: { basePath: string; initialQuery: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);

  const submit = () => {
    const t = q.trim();
    router.push(t ? `${basePath}?q=${encodeURIComponent(t)}` : basePath);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="유저코드 · 닉네임 · 거래ID"
        // text-base(16px) — iOS 포커스 줌 방지(스케일 잠금 금지 정책).
        className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-base text-zinc-100 placeholder:text-zinc-600"
      />
      <button
        type="button"
        onClick={submit}
        className="shrink-0 rounded-lg border border-amber-700/60 bg-amber-900/20 px-3 py-1.5 text-sm font-bold text-amber-300"
      >
        검색
      </button>
      {initialQuery ? (
        <button
          type="button"
          onClick={() => router.push(basePath)}
          className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400"
        >
          초기화
        </button>
      ) : null}
    </div>
  );
}
