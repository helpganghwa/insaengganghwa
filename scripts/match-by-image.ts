// 이미지 해시로 3차 61종 ↔ key2 객체 매칭 (저장 PNG = 객체 이미지).
// 1) 전체 객체 목록(id, preview_url) → 2) preview 다운로드 후 32x32 gray raw 해시
// 3) 우리 61 PNG도 동일 해시 → 4) SAD 최소 객체 매칭. 출력 scripts/obj-map.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const TOK = process.env.PIXELLAB_API_KEY_2!;
const PIX = 'https://api.pixellab.ai/v2';
const ROOT = process.cwd();
const HS = 32; // hash grid

async function hashBuf(buf: Buffer): Promise<Uint8Array> {
  // 투명 배경 → 흰색 평탄화 후 grayscale 32x32 raw
  return new Uint8Array(await sharp(buf).flatten({ background: '#ffffff' }).grayscale().resize(HS, HS, { fit: 'fill' }).raw().toBuffer());
}
function sad(a: Uint8Array, b: Uint8Array): number { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; }

async function fetchList(): Promise<{ id: string; preview_url: string }[]> {
  const all: { id: string; preview_url: string }[] = [];
  let offset = 0; const limit = 50; let total = Infinity;
  while (offset < total) {
    const r = await fetch(`${PIX}/objects?limit=${limit}&offset=${offset}`, { headers: { authorization: `Bearer ${TOK}` } });
    const j = await r.json() as { objects: { id: string; preview_url: string; status: string }[]; total: number };
    total = j.total;
    for (const o of j.objects) if (o.status === 'completed' && o.preview_url) all.push({ id: o.id, preview_url: o.preview_url });
    offset += limit;
  }
  return all;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch { out[k] = null as R; } } }));
  return out;
}

(async () => {
  const objs = await fetchList();
  console.error(`객체 ${objs.length}개 해시 계산...`);
  const cacheP = join('/tmp', 'obj-hashes.json');
  const cache: Record<string, number[]> = existsSync(cacheP) ? JSON.parse(readFileSync(cacheP, 'utf8')) : {};
  let done = 0;
  await pool(objs, 10, async (o) => {
    if (cache[o.id]) { done++; return; }
    const r = await fetch(o.preview_url); const h = await hashBuf(Buffer.from(await r.arrayBuffer()));
    cache[o.id] = Array.from(h); done++;
    if (done % 30 === 0) process.stderr.write(`\r  ${done}/${objs.length}`);
  });
  process.stderr.write('\n');
  writeFileSync(cacheP, JSON.stringify(cache));

  const sel = JSON.parse(readFileSync(join(ROOT, 'scripts/final-sel.json'), 'utf8')) as Record<string, string[]>;
  const ids: string[] = [];
  for (const slot of ['weapon', 'armor', 'accessory']) for (const uid of sel[slot] ?? []) if (uid.startsWith('v3:')) ids.push(uid.slice(3));

  const objHashes = objs.filter((o) => cache[o.id]).map((o) => ({ id: o.id, h: Uint8Array.from(cache[o.id]) }));
  const map: Record<string, string> = {};
  const report: { pool: string; obj: string; dist: number; second: number }[] = [];
  for (const pid of ids) {
    const png = join(ROOT, 'public/sprites/pool', `${pid}.png`);
    const ph = await hashBuf(readFileSync(png));
    let best = { id: '', d: Infinity }, second = Infinity;
    for (const o of objHashes) { const d = sad(ph, o.h); if (d < best.d) { second = best.d; best = { id: o.id, d }; } else if (d < second) second = d; }
    map[pid] = best.id;
    report.push({ pool: pid, obj: best.id, dist: best.d, second });
  }
  writeFileSync(join(ROOT, 'scripts/obj-map.json'), JSON.stringify(map, null, 1));
  report.sort((a, b) => b.dist - a.dist);
  console.log('매칭 완료 61/61. 거리 높은(불확실) 상위 12:');
  for (const r of report.slice(0, 12)) console.log(`  dist ${String(r.dist).padStart(6)} (2nd ${r.second})  ${r.pool}  → ${r.obj.slice(0, 8)}`);
  const dups = Object.values(map).filter((v, i, a) => a.indexOf(v) !== i);
  console.log('\n중복 매칭(같은 객체에 2개 이상):', dups.length ? [...new Set(dups)].map((d) => d.slice(0, 8)) : '없음');
})();
