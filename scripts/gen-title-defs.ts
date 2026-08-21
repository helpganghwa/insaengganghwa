// 칭호 defs 생성 — titles-v1.json(목록) + titles-design-v1.json(디자인 배정) →
//   lib/game/titles/defs.ts        (클라이언트 공개: code·label·kind·hidden·style)
//   lib/game/titles/defs.server.ts (서버 전용: 조건 텍스트·난이도 — 비노출 원칙 TITLES.md §3.5)
// 조건은 공개 파일에 절대 싣지 않는다 — 번들을 뒤져도 획득 경로가 나오지 않아야 한다.
// 실행: bun run scripts/gen-title-defs.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { CATALOG_ITEMS } from '../lib/game/equipment/catalog';

type T = { code: string; cat: string; kind: string; label: string; cond: string; hidden: boolean; diff: string };
type Design = {
  typography: { size: string; weight: number };
  palette: Record<string, string>;
  regionKeywords: { pattern: string; color: string }[];
  special: Record<string, { fx: string; pt?: string }>;
  /** 어려움·한정 카테고리 시그니처 fx 패밀리(트랙 C) — special이 없는 칭호에 코드 해시로 순환 배정. */
  hardFx: Record<string, string[]>;
};

const ROOT = process.cwd();
const titles: T[] = JSON.parse(readFileSync(join(ROOT, 'scripts/titles-v1.json'), 'utf8'));
const design: Design = JSON.parse(readFileSync(join(ROOT, 'scripts/titles-design-v1.json'), 'utf8'));

const regionRes = design.regionKeywords.map((r) => ({ re: new RegExp(r.pattern), color: r.color }));

/** 아이템 발동 칭호 — 조건문의 아이템 이름에서 지역색(복수 가능) 추출. */
function itemColors(cond: string): string[] {
  const out: string[] = [];
  for (const { re, color } of regionRes) if (re.test(cond) && !out.includes(color)) out.push(color);
  return out;
}

type Style = {
  /** 단색(기본). gradient·fx가 있으면 생략 가능. */
  color?: string;
  /** 지역 혼합 세트 — 정적 그라데이션 색 목록. */
  gradient?: string[];
  /** 특별 이펙트 클래스명(title-fx.css의 fx-*). */
  fx?: string;
  /** 파티클 종류(title-fx.css의 pt-*). */
  pt?: string;
  /** 어려움·한정 공통 — 은은한 발광. */
  glow?: boolean;
  /** 집행관 — 기존 ExecutorTag 렌더(구역명=지역색+집행관 인디고)로 위임. */
  executor?: boolean;
};

// ── 팔레트 2차원화(트랙 C) — 카테고리 기본색을 난이도로 변주 ──
// 쉬움=저채도 소프트 / 중간=본색 / 어려움·한정=고채도 비비드(+글로우). 같은 카테고리 안에서도
// 난이도가 색으로 읽히고, 20색 팔레트가 사실상 3배로 벌어진다(수동 배정 없이 결정론 파생).
function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
function diffVariant(hex: string, diff: string): string {
  const [h, s, l] = hexToHsl(hex);
  if (diff === '쉬움') return hslToHex(h, Math.max(0, s * 0.62), Math.min(1, l + 0.06));
  if (diff === '어려움' || diff === '한정') return hslToHex(h, Math.min(1, s * 1.35 + 0.06), Math.max(0, l - 0.02));
  return hex; // 중간 = 본색
}

// 카테고리 내 시그니처 대상(어려움·한정, special·아이템 발동 제외)의 코드 정렬 순번.
const hardRanks = new Map<string, number>();
{
  const byCat = new Map<string, string[]>();
  for (const t of titles) {
    if ((t.diff === '어려움' || t.diff === '한정') && !design.special[t.code] && t.cat !== '아이템 발동' && t.code !== 'zone_executor') {
      const arr = byCat.get(t.cat) ?? [];
      arr.push(t.code);
      byCat.set(t.cat, arr);
    }
  }
  for (const arr of byCat.values()) {
    arr.sort();
    arr.forEach((code, i) => hardRanks.set(code, i));
  }
}
const hardRank = (t: T): number => hardRanks.get(t.code) ?? 0;

function styleOf(t: T): Style {
  if (t.code === 'zone_executor') return { executor: true };
  const hard = t.diff === '어려움' || t.diff === '한정';
  const sp = design.special[t.code];
  if (sp) return { fx: sp.fx, ...(sp.pt ? { pt: sp.pt } : {}), ...(hard ? { glow: true } : {}) };
  if (t.cat === '아이템 발동') {
    const cs = itemColors(t.cond);
    if (cs.length >= 2) return { gradient: cs, ...(hard ? { glow: true } : {}) };
    if (cs.length === 1) return { color: diffVariant(cs[0]!, t.diff), ...(hard ? { glow: true } : {}) };
  }
  // 어려움·한정 — 카테고리 시그니처 fx 패밀리(트랙 C). "글로우만"의 단조를 카테고리별 고유
  // 모션으로. 같은 카테고리 안에서는 코드 정렬 순번 라운드로빈 — 변주가 정확히 고르게 퍼진다
  // (해시는 4종 이하 소규모 패밀리에서 한쪽으로 뭉치는 것을 확인, 순번제로 교체).
  // 칭호 증감 시 배정이 밀릴 수 있으나 시그니처 계층은 카테고리 정체성(색군)이 같아 허용.
  if (hard) {
    const fam = design.hardFx[t.cat];
    if (fam?.length) return { fx: fam[hardRank(t) % fam.length] };
  }
  const base = design.palette[t.cat] ?? '#a5b4fc';
  return { color: diffVariant(base, t.diff), ...(hard ? { glow: true } : {}) };
}

const pub = titles.map((t) => ({
  code: t.code,
  kind: t.kind === '조건부' ? 'conditional' : t.kind === '헌정' ? 'tribute' : 'permanent',
  label: t.label,
  hidden: t.hidden,
  // 카테고리(그룹 표시용, 트랙 D) — cond와 달리 공개해도 획득 경로가 드러나지 않는다
  // (이름이 이미 공개인 것과 같은 수준의 힌트).
  cat: t.cat,
  style: styleOf(t),
}));

// fx/pt 실재 검증 — defs가 참조하는 클래스가 title-fx.css에 없으면 그 칭호는 무스타일로
// 조용히 깨진다(2026-08-21 트랙 C에서 신규 4종 누락 실사고). 생성 시점에 빌드 실패로 승격.
{
  const fxCss = readFileSync(join(ROOT, 'components/title-fx.css'), 'utf8');
  const haveFx = new Set([...fxCss.matchAll(/\.fx-(\w+)[{:]/g)].map((m) => m[1]));
  const havePt = new Set([...fxCss.matchAll(/\.pt-(\w+)>i/g)].map((m) => m[1]));
  for (const t of pub) {
    if (t.style.fx && !haveFx.has(t.style.fx)) throw new Error(`title-fx.css에 없는 fx: ${t.style.fx} (${t.code})`);
    if (t.style.pt && !havePt.has(t.style.pt)) throw new Error(`title-fx.css에 없는 pt: ${t.style.pt} (${t.code})`);
  }
}

// 아이템 발동 조건 → 기계 판독 명세(카탈로그 key + 최소 강화). 이름이 안 풀리면 빌드 실패.
const nameToKey = new Map(CATALOG_ITEMS.map((c) => [c.nameKo, c.key]));
function parseReq(cond: string): { items: string[]; min: number } | null {
  const m = cond.match(/^(.+?)[를을] \+(\d+) 이상으로 (?:동시 )?장착 중인 동안$/);
  if (!m) return null;
  const items = m[1].split(' + ').map((n) => {
    const k = nameToKey.get(n.trim());
    if (!k) throw new Error(`카탈로그에 없는 아이템명: "${n.trim()}" (cond: ${cond})`);
    return k;
  });
  return { items, min: parseInt(m[2], 10) };
}

const srv = titles.map((t) => {
  const req = t.cat === '아이템 발동' ? parseReq(t.cond) : null;
  if (t.cat === '아이템 발동' && !req) throw new Error(`아이템 발동 조건 파싱 실패: ${t.code} — ${t.cond}`);
  return { code: t.code, cat: t.cat, cond: t.cond, diff: t.diff, ...(req ? { req } : {}) };
});

mkdirSync(join(ROOT, 'lib/game/titles'), { recursive: true });

writeFileSync(join(ROOT, 'lib/game/titles/defs.ts'), `/**
 * 칭호 공개 정의 — 클라이언트 번들에 실린다. ⚠ 획득 조건 절대 금지(TITLES.md §3.5).
 * 조건·난이도는 defs.server.ts에만. 생성: bun run scripts/gen-title-defs.ts (수동 수정 금지)
 */
export type TitleKind = 'permanent' | 'conditional' | 'tribute';

export type TitleStyle = {
  color?: string;
  /** 지역 혼합 세트 — 정적 그라데이션. */
  gradient?: string[];
  /** 특별 이펙트(fx-*) / 파티클(pt-*) — components/title-fx.css. */
  fx?: string;
  pt?: string;
  /** 어려움·한정 공통 은은한 발광. */
  glow?: boolean;
  /** 집행관 — ExecutorTag 렌더 위임. */
  executor?: boolean;
};

export type TitleDef = { code: string; kind: TitleKind; label: string; hidden: boolean; cat: string; style: TitleStyle };

export const TITLE_DEFS: TitleDef[] = ${JSON.stringify(pub, null, 1).replace(/"([a-zA-Z_]\w*)":/g, '$1:')} as const;

export const TITLE_BY_CODE: ReadonlyMap<string, TitleDef> = new Map(TITLE_DEFS.map((t) => [t.code, t]));
`);

writeFileSync(join(ROOT, 'lib/game/titles/defs.server.ts'), `import 'server-only';

/**
 * 칭호 서버 전용 정의 — 획득 조건·난이도. 클라이언트로 새어나가면 안 된다(TITLES.md §3.5).
 * cond는 "발견 후" 공개용 설명 텍스트이자 판정 구현(judge.ts)의 명세.
 * 생성: bun run scripts/gen-title-defs.ts (수동 수정 금지)
 */
export type TitleSecret = { code: string; cat: string; cond: string; diff: '쉬움' | '중간' | '어려움' | '한정'; req?: { items: string[]; min: number } };

export const TITLE_SECRETS: TitleSecret[] = ${JSON.stringify(srv, null, 1).replace(/"([a-zA-Z_]\w*)":/g, '$1:')} as const;

export const TITLE_SECRET_BY_CODE: ReadonlyMap<string, TitleSecret> = new Map(TITLE_SECRETS.map((t) => [t.code, t]));
`);

const kinds = pub.reduce<Record<string, number>>((a, t) => ({ ...a, [t.kind]: (a[t.kind] ?? 0) + 1 }), {});
console.log(`defs ${pub.length}종`, kinds, '| fx', pub.filter((t) => t.style.fx).length, '| gradient', pub.filter((t) => t.style.gradient).length, '| glow', pub.filter((t) => t.style.glow).length);
