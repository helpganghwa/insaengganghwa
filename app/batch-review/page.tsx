// 임시 batch 리뷰 — 새 sprite candidates 4×5 = 20장 시각 비교.
// 사용자가 각 슬롯에서 베스트 선택하면 promote + lore 단계로.
// 리뷰 후 디렉터리 통째 삭제.

interface Item {
  slug: string;
  tone: string;
  region: string;
  slot: 'weapon' | 'armor' | 'accessory';
  /** 0~3 index of recommended candidate */
  recommend: number;
  hint: string; // 추천 사유 한 줄
  candidateNotes: string[]; // 각 candidate 한 줄 설명
}

const ITEMS: Item[] = [
  {
    slug: 'marsh_witty_dagger',
    tone: '위트',
    region: '늪지대',
    slot: 'weapon',
    recommend: 0,
    hint: '잎/개구리 모티프가 위트 톤을 가장 명확히 살림',
    candidateNotes: [
      '녹색 잎 단검 + 작은 개구리 머리',
      '물고기 형태 (생선뼈+머리)',
      '거친 뼈 단검 + 가시 crossguard',
      '청록 단검 + 와류 pommel + 작은 도마뱀',
    ],
  },
  {
    slug: 'marsh_mournful_sword',
    tone: '비애',
    region: '늪지대',
    slot: 'weapon',
    recommend: 0,
    hint: '마른 뿌리 ornament가 비애 톤과 가장 어울림',
    candidateNotes: [
      '검은 검 + 자루에 마른 뿌리/가지 ornament',
      '검정 검 + crossguard에 마른 잎',
      '어두운 비좁은 검 + 보석',
      '짧은 묘비형 검',
    ],
  },
  {
    slug: 'marsh_uncanny_axe',
    tone: '기괴',
    region: '늪지대',
    slot: 'weapon',
    recommend: 0,
    hint: '두개골+점액 모티프가 기괴 톤 최고치',
    candidateNotes: [
      '두개골 자루 + 칼날에 녹색 점액 흐름',
      '짧은 cleaver + 호박등불',
      '거미줄+검은 거미 박힌 양날 도끼',
      '녹/이끼 융합 도끼',
    ],
  },
  {
    slug: 'marsh_mystic_staff',
    tone: '수수께끼',
    region: '늪지대',
    slot: 'weapon',
    recommend: 2,
    hint: '랜턴 안에 갇힌 룬 보석이 수수께끼 톤에 가장 잘 맞음',
    candidateNotes: [
      '회색 지팡이 + 끝 청록 보석',
      '삼지창형 청록 룬 지팡이',
      '랜턴 wand + 안에 청록 룬 보석',
      '두개골 다발 wand + 녹색 점액 (기괴와 겹침)',
    ],
  },
  {
    slug: 'marsh_humble_spear',
    tone: '일상',
    region: '늪지대',
    slot: 'weapon',
    recommend: 1,
    hint: '청동 삼지창 = 늪 어부 일상 톤 명확 (※ 일상 → 장엄으로 변경, 본 항목은 폐기)',
    candidateNotes: [
      '단순 어두운 창 (가시 끝)',
      '청동 삼지창 어부의 작살',
      '막대형 창 + 가죽 끈',
      '짧은 어부 작살 + 단순 가죽 매듭',
    ],
  },
  {
    slug: 'marsh_legendary_polearm',
    tone: '장엄',
    region: '늪지대',
    slot: 'weapon',
    recommend: 3,
    hint: '가시 자루 폴암 + 거대 보라 꽃송이 → 늪의 전설 톤 최고치',
    candidateNotes: [
      '청록 도끼날 + 송장 머리 행거 + 가시 자루 (늪지 무덤 도끼)',
      '무거운 양손 battle axe (무게감 있지만 평이)',
      '회색 도끼날 + 두 보석 + 의례 술 (의례적)',
      '어두운 폴암 + 거대 보라 꽃송이 + 가시 자루 (늪의 전설)',
    ],
  },
];

export default function BatchReviewPage() {
  return (
    <main className="mx-auto w-full max-w-[390px] px-3 py-4 text-neutral-900 dark:text-neutral-100">
      <header className="mb-4">
        <h1 className="text-lg font-bold">Batch 1 리뷰</h1>
        <p className="text-[11px] text-neutral-500">
          늪지대 weapon × 5 톤 · 각 4 candidates · ⭐ = 추천 · 사용자 선택 후 promote + lore 작성
        </p>
      </header>

      {ITEMS.map((it) => (
        <section key={it.slug} className="mb-6">
          <h2 className="sticky top-0 z-10 -mx-3 mb-2 bg-white/95 px-3 py-1 text-sm font-semibold backdrop-blur dark:bg-neutral-950/95">
            {it.slug}{' '}
            <span className="text-neutral-500 text-xs">
              ({it.region} · {it.tone} · {it.slot})
            </span>
          </h2>
          <p className="mb-2 text-[10px] text-amber-700 dark:text-amber-300">⭐ 추천: c{it.recommend} — {it.hint}</p>
          <ul className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => {
              const isReco = i === it.recommend;
              return (
                <li
                  key={i}
                  className={`rounded-md border p-2 ${
                    isReco
                      ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-400/50 dark:bg-amber-950/30'
                      : 'border-neutral-200 bg-neutral-50/40 dark:border-neutral-800 dark:bg-neutral-900/30'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-mono text-neutral-500">c{i}</span>
                    {isReco && <span className="text-amber-700 dark:text-amber-300">⭐</span>}
                  </div>
                  <div className="my-1 flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/batch-review/${it.slug}/candidate_${i}.png`}
                      alt={`${it.slug} c${i}`}
                      width={128}
                      height={128}
                      className="block h-32 w-32 bg-neutral-100 dark:bg-neutral-800"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                  <p className="text-[10px] leading-snug text-neutral-700 dark:text-neutral-300">
                    {it.candidateNotes[i]}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <footer className="mt-8 border-t border-neutral-200 pt-3 text-center text-[10px] text-neutral-400 dark:border-neutral-800">
        리뷰 종료 후 <code>app/batch-review/</code> + <code>public/batch-review/</code> 삭제
      </footer>
    </main>
  );
}
