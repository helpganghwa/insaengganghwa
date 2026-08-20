import type { ComponentType } from 'react';

import * as about from './docs/about';
import * as diamond from './docs/diamond';
import * as enhance from './docs/enhance';
import * as transcend from './docs/transcend';
import * as supply from './docs/supply';
import * as equipment from './docs/equipment';
import * as combatPower from './docs/combat-power';
import * as codex from './docs/codex';
import * as raid from './docs/raid';
import * as melee from './docs/melee';
import * as ranking from './docs/ranking';
import * as guild from './docs/guild';
import * as guildRoles from './docs/guild-roles';
import * as conquest from './docs/conquest';
import * as friends from './docs/friends';
import * as avatar from './docs/avatar';
import * as shop from './docs/shop';
import * as titles from './docs/titles';

/** 좌측 목록의 묶음 순서 — 배열 순서가 곧 화면 순서다. */
export const WIKI_CATS = ['시작', '성장', '경쟁', '길드', '사회', '계정'] as const;
export type WikiCat = (typeof WIKI_CATS)[number];

/** 우측 "이 문서" 목차의 원천. id는 본문 <H2 id>와 1:1이어야 앵커가 맞는다. */
export interface WikiSection {
  id: string;
  label: string;
}

export interface WikiDocMeta {
  slug: string;
  cat: WikiCat;
  title: string;
  summary: string;
  sections: readonly WikiSection[];
}

export interface WikiDoc {
  meta: WikiDocMeta;
  Body: ComponentType;
}

/** 목록·검색용 경량 형태 — 본문 컴포넌트 없이 직렬화해 클라이언트로 넘길 수 있다. */
export type WikiDocLink = Pick<WikiDocMeta, 'slug' | 'cat' | 'title' | 'summary'>;

// 명시적 import 목록이 유일한 등록 절차다. 동적 glob은 정적 생성·타입 추적이 안 되고,
// 문서가 조용히 누락돼도 빌드가 알려주지 않는다.
const MODULES = [
  about,
  diamond,
  enhance,
  transcend,
  supply,
  equipment,
  combatPower,
  codex,
  raid,
  melee,
  ranking,
  guild,
  guildRoles,
  conquest,
  friends,
  titles,
  avatar,
  shop,
];

export const WIKI_DOCS: readonly WikiDoc[] = MODULES.map((m) => ({
  meta: m.meta,
  Body: m.default,
}));

export const WIKI_DOC_BY_SLUG: ReadonlyMap<string, WikiDoc> = new Map(
  WIKI_DOCS.map((d) => [d.meta.slug, d]),
);

export const WIKI_LINKS: readonly WikiDocLink[] = WIKI_DOCS.map(({ meta }) => ({
  slug: meta.slug,
  cat: meta.cat,
  title: meta.title,
  summary: meta.summary,
}));

/** 분류별 묶음 — 좌측 목록·첫 화면 목록이 공유한다. 문서가 없는 분류는 빈 배열. */
export function docsInCat(cat: WikiCat): readonly WikiDocLink[] {
  return WIKI_LINKS.filter((d) => d.cat === cat);
}
