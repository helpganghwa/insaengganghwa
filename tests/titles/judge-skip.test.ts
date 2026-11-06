import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TITLE_BY_CODE } from '@/lib/game/titles/defs';
import { METRIC_QUERY_NAMES, SKIPPABLE_QUERIES } from '@/lib/game/titles/judge';

/**
 * 판정 쿼리 건너뛰기(2026-11-06 업데이트 18) 안전장치 — 보유한 영구 칭호만 먹이는 지표 쿼리를 건너뛰므로,
 * 표(SKIPPABLE_QUERIES)가 틀리면 칭호가 **조용히** 안 나온다. 표를 손으로 믿지 않고 judge.ts 소스에서 다시 계산해 대조한다.
 *  ① 지표 이름 → 쿼리: collectMetrics의 반환 객체(`key: n(sp.total)`)와 `sp = g(supply)` 대입에서 찾는다.
 *  ② 칭호 → 지표: RULES의 각 술어 소스에서 `m.<지표>`를 모은다.
 *  ③ 칭호가 읽는 쿼리가 건너뛸 수 있는 쿼리면, 그 쿼리의 feeds에 반드시 있어야 한다(빠지면 그 칭호를 못 가진 채 건너뛴다).
 *  ④ 조건부(activeConditionals)가 읽는 지표는 건너뛰지 않는 쿼리에서만 와야 한다.
 */
const SRC = readFileSync(fileURLToPath(new URL('../../lib/game/titles/judge.ts', import.meta.url)), 'utf8');
const stripComments = (s: string) => s.replace(/\/\/[^\n]*/g, '');

function block(start: string, end: string): string {
  const i = SRC.indexOf(start);
  expect(i, `소스에서 "${start}"를 못 찾음`).toBeGreaterThan(-1);
  const j = SRC.indexOf(end, i + start.length);
  expect(j).toBeGreaterThan(i);
  return SRC.slice(i + start.length, j);
}

/** ① 지표 키 → 쿼리 이름. */
function metricQueryMap(): Map<string, string> {
  const body = stripComments(block('async function collectMetrics(', '\n/** 지표 기반 규칙'));
  const varToQuery = new Map<string, string>();
  for (const m of body.matchAll(/\b([a-z0-9]+) = g\(([a-z0-9]+)\)/g)) varToQuery.set(m[1]!, m[2]!);
  varToQuery.set('pos', 'ranks');
  varToQuery.set('combatValue', 'ranks');
  const ret = body.slice(body.lastIndexOf('  return {'));
  const keys = [...ret.matchAll(/(?:^|[\s,{])([a-z_0-9]+):\s/g)].map((m) => ({ key: m[1]!, at: m.index! }));
  const out = new Map<string, string>();
  keys.forEach(({ key, at }, i) => {
    const text = ret.slice(at, keys[i + 1]?.at ?? ret.length);
    const qs = new Set([...text.matchAll(/\b([a-zA-Z0-9]+)[.!]/g)].map((m) => varToQuery.get(m[1]!)).filter(Boolean) as string[]);
    if (/\bcombatValue\b/.test(text)) qs.add('ranks');
    // 여러 쿼리를 합친 파생값(hoard_ok)은 첫 키로 대표하지 않고 전부 기록한다(쉼표로 이어 붙임).
    out.set(key, [...qs].sort().join(','));
  });
  // 최초 이정표 순위(fr_*)는 펼침으로 들어온다.
  for (const k of ['fr_enh500', 'fr_sum20k', 'fr_t30', 'fr_combat10m']) out.set(k, 'firsts');
  return out;
}

/** ② 칭호 코드 → 술어가 읽는 지표 키. */
function ruleKeys(): Map<string, Set<string>> {
  const body = stripComments(block('const RULES: Record<string, (m: Metrics) => boolean> = {', '\n};\n'));
  const entries = [...body.matchAll(/\n\s{2}([a-z_0-9]+): \(m\) =>/g)].map((m) => ({ code: m[1]!, at: m.index! }));
  const out = new Map<string, Set<string>>();
  entries.forEach(({ code, at }, i) => {
    const text = body.slice(at, entries[i + 1]?.at ?? body.length);
    out.set(code, new Set([...text.matchAll(/\bm\.([a-z_0-9]+)/g)].map((m) => m[1]!)));
  });
  return out;
}

describe('칭호 판정 — 보유 칭호로 쿼리 건너뛰기 표', () => {
  const kq = metricQueryMap();
  const rk = ruleKeys();

  it('쿼리 이름 목록이 collectMetrics 구조분해 순서와 같다', () => {
    const body = block('async function collectMetrics(', '\n/** 지표 기반 규칙');
    const m = body.match(/const \[([^\]]+)\] = await runLimited\(/);
    expect(m).not.toBeNull();
    const names = m![1]!.split(',').map((x) => x.trim());
    expect(names).toEqual([...METRIC_QUERY_NAMES]);
  });

  it('RULES가 읽는 지표는 모두 출처 쿼리를 찾을 수 있다', () => {
    expect(rk.size).toBeGreaterThan(200);
    for (const [code, keys] of rk) {
      for (const k of keys) expect(kq.get(k), `${code} → m.${k} 출처 없음`).toBeTruthy();
    }
  });

  it('칭호가 읽는 쿼리가 건너뛸 수 있는 쿼리면 그 쿼리 feeds에 그 칭호가 있다', () => {
    for (const [code, keys] of rk) {
      for (const k of keys) {
        for (const q of kq.get(k)!.split(',')) {
          const sk = SKIPPABLE_QUERIES[q as keyof typeof SKIPPABLE_QUERIES];
          if (sk) expect(sk.feeds, `${q} 쿼리를 건너뛰면 ${code}(m.${k})가 안 나온다 — feeds에 추가할 것`).toContain(code);
        }
      }
    }
  });

  it('feeds의 칭호는 실재하는 영구형 RULES이고, 그 쿼리의 지표를 실제로 읽는다', () => {
    for (const [q, sk] of Object.entries(SKIPPABLE_QUERIES)) {
      expect(METRIC_QUERY_NAMES as readonly string[]).toContain(q);
      for (const code of sk!.feeds) {
        expect(rk.has(code), `${q}.feeds의 ${code}는 RULES에 없다`).toBe(true);
        expect(TITLE_BY_CODE.get(code)?.kind, `${code}는 조건부 — 건너뛰기 대상이 될 수 없다`).not.toBe('conditional');
        const reads = [...rk.get(code)!].some((k) => kq.get(k)!.split(',').includes(q));
        expect(reads, `${q}.feeds의 ${code}는 ${q} 쿼리의 지표를 읽지 않는다`).toBe(true);
      }
    }
  });

  it('조건부 활성(activeConditionals)이 읽는 지표는 건너뛰지 않는 쿼리에서만 온다', () => {
    const body = stripComments(block('export async function activeConditionals(', '\n}\n'));
    const keys = new Set([...body.matchAll(/\bmm\.([a-z_0-9]+)/g)].map((m) => m[1]!));
    expect(keys.size).toBeGreaterThan(10);
    for (const k of keys) {
      const qs = kq.get(k);
      expect(qs, `activeConditionals → mm.${k} 출처 없음`).toBeTruthy();
      for (const q of qs!.split(',')) {
        expect(SKIPPABLE_QUERIES[q as keyof typeof SKIPPABLE_QUERIES], `조건부가 읽는 ${q}(mm.${k})는 건너뛰면 안 된다`).toBeUndefined();
      }
    }
  });
});
