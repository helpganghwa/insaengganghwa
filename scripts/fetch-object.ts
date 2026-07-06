// 단발 유틸: 완성된 Pixellab 오브젝트 id의 이미지를 받아 지정 경로에 저장(비교용).
// 사용: bun run scripts/fetch-object.ts <objectId> <outPath>
import { writeFileSync } from 'node:fs';

const KEY = process.env.PIXELLAB_API_KEY_2;
const PIX = 'https://api.pixellab.ai/v2';

function pickUrl(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.startsWith('http') ? v : null;
  if (Array.isArray(v)) {
    for (const x of v) { const u = pickUrl(x); if (u) return u; }
    return null;
  }
  if (typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) { const u = pickUrl(x); if (u) return u; }
  }
  return null;
}

const id = process.argv[2];
const out = process.argv[3];
if (!KEY || !id || !out) { console.error('need KEY/id/out'); process.exit(1); }

const g = await fetch(`${PIX}/objects/${id}`, { headers: { authorization: `Bearer ${KEY}` } });
if (!g.ok) { console.error(`get HTTP ${g.status}`); process.exit(1); }
const gj = (await g.json()) as { status?: string; rotation_urls?: unknown; frame_urls?: unknown; storage_urls?: unknown };
console.log('status:', gj.status);
const url = pickUrl(gj.rotation_urls) ?? pickUrl(gj.frame_urls) ?? pickUrl(gj.storage_urls);
if (!url) { console.error('no image url'); process.exit(1); }
const img = await fetch(url);
const buf = Buffer.from(await img.arrayBuffer());
writeFileSync(out, buf);
console.log('saved', out, buf.length, 'bytes');
