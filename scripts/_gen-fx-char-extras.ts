// 추가 캐릭터 자산 — base + success/mega 랜덤 변형.
// 1) base: 40ce2048 소스 캐릭터의 south frame 그대로 (state 생성 X, 다운로드만)
// 2) success-2: 다른 success 자세 (랜덤 풀)
// 3) success-mega-2: 다른 mega 환호 (랜덤 풀)
//
// 실행: bun run scripts/_gen-fx-char-extras.ts

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

// ─ 1) BASE — source 캐릭터 south frame 다운로드만 (state 생성 X) ─
console.log('[base] downloading source south frame');
const baseText = await callTool('get_character', { character_id: SOURCE_ID });
const baseSouth = baseText.match(/south:\s*(https?:\/\/\S+)/i);
if (!baseSouth) {
  console.error('source character has no south URL');
  process.exit(1);
}
{
  const r = await fetch(baseSouth[1]!);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(join(OUT, 'char-base.png'), buf);
  console.log(`✓ char-base.png (${buf.length}B)`);
}

// ─ 2,3) 랜덤 변형 2개 큐잉 ─
type StateSpec = { kind: 'success-2' | 'success-mega-2'; edit: string };
const STATES: StateSpec[] = [
  {
    kind: 'success-2',
    edit:
      'both hands clapping together at chest level with happy clapping motion, ' +
      'big closed-eye happy smile with curved arched eyebrows of joy, ' +
      'small star sparkle near the head, pleased excited mood, ' +
      'slight playful head tilt to one side, cheerful celebrating gesture',
  },
  {
    kind: 'success-mega-2',
    edit:
      'right hand raised high making a peace V-sign two finger gesture above the head, ' +
      'other arm bent at side, mouth wide open in joyous shout, ' +
      'eyes sparkling bright with stars in them, head tilted up looking skyward, ' +
      'small golden rays around the head, epic triumphant victory pose',
  },
];

type Job = { kind: string; newId?: string; status: 'queuing' | 'queued' | 'done' | 'failed' };
const jobs: Job[] = STATES.map((s) => ({ kind: s.kind, status: 'queuing' }));

console.log('\n[queue] 2 variants 큐잉');
await Promise.all(
  STATES.map(async (s, i) => {
    try {
      const text = await callTool('create_character_state', {
        character_id: SOURCE_ID,
        edit_description: s.edit,
      });
      const id = extractId(text);
      if (!id) {
        console.error(`[${s.kind}] no id`);
        jobs[i]!.status = 'failed';
        return;
      }
      jobs[i]!.newId = id;
      jobs[i]!.status = 'queued';
      console.log(`[${s.kind}] queued → ${id}`);
    } catch (e) {
      console.error(`[${s.kind}] queue failed: ${(e as Error).message}`);
      jobs[i]!.status = 'failed';
    }
  }),
);

const queued = jobs.filter((j) => j.status === 'queued');
if (queued.length === 0) {
  console.error('큐잉 0건');
  process.exit(1);
}
console.log(`[polling] ${queued.length}건 30s 간격, 최대 30분`);

const start = Date.now();
const MAX_MS = 30 * 60_000;
while (Date.now() - start < MAX_MS) {
  await sleep(30_000);
  const pending = jobs.filter((j) => j.status === 'queued');
  if (pending.length === 0) break;
  for (const j of pending) {
    try {
      const text = await callTool('get_character', { character_id: j.newId! });
      const elapsed = Math.round((Date.now() - start) / 1000);
      const st = text.match(/status:\s*(\w+)/i)?.[1] ?? 'unknown';
      console.log(`[${elapsed}s][${j.kind}] ${st}`);
      if (/status:\s*(completed|done|success|ready)/i.test(text)) {
        const south = text.match(/south:\s*(https?:\/\/\S+)/i);
        if (south) {
          const r = await fetch(south[1]!);
          const buf = Buffer.from(await r.arrayBuffer());
          const file = join(OUT, `char-${j.kind}.png`);
          writeFileSync(file, buf);
          console.log(`  ✓ ${file} (${buf.length}B)`);
          j.status = 'done';
        } else {
          j.status = 'failed';
        }
      } else if (/status:\s*(failed|error)/i.test(text)) {
        console.error(`  [${j.kind}] failed`);
        j.status = 'failed';
      }
    } catch (e) {
      console.error(`[${j.kind}] poll error: ${(e as Error).message}`);
    }
  }
}

const done = jobs.filter((j) => j.status === 'done').length;
const failed = jobs.filter((j) => j.status === 'failed').length;
console.log(`\n결과: done=${done} / failed=${failed}`);
process.exit(failed === 0 ? 0 : 1);
