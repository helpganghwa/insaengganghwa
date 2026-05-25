// 사용자 마스코트(c9801fb1...)의 새 state 생성 — 보급 주는 자세.
// 사용: bun run scripts/_gen-character-state.ts
// MCP HTTP 직접 호출(create_character_state → 폴링 → 다운로드).

import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });

const KEY = process.env.PIXELLAB_API_KEY!;
const SOURCE_ID = 'c9801fb1-9804-47c1-9a0c-77e7c6f3a6c5';
const OUT = '/tmp/character-prototype';
mkdirSync(OUT, { recursive: true });

const MCP_URL = 'https://api.pixellab.ai/mcp';
const HEADERS = {
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

let nextId = 1;
async function call(method: string, params: Record<string, unknown>) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params });
  const res = await fetch(MCP_URL, { method: 'POST', headers: HEADERS, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      const obj = JSON.parse(line.slice(6));
      if (obj.error) throw new Error(`MCP: ${JSON.stringify(obj.error)}`);
      return obj.result;
    }
  }
  throw new Error('no data');
}

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const r = await call('tools/call', { name, arguments: args });
  if (r?.content) for (const c of r.content) if (c.type === 'text') return c.text as string;
  return JSON.stringify(r);
}

function extractId(text: string): string | null {
  const m = text.match(/(?:^|\n)\s*id:\s*([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const EDIT_DESC =
  'cheerful big bright smile with eyes happily curved, ' +
  'holding a wrapped gift package box with both hands extended forward, ' +
  'presenting and offering the supply package toward the viewer, ' +
  'warm welcoming gesture, joyful expression, ' +
  'small floating sparkle effects around the package';

console.log('[create_character_state] queuing for', SOURCE_ID);
const created = await callTool('create_character_state', {
  character_id: SOURCE_ID,
  edit_description: EDIT_DESC,
});
console.log(created.slice(0, 500));

const newId = extractId(created);
if (!newId) {
  console.error('new character_id 못 찾음');
  process.exit(1);
}
console.log('[polling]', newId);

const start = Date.now();
const MAX_MS = 30 * 60_000;
while (Date.now() - start < MAX_MS) {
  await sleep(15_000);
  const text = await callTool('get_character', { character_id: newId });
  const elapsed = Math.round((Date.now() - start) / 1000);
  const statusM = text.match(/status:\s*(\w+)/i);
  console.log(`[${elapsed}s] ${statusM?.[1] ?? 'unknown'}`);
  if (/status:\s*(completed|done|success|ready)/i.test(text)) {
    const south = text.match(/south:\s*(https?:\/\/\S+)/i);
    if (south) {
      const r = await fetch(south[1]!);
      const buf = Buffer.from(await r.arrayBuffer());
      const file = join(OUT, `mascot-supply-${newId}-south.png`);
      writeFileSync(file, buf);
      console.log(`✓ saved ${file} (${buf.length}B)`);
      console.log(`new id: ${newId}`);
      console.log(`\n${text.slice(0, 1500)}`);
    }
    process.exit(0);
  }
  if (/status:\s*(failed|error)/i.test(text)) {
    console.error('failed:', text);
    process.exit(1);
  }
}
console.error('timeout');
process.exit(1);
