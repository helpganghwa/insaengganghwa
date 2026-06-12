'use client';

import {
  EMBLEM_SHAPES,
  EMBLEM_TONES,
  EMBLEM_KEYWORDS,
  EMBLEM_KEYWORD_CATEGORIES,
  subKeywordsFor,
  type EmblemSelection,
} from '@/lib/game/guild/emblem-vocab';

/**
 * 길드 문양 선택 — GUILD §1.6.
 *  모양(텍스트·1택) · 컬러(메인/서브 각 1택) · 키워드(메인 1 + 서브 0~1).
 *  생성 시 선택값을 AI가 받아 최적 프롬프트로 변환(생성 전 미리보기 없음).
 */
const KW_SELECT_CLS =
  'w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2 text-[13px] outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500';
function ColorRow({
  label,
  selectedId,
  exclude,
  onPick,
}: {
  label: string;
  selectedId: string;
  exclude?: string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[11px] font-semibold text-zinc-500">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {EMBLEM_TONES.filter((t) => t.id !== exclude).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            aria-label={`${label} ${t.ko}`}
            className={`h-6 w-6 rounded-full ring-2 ${selectedId === t.id ? 'ring-amber-500' : 'ring-transparent'}`}
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
  // 메인: 전체 키워드(테마 그룹). 서브: 메인 궁합 키워드만(테마 그룹, 빈 그룹 제외).
  const mainOptions = EMBLEM_KEYWORD_CATEGORIES.map((cat) => (
    <optgroup key={cat.id} label={cat.ko}>
      {EMBLEM_KEYWORDS.filter((k) => k.cat === cat.id).map((k) => (
        <option key={k.id} value={k.id}>
          {k.ko}
        </option>
      ))}
    </optgroup>
  ));
  const subPool = subKeywordsFor(value.mainKeywordId);
  const subOptions = EMBLEM_KEYWORD_CATEGORIES.map((cat) => {
    const items = subPool.filter((k) => k.cat === cat.id);
    if (items.length === 0) return null;
    return (
      <optgroup key={cat.id} label={cat.ko}>
        {items.map((k) => (
          <option key={k.id} value={k.id}>
            {k.ko}
          </option>
        ))}
      </optgroup>
    );
  }).filter(Boolean);

  return (
    <div className={`space-y-2.5 ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
      {/* 모양 — 텍스트 1택(실제 외형은 AI가 해석) */}
      <div>
        <p className="mb-1 text-[11px] font-semibold text-zinc-500">모양</p>
        <div className="grid grid-cols-4 gap-1">
          {EMBLEM_SHAPES.map((s) => {
            const on = value.shapeId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange({ ...value, shapeId: s.id })}
                className={`whitespace-nowrap rounded-lg border px-1 py-1.5 text-center text-[10px] font-semibold transition ${
                  on
                    ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                    : 'border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'
                }`}
              >
                {s.ko}
              </button>
            );
          })}
        </div>
      </div>

      {/* 컬러 — 메인 / 서브 */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-zinc-500">컬러</p>
        <ColorRow
          label="메인"
          selectedId={value.mainToneId}
          onPick={(id) =>
            onChange({
              ...value,
              mainToneId: id,
              // 메인이 서브와 같아지면 서브를 다른 색으로 이동(2색 강제).
              subToneId: value.subToneId === id ? (EMBLEM_TONES.find((t) => t.id !== id)?.id ?? id) : value.subToneId,
            })
          }
        />
        <ColorRow
          label="서브"
          selectedId={value.subToneId}
          exclude={value.mainToneId}
          onPick={(id) => onChange({ ...value, subToneId: id })}
        />
      </div>

      {/* 키워드 — 메인(필수) / 서브(선택) */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="mb-1 text-[11px] font-semibold text-zinc-500">메인 키워드</p>
          <select
            value={value.mainKeywordId}
            onChange={(e) => {
              const nextMain = e.target.value;
              // 새 메인과 어울리지 않는 서브는 해제.
              const ok = subKeywordsFor(nextMain).some((k) => k.id === value.subKeywordId);
              onChange({ ...value, mainKeywordId: nextMain, subKeywordId: ok ? value.subKeywordId : null });
            }}
            className={KW_SELECT_CLS}
          >
            {mainOptions}
          </select>
        </div>
        <div>
          <p className="mb-1 text-[11px] font-semibold text-zinc-500">서브 키워드</p>
          <select
            value={value.subKeywordId ?? ''}
            onChange={(e) => onChange({ ...value, subKeywordId: e.target.value || null })}
            className={KW_SELECT_CLS}
          >
            <option value="">없음</option>
            {subOptions}
          </select>
        </div>
      </div>
    </div>
  );
}

export const DEFAULT_EMBLEM: EmblemSelection = {
  shapeId: 'round',
  mainToneId: 'crimson',
  subToneId: 'gold',
  mainKeywordId: 'dragon',
  subKeywordId: null,
};
