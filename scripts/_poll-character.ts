// 폴링 — 이미 큐에 있는 character_id 의 결과 받기.
// 사용: bun run scripts/_poll-character.ts <character_id>

import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });

const KEY = process.env.PIXELLAB_API_KEY!;
const CHAR_ID = process.argv[2];
if (!CHAR_ID) {
  console.error('usage: bun run scripts/_poll-character.ts <character_id>');
  process.exit(1);
}

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
      if (obj.error) throw new Error(`MCP error: ${JSON.stringify(obj.error)}`);
      return obj.result;
    }
  }
  throw new Error('no data line');
}

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await call('tools/call', { name, arguments: args });
  if (result?.content) {
    for (const c of result.content) {
      if (c.type === 'text') return c.text as string;
    }
  }
  return JSON.stringify(result);
}

function extractUrls(text: string): string[] {
  const m = text.match(/https?:\/\/[^\s)\]"<>,]+/g);
  return m ?? [];
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const MAX_MS = 30 * 60_000;
const start = Date.now();
while (Date.now() - start < MAX_MS) {
  const text = await callTool('get_character', { character_id: CHAR_ID });
  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(`[${elapsed}s]`);
  console.log(text.slice(0, 1500));
  console.log('---');

  // 다운로드 URL 또는 status 추출
  if (/status:\s*(completed|done|success|ready)/i.test(text)) {
    const urls = extractUrls(text);
    // 이미지 URL 우선 (png/jpg 포함된 첫 URL)
    const imgUrl = urls.find((u) => /\.(png|jpg|webp|gif)/i.test(u)) ?? urls[0];
    if (imgUrl) {
      console.log(`[download] ${imgUrl}`);
      const r = await fetch(imgUrl);
      const buf = Buffer.from(await r.arrayBuffer());
      const file = join(OUT, `mcp-blacksmith-${CHAR_ID}.png`);
      writeFileSync(file, buf);
      console.log(`✓ saved ${file} (${buf.length}B)`);
    }
    process.exit(0);
  }
  if (/status:\s*(failed|error)/i.test(text)) {
    console.error('failed');
    process.exit(1);
  }
  await sleep(15_000);
}
console.error('timeout');
process.exit(1);
