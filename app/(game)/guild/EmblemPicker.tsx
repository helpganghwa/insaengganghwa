'use client';

import {
  EMBLEM_SHAPES,
  EMBLEM_TONES,
  EMBLEM_KEYWORDS,
  EMBLEM_KEYWORDS_MAX,
  EMBLEM_KEYWORDS_MIN,
  type EmblemSelection,
} from '@/lib/game/guild/emblem-vocab';

/** 길드 문양 3축 선택 — GUILD §1.6. 모양1·색상톤1·키워드1~3. 생성 전이라 이미지 미리보기는 없음. */
export function EmblemPicker({
  value,
  onChange,
  disabled,
}: {
  value: EmblemSelection;
  onChange: (s: EmblemSelection) => void;
  disabled?: boolean;
}) {
  const toggleKeyword = (id: string) => {
    const has = value.keywordIds.includes(id);
    if (has) {
      if (value.keywordIds.length <= EMBLEM_KEYWORDS_MIN) return; // 최소 1개 유지
      onChange({ ...value, keywordIds: value.keywordIds.filter((k) => k !== id) });
    } else if (value.keywordIds.length < EMBLEM_KEYWORDS_MAX) {
      onChange({ ...value, keywordIds: [...value.keywordIds, id] });
    }
  };

  return (
    <div className={`space-y-3 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      {/* 모양 */}
      <div>
        <p className="mb-1 text-[11px] font-semibold text-zinc-500">모양</p>
        <div className="flex flex-wrap gap-1.5">
          {EMBLEM_SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onChange({ ...value, shapeId: s.id })}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                value.shapeId === s.id
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              {s.ko}
            </button>
          ))}
        </div>
      </div>

      {/* 색상톤 */}
      <div>
        <p className="mb-1 text-[11px] font-semibold text-zinc-500">색상</p>
        <div className="flex flex-wrap gap-2">
          {EMBLEM_TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange({ ...value, toneId: t.id })}
              aria-label={t.ko}
              className={`h-7 w-7 rounded-full ring-2 ${
                value.toneId === t.id ? 'ring-amber-500' : 'ring-transparent'
              }`}
              style={{ backgroundColor: t.color }}
            />
          ))}
        </div>
      </div>

      {/* 키워드 */}
      <div>
        <p className="mb-1 text-[11px] font-semibold text-zinc-500">
          키워드 ({value.keywordIds.length}/{EMBLEM_KEYWORDS_MAX})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {EMBLEM_KEYWORDS.map((k) => {
            const on = value.keywordIds.includes(k.id);
            const full = !on && value.keywordIds.length >= EMBLEM_KEYWORDS_MAX;
            return (
              <button
                key={k.id}
                type="button"
                onClick={() => toggleKeyword(k.id)}
                disabled={full}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold disabled:opacity-35 ${
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
    </div>
  );
}

export const DEFAULT_EMBLEM: EmblemSelection = {
  shapeId: 'round',
  toneId: 'crimson',
  keywordIds: ['dragon'],
};
