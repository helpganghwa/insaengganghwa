/**
 * 동시 큐 테스트 — 6 케이스(남3/여3) 다양성 max 조합으로 /v2/create-character-state 동시 POST.
 *
 * 흐름: composeEditDescription → POST → polling(rotation_urls + south HEAD retry) → JSON 저장.
 * jobs INSERT 우회(활성 큐 1건 UNIQUE 회피) — pixellab API 측 동시성만 검증.
 */
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) { console.error('PIXELLAB_API_KEY missing'); process.exit(1); }

const PIXELLAB_BASE = 'https://api.pixellab.ai/v2';
const SOURCE = {
  // 2026-05-28 — 7-8등신 심플 프롬프트 source.
  male: '921ba198-d299-4f92-8d5d-bde41d2e179c',
  female: 'cdc970f0-44a8-4c9e-8555-c4e01aeae3a1',
} as const;

type Gender = 'male' | 'female';

interface Case {
  label: string;
  opts: {
    gender: Gender;
    hairLength: 'long'|'short'|'natural';
    pose: 'natural'|'arms_crossed'|'hand_wave'|'peace_sign'|'hand_on_hip';
    race: 'human'|'elf'|'dark_elf'|'nekomimi'|'dragonkin'|'fairy';
  };
  eq: { weaponKey: string; armorKey: string; accessoryKey: string };
}

// 4 case — 여2·남2, 새 source(7-8등신)로 새 장비 세트. race는 gender 제약.
const CASES: Case[] = [
  {
    label: 'nekomimi F · long · arms_crossed — marsh(frog)',
    opts: { gender:'female', hairLength:'long', pose:'arms_crossed', race:'nekomimi' },
    eq: { weaponKey:'marsh_frog_leaf_dirk', armorKey:'marsh_lily_dress', accessoryKey:'marsh_lily_amulet' },
  },
  {
    label: 'dragonkin M · short · peace_sign — dragon',
    opts: { gender:'male', hairLength:'short', pose:'peace_sign', race:'dragonkin' },
    eq: { weaponKey:'common_twin_dragon_scepter', armorKey:'common_imperial_dragon_robe', accessoryKey:'common_phoenix_egg_pendant' },
  },
];

interface Result {
  caseIdx: number;
  label: string;
  opts: Case['opts'];
  eq: Case['eq'];
  edit_description: string;
  source_character_id: string;
  character_id?: string;
  background_job_id?: string;
  south_url?: string;
  rotations?: Record<string, string>;
  ms_to_enqueue?: number;
  ms_to_complete?: number;
  error?: string;
}

async function main() {
  const { composeEditDescription } = await import('../lib/game/profile/compose');
  const startAll = Date.now();
  const results: Result[] = CASES.map((c, i) => ({
    caseIdx: i,
    label: c.label,
    opts: c.opts,
    eq: c.eq,
    edit_description: composeEditDescription(c.opts, c.eq),
    source_character_id: SOURCE[c.opts.gender],
  }));

  console.log(`[concurrent-${CASES.length}] step 1 — ${CASES.length} 동시 POST`);
  await Promise.all(results.map(async (r) => {
    const t0 = Date.now();
    try {
      const res = await fetch(`${PIXELLAB_BASE}/create-character-state`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          character_id: r.source_character_id,
          edit_description: r.edit_description,
          no_background: true,
          use_color_palette_from_reference: false,
        }),
      });
      r.ms_to_enqueue = Date.now() - t0;
      if (!res.ok) { r.error = `POST HTTP ${res.status}: ${(await res.text()).slice(0,200)}`; return; }
      const j = await res.json() as { character_id: string; background_job_id: string };
      r.character_id = j.character_id;
      r.background_job_id = j.background_job_id;
      console.log(`  [${r.caseIdx}] ${r.label.slice(0,50)} → ${j.character_id} (${r.ms_to_enqueue}ms)`);
    } catch (e) {
      r.error = `POST exception: ${(e as Error).message}`;
    }
  }));

  console.log('\n[concurrent] step 2 — 폴링 (rotation_urls + south HEAD 검증)');
  const MAX_MS = 6 * 60 * 1000;
  while (Date.now() - startAll < MAX_MS) {
    await new Promise(r => setTimeout(r, 10_000));
    const stillProcessing = results.filter(r => r.character_id && !r.south_url && !r.error);
    if (stillProcessing.length === 0) break;
    await Promise.all(stillProcessing.map(async (r) => {
      try {
        const res = await fetch(`${PIXELLAB_BASE}/characters/${r.character_id}`, {
          headers: { authorization: `Bearer ${KEY}` },
        });
        if (res.status === 404) {
          r.error = 'character not found (Pixellab transient)';
          return;
        }
        if (!res.ok) return;
        const c = await res.json() as { rotation_urls?: Record<string, string|null> };
        if (!c.rotation_urls) return;
        const urls: Record<string, string> = {};
        for (const [k, v] of Object.entries(c.rotation_urls)) if (typeof v === 'string' && v) urls[k] = v;
        if (Object.keys(urls).length < 8) return;
        // south.png 실제 fetch 검증 — 5회 retry × 3초 간격.
        let southOk = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const head = await fetch(urls['south']!, { method: 'HEAD' });
          if (head.ok) { southOk = true; break; }
          await new Promise(r => setTimeout(r, 3000));
        }
        if (!southOk) return;
        r.rotations = urls;
        r.south_url = urls['south'];
        r.ms_to_complete = Date.now() - startAll;
        console.log(`  [${r.caseIdx}] ready (${(r.ms_to_complete / 1000).toFixed(0)}s)`);
      } catch {}
    }));
    const done = results.filter(r => r.south_url || r.error).length;
    console.log(`  progress: ${done}/${results.length} done · elapsed ${((Date.now()-startAll)/1000).toFixed(0)}s`);
  }

  console.log('\n[concurrent] step 3 — 결과 JSON 저장');
  const outDir = join(process.cwd(), 'public', 'dev');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'concurrent-test.json');
  writeFileSync(outFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalElapsedMs: Date.now() - startAll,
    results,
  }, null, 2));
  console.log(`  saved: ${outFile}`);

  const success = results.filter(r => r.south_url).length;
  const failed = results.filter(r => r.error).length;
  console.log(`\n[done] success ${success}/${results.length} · failed ${failed} · pending ${results.length - success - failed}`);
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
