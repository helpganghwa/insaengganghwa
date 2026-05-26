// 'down' state 재시도 — face-palm 실패. 더 단순한 슬픔 자세로.
import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });

const KEY = process.env.PIXELLAB_API_KEY!;
const SOURCE_ID = '40ce2048-edb1-4e30-af6c-352784efa0b1';
const OUT = join(process.cwd(), 'public', 'fx');

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
function extractId(text: string): string | null {
  const m = text.match(/(?:^|\n)\s*id:\s*([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 단순 슬픔 자세만 — mood/sweatdrop/aura 등 배경 음영 유발 키워드 모두 제거.
// 1차 재시도(어깨 슬럼프) 결과 캐릭터 외 35% 불투명 영역(배경 음영) 발생 → 재생성.
const EDIT =
  'shoulders slumped forward and lowered, head bowed slightly downward, ' +
  'arms hanging straight down at both sides, ' +
  'eyes closed with sad downturned mouth, calm dejected expression, ' +
  'plain clean transparent background, no aura, no shadow, no sweatdrop, ' +
  'no background mood effects, only the character figure';

console.log('[queue down retry]');
const created = await callTool('create_character_state', {
  character_id: SOURCE_ID,
  edit_description: EDIT,
});
const id = extractId(created);
if (!id) {
  console.error('no id');
  process.exit(1);
}
console.log(`queued: ${id}`);

const start = Date.now();
const MAX_MS = 30 * 60_000;
while (Date.now() - start < MAX_MS) {
  await sleep(30_000);
  const text = await callTool('get_character', { character_id: id });
  const elapsed = Math.round((Date.now() - start) / 1000);
  const st = text.match(/status:\s*(\w+)/i)?.[1] ?? 'unknown';
  console.log(`[${elapsed}s] ${st}`);
  if (/status:\s*(completed|done|success|ready)/i.test(text)) {
    const south = text.match(/south:\s*(https?:\/\/\S+)/i);
    if (south) {
      const r = await fetch(south[1]!);
      const buf = Buffer.from(await r.arrayBuffer());
      const file = join(OUT, 'char-down.png');
      writeFileSync(file, buf);
      console.log(`✓ ${file} (${buf.length}B)`);
      process.exit(0);
    }
    console.error('completed but no south');
    process.exit(1);
  }
  if (/status:\s*(failed|error)/i.test(text)) {
    console.error('failed again');
    process.exit(1);
  }
}
console.error('timeout');
process.exit(1);
