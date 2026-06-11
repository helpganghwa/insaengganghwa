'use client';

import {
  EMBLEM_SHAPES,
  EMBLEM_TONES,
  EMBLEM_KEYWORDS,
  EMBLEM_KEYWORD_CATEGORIES,
  type EmblemSelection,
} from '@/lib/game/guild/emblem-vocab';

/**
 * 길드 문양 선택 — GUILD §1.6.
 *  모양(SVG 미리보기·1택) · 컬러(메인/서브 각 1택) · 키워드(카테고리별 0~1, 합계 ≥1).
 *  생성 전이라 실제 이미지 미리보기는 없음(모양은 대략 실루엣).
 */
function ColorRow({
  label,
  selectedId,
  onPick,
}: {
  label: string;
  selectedId: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[11px] font-semibold text-zinc-500">{label}</span>
      <div className="flex flex-wrap gap-2">
        {EMBLEM_TONES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            aria-label={`${label} ${t.ko}`}
            className={`h-7 w-7 rounded-full ring-2 ${selectedId === t.id ? 'ring-amber-500' : 'ring-transparent'}`}
            style={{ backgroundColor: t.color }}
          />
        ))}
      </div>
    </div>
  );
}

export function EmblemPicker({
  value,
  onChange,
  disabled,
}: {
  value: EmblemSelection;
  onChange: (s: EmblemSelection) => void;
  disabled?: boolean;
}) {
  // 키워드 토글 — 같은 카테고리는 1개로 교체(0~1), 합계 ≥1 유지(마지막 1개는 해제 불가).
  const toggleKeyword = (id: string) => {
    const k = EMBLEM_KEYWORDS.find((x) => x.id === id);
    if (!k) return;
    const on = value.keywordIds.includes(id);
    if (on) {
      if (value.keywordIds.length <= 1) return; // 최소 1개
      onChange({ ...value, keywordIds: value.keywordIds.filter((x) => x !== id) });
    } else {
      const sameCat = EMBLEM_KEYWORDS.filter((x) => x.cat === k.cat).map((x) => x.id);
      const next = value.keywordIds.filter((x) => !sameCat.includes(x)).concat(id);
      onChange({ ...value, keywordIds: next });
    }
  };

  return (
    <div className={`space-y-3 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      {/* 모양 — SVG 실루엣 + 이름 */}
      <div>
        <p className="mb-1 text-[11px] font-semibold text-zinc-500">모양</p>
        <div className="grid grid-cols-3 gap-1.5">
          {EMBLEM_SHAPES.map((s) => {
            const on = value.shapeId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange({ ...value, shapeId: s.id })}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition ${
                  on
                    ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                    : 'border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
                  <path d={s.svg} fill="currentColor" />
                </svg>
                <span className="truncate">{s.ko}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 컬러 — 메인 / 서브 */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-zinc-500">컬러</p>
        <ColorRow label="메인" selectedId={value.mainToneId} onPick={(id) => onChange({ ...value, mainToneId: id })} />
        <ColorRow label="서브" selectedId={value.subToneId} onPick={(id) => onChange({ ...value, subToneId: id })} />
      </div>

      {/* 키워드 — 카테고리별 0~1, 합계 ≥1 */}
      <div>
        <p className="mb-1 text-[11px] font-semibold text-zinc-500">키워드</p>
        <div className="space-y-2">
          {EMBLEM_KEYWORD_CATEGORIES.map((cat) => (
            <div key={cat.id}>
              <p className="mb-1 text-[10px] font-medium text-zinc-400">{cat.ko}</p>
              <div className="flex flex-wrap gap-1.5">
                {EMBLEM_KEYWORDS.filter((k) => k.cat === cat.id).map((k) => {
                  const on = value.keywordIds.includes(k.id);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => toggleKeyword(k.id)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        on
                          ? 'bg-amber-600 text-white'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                      }`}
                    >
                      {k.ko}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const DEFAULT_EMBLEM: EmblemSelection = {
  shapeId: 'round',
  mainToneId: 'crimson',
  subToneId: 'gold',
  keywordIds: ['dragon'],
};
