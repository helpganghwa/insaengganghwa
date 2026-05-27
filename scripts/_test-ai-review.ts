// AI 검토 dry-run — 우리가 만든 character 결과들로 PASS/FAIL 판정 검증.
// 실행: bun run scripts/_test-ai-review.ts

import { config } from 'dotenv';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewProfile } from '../lib/game/profile/ai-review';

config({ path: '.env.local' });

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY missing — Anthropic Console에서 발급 후 .env.local에 채울 것');
  process.exit(1);
}

interface Case {
  name: string;
  file: string;
  description: string;
  expected: 'pass' | 'fail';
  hint?: string;
}

const PROTO = `${process.env.HOME}/Desktop/insaeng-proto`;

const SCHOLAR_F_DESC = `slim 7-heads-tall adult bishojo young rune mountain scholar character of insaeng-ganghwa game, NOT chibi NOT super deformed, emphasizing tall slender feminine anime body proportions with narrow slim waist, ample bust, and curvy thighs (classic JRPG female adventurer build), small head and long graceful legs, total body height approximately seven times head height.

Face: oval face with soft jawline, huge anime doe eyes with multi-highlights and dramatic lashes, small upturned nose, small pink lips, gentle thoughtful expression.

Hair: voluminous wind-swept long pale teal-ash hair flowing past the waist with individual pixel strands and side bangs, single small ahoge.

Outfit: light cream-and-teal flowing rune scholar cloak with hood down, fine silver rune embroidery along the hem and a small sealed rune at the collar, fitted cream bodice underneath cinched by a slim leather sash at the narrow waist, dark indigo cloth thigh-high stockings, soft brown ankle boots.

Accessory: delicate silver diadem resting on the brow with a single small clear gemstone at the center, small silver scholar earrings.

Holding: a tall teal feather quill pen in the right hand pointing down at the side, with a single small drop of ink frozen at the tip; left hand relaxed at the side.

Pose: T-pose standing centered front-facing facing the viewer directly, tall confident scholarly stance with feminine posture.

Style: colored reddish-brown outline rim (not pure black), rich gradient cel shading, warm pastel palette with soft cream, teal, silver, and warm browns, classic JRPG anime pixel art aesthetic, pure white background, character only.`;

const SCHOLAR_M_DESC = SCHOLAR_F_DESC.replace(/bishojo/g, 'bishonen').replace(/feminine/g, 'masculine').replace(/narrow slim waist, ample bust, and curvy thighs \(classic JRPG female adventurer build\), /g, '');

const ORC_DESC = `slim 7-heads-tall adult bishonen orc-blooded chieftain mascot character of insaeng-ganghwa game, NOT chibi NOT super deformed.

Face: oval face with strong jawline, huge anime doe eyes with multi-highlights, small nose, small lips, stoic neutral expression, faint tribal tattoo across one cheek.

Hair: voluminous wind-swept deep black braided warrior hair with individual pixel strands, single small ahoge, leather cord wrapped around the braid.

Outfit: dark forest green ceremonial chieftain breastplate with bright green tribal glyphs engraved across the chest, animal tusks fixed on each shoulder pauldron, deep brown leather kilt with bronze studs, knee-high lace-up worn leather boots.

Accessory: wide ornate gold neck collar with swirl patterns and a single large red ruby at the center flanked by smaller rubies — the collar of seven chieftains.

Holding: a massive ancestral two-handed warhammer resting head-down beside him, the black stone head wrapped with a gold band engraved with seven ancestor names, thick dark wood haft.

Pose: T-pose standing centered front-facing, calm and authoritative chieftain stance.

Style: colored reddish-brown outline rim (not pure black), rich gradient cel shading, warm earthy palette with deep forest green, gold, ember red, dark brown, classic JRPG anime pixel art aesthetic, pure white background, character only.`;

const CASES: Case[] = [
  {
    name: 'v6 여자 학자 (사용자 만족)',
    file: 'v2pro-scholar6-south.png',
    description: SCHOLAR_F_DESC,
    expected: 'pass',
    hint: '명확 PASS — 사용자 만족 결과',
  },
  {
    name: 'v5 남자 학자 (web 동등)',
    file: 'v2pro-scholar5-south.png',
    description: SCHOLAR_M_DESC,
    expected: 'pass',
    hint: 'PASS — 톤·구도 OK',
  },
  {
    name: 'v4 디즈니풍 학자',
    file: 'v2pro-scholar4-south.png',
    description: SCHOLAR_M_DESC,
    expected: 'pass',
    hint: 'PASS — 사용자 취향 아니어도 명백 결함 X',
  },
  {
    name: 'v1 orc chieftain (짜리몽땅)',
    file: 'v2pro-orc-chieftain-south.png',
    description: ORC_DESC,
    expected: 'pass',
    hint: 'PASS — 비율 짧지만 결함 X',
  },
];

async function main() {
  let pass = 0;
  let fail = 0;
  let mismatch = 0;

  for (const c of CASES) {
    const path = join(PROTO, c.file);
    console.log(`\n[${c.name}]  expected=${c.expected}`);
    try {
      const buf = readFileSync(path);
      const t0 = Date.now();
      const result = await reviewProfile({ imagePng: buf, descriptionPrompt: c.description });
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      const actual = result.verdict.pass ? 'pass' : 'fail';
      const ok = actual === c.expected;
      if (ok) pass++; else mismatch++;
      console.log(
        `  → ${actual.toUpperCase()} ${ok ? '✓' : '✗ (mismatch)'} · ${dt}s · in=${result.usage.inputTokens} out=${result.usage.outputTokens} cache=${result.usage.cacheReadTokens ?? '-'}`,
      );
      console.log(`  reasons: ${JSON.stringify(result.verdict.reasons)}`);
      if (result.verdict.notes) console.log(`  notes: ${result.verdict.notes}`);
    } catch (e) {
      fail++;
      console.error(`  ✗ ERROR ${(e as Error).message}`);
    }
  }

  console.log(`\n[summary] ok=${pass} · mismatch=${mismatch} · error=${fail} / ${CASES.length}`);
  process.exit(mismatch + fail > 0 ? 1 : 0);
}

main();
