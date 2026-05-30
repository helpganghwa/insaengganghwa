// 기존 user_profiles의 8방향 PNG에 cleanupSprite 일괄 적용.
// 정적(/sprites/default/...): public/ 덮어쓰기.
// 동적(supabase Storage URL): fetch → cleanup → Service role로 재업로드(upsert).
//
// 실행: bun run scripts/_backfill-cleanup-rotations.ts
import { config } from 'dotenv';
import postgres from 'postgres';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { cleanupSprite } from '../lib/game/profile/sprite-cleanup';

config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  process.exit(1);
}

const BUCKET = 'profiles';
const STORAGE_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

const sb = createClient(SUPABASE_URL, SERVICE);
const sql = postgres(process.env.DIRECT_URL ?? process.env.DATABASE_URL!, {
  prepare: false,
  max: 1,
});

const seenStatic = new Set<string>();
const seenDynamic = new Set<string>();
const stats = { static: 0, dynamic: 0, cleaned: 0, dedupe: 0, errors: 0 };

async function processStatic(localPath: string): Promise<string> {
  if (seenStatic.has(localPath)) {
    stats.dedupe++;
    return 'dedupe';
  }
  seenStatic.add(localPath);
  stats.static++;
  const full = join('public', localPath.replace(/^\//, ''));
  const buf = await readFile(full);
  const cleaned = await cleanupSprite(buf);
  if (cleaned === buf) return 'no-change';
  await writeFile(full, cleaned);
  stats.cleaned++;
  return 'cleaned';
}

async function processDynamic(url: string): Promise<string> {
  if (seenDynamic.has(url)) {
    stats.dedupe++;
    return 'dedupe';
  }
  seenDynamic.add(url);
  if (!url.startsWith(STORAGE_PREFIX)) return 'unknown-prefix';
  stats.dynamic++;
  const path = url.slice(STORAGE_PREFIX.length);
  const res = await fetch(url);
  if (!res.ok) {
    stats.errors++;
    return `fetch-fail ${res.status}`;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const cleaned = await cleanupSprite(buf);
  if (cleaned === buf) return 'no-change';
  const { error } = await sb.storage.from(BUCKET).upload(path, cleaned, {
    contentType: 'image/png',
    upsert: true,
  });
  if (error) {
    stats.errors++;
    return `upload-fail ${error.message}`;
  }
  stats.cleaned++;
  return 'cleaned';
}

try {
  const rows = (await sql`
    select id, rotations from public.user_profiles
  `) as unknown as Array<{ id: string; rotations: Record<string, string> }>;
  console.log(`백필 대상: ${rows.length} user_profile rows\n`);
  for (const r of rows) {
    for (const [dir, url] of Object.entries(r.rotations)) {
      const result = url.startsWith('/')
        ? await processStatic(url)
        : await processDynamic(url);
      const short = url.length > 64 ? `${url.slice(0, 64)}...` : url;
      console.log(`  ${r.id.slice(0, 8)} ${dir.padEnd(11)} ${short} → ${result}`);
    }
  }
  console.log('\n=== 합계 ===');
  console.log(stats);
} catch (e) {
  console.error('✗ 실패:', (e as Error).message);
  process.exit(1);
} finally {
  await sql.end();
}
