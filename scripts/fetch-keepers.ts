// keeper 오브젝트 ID 목록을 받아 이미지 저장(/tmp/keep_<short>.png) + description 출력 → 카탈로그 키 매핑용.
// 사용: bun run scripts/fetch-keepers.ts <id> <id> ...
import { writeFileSync } from 'node:fs';
const KEY = process.env.PIXELLAB_API_KEY_2;
const PIX = 'https://api.pixellab.ai/v2';
function pickUrl(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.startsWith('http') ? v : null;
  if (Array.isArray(v)) { for (const x of v) { const u = pickUrl(x); if (u) return u; } return null; }
  if (typeof v === 'object') { for (const x of Object.values(v as Record<string, unknown>)) { const u = pickUrl(x); if (u) return u; } }
  return null;
}
const ids = process.argv.slice(2);
if (!KEY || ids.length === 0) { console.error('need KEY + ids'); process.exit(1); }
for (const id of ids) {
  const g = await fetch(`${PIX}/objects/${id}`, { headers: { authorization: `Bearer ${KEY}` } });
  if (!g.ok) { console.log(`${id}\tHTTP ${g.status}`); continue; }
  const gj = (await g.json()) as Record<string, unknown>;
  const desc = (gj.description ?? gj.caption ?? gj.prompt ?? gj.name ?? '(no desc field)') as string;
  const short = id.slice(0, 8);
  const url = pickUrl(gj.rotation_urls) ?? pickUrl(gj.frame_urls) ?? pickUrl(gj.storage_urls);
  if (url) { writeFileSync(`/tmp/keep_${short}.png`, Buffer.from(await (await fetch(url)).arrayBuffer())); }
  console.log(`${short}\t${typeof desc === 'string' ? desc.slice(0, 160) : JSON.stringify(desc).slice(0, 160)}`);
}
