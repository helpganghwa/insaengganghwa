/**
 * 길드 문양 3축 어휘 + 프롬프트 빌더 — GUILD §1.6. 고정 어휘(자유텍스트 없음 → 모더레이션 안전).
 * 클라이언트 picker와 서버 생성이 공유(서버 의존 없는 순수 모듈).
 */

export type EmblemShape = { id: string; ko: string; en: string };
export type EmblemTone = { id: string; ko: string; en: string; color: string };
export type EmblemKeyword = { id: string; ko: string; en: string };

/** ① 모양(1택, 6). en = 실루엣 단정 묘사(방패형 디폴트로 뭉개지지 않게 — 배너/사각판은 비방패임을 강조). */
export const EMBLEM_SHAPES: readonly EmblemShape[] = [
  { id: 'round', ko: '라운드 방패', en: 'a round shield' },
  { id: 'kite', ko: '카이트 방패', en: 'a tall narrow pointed kite shield' },
  { id: 'banner', ko: '전쟁 깃발', en: 'a hanging rectangular cloth war banner with a forked swallowtail bottom edge, not a shield' },
  { id: 'plaque', ko: '사각 문장판', en: 'a flat square stone heraldic plaque with straight edges, not a shield' },
  { id: 'winged', ko: '날개 문장', en: 'a shield flanked by a pair of large spread feathered wings' },
  { id: 'lozenge', ko: '마름모', en: 'a diamond-shaped lozenge standing on one point' },
] as const;

/** ② 색상톤(1택, 7). color = UI 악센트(emblem_color로 저장). */
export const EMBLEM_TONES: readonly EmblemTone[] = [
  { id: 'crimson', ko: '핏빛 적', en: 'crimson blood-red', color: '#b91c1c' },
  { id: 'gold', ko: '황금', en: 'golden', color: '#d4a017' },
  { id: 'ocean', ko: '심해 청', en: 'deep ocean blue', color: '#1e40af' },
  { id: 'toxic', ko: '독성 녹', en: 'toxic green', color: '#4d7c0f' },
  { id: 'arcane', ko: '마력 보라', en: 'arcane purple', color: '#7c3aed' },
  { id: 'iron', ko: '흑철', en: 'dark iron black', color: '#3f3f46' },
  { id: 'silver', ko: '백은', en: 'silver white', color: '#94a3b8' },
] as const;

/** ③ 키워드(1~3택, 20). */
export const EMBLEM_KEYWORDS: readonly EmblemKeyword[] = [
  { id: 'dragon', ko: '용', en: 'a dragon' },
  { id: 'wolf', ko: '늑대', en: 'a wolf' },
  { id: 'serpent', ko: '뱀', en: 'a serpent' },
  { id: 'raven', ko: '까마귀', en: 'a raven' },
  { id: 'griffin', ko: '그리핀', en: 'a griffin' },
  { id: 'swords', ko: '교차검', en: 'crossed swords' },
  { id: 'skull', ko: '해골', en: 'a skull' },
  { id: 'helmet', ko: '투구', en: 'a knight helmet' },
  { id: 'axe', ko: '도끼', en: 'a battle axe' },
  { id: 'crown', ko: '왕관', en: 'a crown' },
  { id: 'lion', ko: '사자', en: 'a lion' },
  { id: 'eye', ko: '눈', en: 'an eye' },
  { id: 'crystal', ko: '크리스탈', en: 'a crystal' },
  { id: 'starmoon', ko: '별·달', en: 'a star and moon' },
  { id: 'flame', ko: '불꽃', en: 'a flame' },
  { id: 'volcano', ko: '화산', en: 'a volcano' },
  { id: 'wings', ko: '천사 날개', en: 'angel wings' },
  { id: 'slime', ko: '슬라임', en: 'a slime' },
  { id: 'totem', ko: '오크 토템', en: 'an orc totem' },
  { id: 'temple', ko: '신전', en: 'a temple' },
] as const;

export const EMBLEM_KEYWORDS_MIN = 1;
export const EMBLEM_KEYWORDS_MAX = 3;

export type EmblemSelection = { shapeId: string; toneId: string; keywordIds: string[] };

/** 선택이 유효한지(존재하는 id·키워드 1~3개). */
export function isValidEmblemSelection(s: EmblemSelection): boolean {
  if (!EMBLEM_SHAPES.some((x) => x.id === s.shapeId)) return false;
  if (!EMBLEM_TONES.some((x) => x.id === s.toneId)) return false;
  const uniq = [...new Set(s.keywordIds)];
  if (uniq.length < EMBLEM_KEYWORDS_MIN || uniq.length > EMBLEM_KEYWORDS_MAX) return false;
  return uniq.every((k) => EMBLEM_KEYWORDS.some((x) => x.id === k));
}

/** 선택된 톤의 UI 악센트 색(emblem_color). 없으면 null. */
export function toneColor(toneId: string): string | null {
  return EMBLEM_TONES.find((t) => t.id === toneId)?.color ?? null;
}

/**
 * 3축 → 검증된 프롬프트(§1.6). 스타일은 고정 앵커(픽셀아트·오르네이트 테두리·중앙 단일 볼드 모티브·투명배경)
 * → 소형(맵 노드 16~24px) 가독성. 키워드가 많아도 "중앙 1개 모티브"로 단순화.
 */
export function buildEmblemPrompt(s: EmblemSelection): string {
  const shape = EMBLEM_SHAPES.find((x) => x.id === s.shapeId)!.en;
  const tone = EMBLEM_TONES.find((x) => x.id === s.toneId)!.en;
  const kws = [...new Set(s.keywordIds)]
    .map((k) => EMBLEM_KEYWORDS.find((x) => x.id === k)?.en)
    .filter(Boolean)
    .join(', ');
  return (
    `dark fantasy pixel art guild emblem, the overall shape is ${shape}, in a ${tone} color palette, ` +
    `featuring ${kws} as a single bold central symmetrical motif, an ornate border that traces the outer silhouette of the shape, ` +
    `clean strong silhouette, bold and readable at small sizes, centered, transparent background, no text`
  );
}
