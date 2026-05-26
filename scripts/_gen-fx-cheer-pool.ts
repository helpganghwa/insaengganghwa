// success/mega 공통 cheer 풀 — 4개 character_id의 south frame만 다운로드.
// 실행: bun run scripts/_gen-fx-cheer-pool.ts

import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
const KEY = process.env.PIXELLAB_API_KEY!;
const OUT = join(process.cwd(), 'public', 'fx');

const POOL = [
  'b8600e60-c009-43b3-a5ed-d7ee38419083',
  '85cea575-6fe7-4708-b684-565ac3e83501',
  '23ea509d-fc46-4006-b2c9-e9e7c8499e43',
  'a408b9d2-ff25-4b50-a63d-452e4c9f98bc',
];

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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

let ok = 0;
let fail = 0;
for (const [i, id] of POOL.entries()) {
  try {
    const text = await callTool('get_character', { character_id: id });
    const south = text.match(/south:\s*(https?:\/\/\S+)/i);
    if (!south) {
      console.error(`[${id}] no south`);
      fail++;
      continue;
    }
    const r = await fetch(south[1]!);
    const buf = Buffer.from(await r.arrayBuffer());
    const file = join(OUT, `char-cheer-${i + 1}.png`);
    writeFileSync(file, buf);
    console.log(`✓ ${file} (${buf.length}B) ← ${id}`);
    ok++;
  } catch (e) {
    console.error(`[${id}] ${(e as Error).message}`);
    fail++;
  }
}
console.log(`\nok=${ok} / fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
