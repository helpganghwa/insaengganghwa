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

function styleOf(t: T): Style {
  if (t.code === 'zone_executor') return { executor: true };
  const hard = t.diff === '어려움' || t.diff === '한정';
  const sp = design.special[t.code];
  if (sp) return { fx: sp.fx, ...(sp.pt ? { pt: sp.pt } : {}), ...(hard ? { glow: true } : {}) };
  if (t.cat === '아이템 발동') {
    const cs = itemColors(t.cond);
    if (cs.length >= 2) return { gradient: cs, ...(hard ? { glow: true } : {}) };
    if (cs.length === 1) return { color: cs[0], ...(hard ? { glow: true } : {}) };
  }
  return { color: design.palette[t.cat] ?? '#a5b4fc', ...(hard ? { glow: true } : {}) };
}

const pub = titles.map((t) => ({
  code: t.code,
  kind: t.kind === '조건부' ? 'conditional' : t.kind === '헌정' ? 'tribute' : 'permanent',
  label: t.label,
  hidden: t.hidden,
  style: styleOf(t),
}));

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

export type TitleDef = { code: string; kind: TitleKind; label: string; hidden: boolean; style: TitleStyle };

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
