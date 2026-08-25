/**
 * 얼굴 썸네일 소급 생성(2026-08-25) — face-thumb.ts 도입 전에 생성된 커스텀 아바타에
 * face.png를 만들어 storage에 올리고 rotations.face를 채운다. 멱등(이미 face 있으면 skip).
 *
 * 실행: bun run scripts/backfill-face-thumbs.ts [--limit N]         # 스테이징(DATABASE_URL)
 *       bun run scripts/backfill-face-thumbs.ts --prod [--limit N]  # 프로덕션(PROD_DATABASE_URL + PROD_* supabase)
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

config({ path: '.env.local' });

const PROD = process.argv.includes('--prod');
const dbUrl = PROD ? process.env.PROD_DATABASE_URL : process.env.DATABASE_URL;
const supaUrl = PROD ? process.env.PROD_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL;
const supaKey = PROD ? process.env.PROD_SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dbUrl || !supaUrl || !supaKey) throw new Error(`env 누락 (PROD=${PROD})`);

const sql = postgres(dbUrl, { prepare: false, max: 1 });
const supabase = createClient(supaUrl, supaKey);
const BUCKET = 'profiles';
const SIZE = 96;

// face-thumb.ts renderFaceThumb와 동일 산식(스크립트 독립 실행을 위해 복제 — next 앱 import 회피)
async function renderThumb(png: Buffer, box: { cx: number; cy: number; h: number } | null) {
  const meta = await sharp(png).metadata();
  const W = meta.width ?? 256, H = meta.height ?? 256;
  const cx = box?.cx ?? 0.5, cy = box?.cy ?? 0.13, hf = box?.h ?? 0.14;
  const s = Math.min(5, Math.max(2.2, 0.5 / hf));
  const side = Math.max(8, Math.round(Math.min(W, H) / s));
  const left = Math.max(0, Math.min(W - side, Math.round(cx * W - 0.5 * side)));
  const top = Math.max(0, Math.min(H - side, Math.round(cy * H - 0.44 * side)));
  return sharp(png).extract({ left, top, width: side, height: side })
    .resize(SIZE, SIZE, { kernel: 'nearest' }).png().toBuffer();
}

const limitIdx = process.argv.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) || 10 : 100000;
const rows = (await sql`
  select id, rotations->>'south' as south, options->'faceBox' as fb
  from user_profiles
  where rotations->>'south' like 'http%' and rotations->>'face' is null
  order by created_at limit ${limit}`) as unknown as { id: string; south: string; fb: { cx: number; cy: number; h: number } | null }[];
console.log(`대상 ${rows.length}건 (PROD=${PROD})`);

let ok = 0, fail = 0;
for (const r of rows) {
  try {
    const res = await fetch(r.south);
    if (!res.ok) throw new Error(`south fetch ${res.status}`);
    const png = Buffer.from(await res.arrayBuffer());
    const thumb = await renderThumb(png, r.fb);
    // storage 경로 = south와 같은 폴더의 face.png (URL에서 역산)
    const m = r.south.match(/\/object\/public\/profiles\/(.+)\/south\.png/);
    if (!m) throw new Error(`경로 해석 실패: ${r.south}`);
    const fpath = `${m[1]}/face.png`;
    const up = await supabase.storage.from(BUCKET).upload(fpath, thumb, {
      contentType: 'image/png', upsert: true, cacheControl: '604800',
    });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
    const url = supabase.storage.from(BUCKET).getPublicUrl(fpath).data.publicUrl;
    await sql`update user_profiles set rotations = jsonb_set(rotations, '{face}', to_jsonb(${url}::text)) where id = ${r.id}::uuid`;
    ok++;
  } catch (e) {
    fail++;
    console.error('FAIL', r.id, String(e).slice(0, 120));
  }
}
console.log(`완료: ok=${ok} fail=${fail}`);
await sql.end();
