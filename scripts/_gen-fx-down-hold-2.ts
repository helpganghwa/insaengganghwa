// down·hold 2번째 컨셉 생성 — 랜덤 풀 확장.
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

type Spec = { kind: 'down-2' | 'hold-2'; edit: string };
const STATES: Spec[] = [
  {
    // 무릎 살짝 꿇고 절망 — 슬럼프와 다른 자세
    kind: 'down-2',
    edit:
      'one knee bent down kneeling on the ground with the other leg still standing, ' +
      'both hands resting on the bent knee with head dropped between the arms, ' +
      'eyes closed in defeated exhaustion, mouth slightly open in heavy sigh, ' +
      'plain transparent background, no aura, no shadow, only the character figure',
  },
  {
    // 팔짱 + 턱짚기 — 어깨 으쓱과 다른 어리둥절
    kind: 'hold-2',
    edit:
      'arms crossed in front of the chest with right hand raised to chin, ' +
      'index finger touching chin in thinking gesture, head tilted slightly upward, ' +
      'eyes looking sideways in mild contemplation, mouth in small flat thinking line, ' +
      'plain transparent background, no aura, no shadow, only the character figure',
  },
];

type Job = { kind: string; newId?: string; status: 'queued' | 'done' | 'failed' };
const jobs: Job[] = STATES.map((s) => ({ kind: s.kind, status: 'queued' }));

console.log('[queue] 2 variants');
await Promise.all(
  STATES.map(async (s, i) => {
    try {
      const text = await callTool('create_character_state', {
        character_id: SOURCE_ID,
        edit_description: s.edit,
      });
      const id = extractId(text);
      if (!id) {
        jobs[i]!.status = 'failed';
        return;
      }
      jobs[i]!.newId = id;
      console.log(`[${s.kind}] queued → ${id}`);
    } catch (e) {
      console.error(`[${s.kind}] ${(e as Error).message}`);
      jobs[i]!.status = 'failed';
    }
  }),
);

const start = Date.now();
const MAX_MS = 30 * 60_000;
while (Date.now() - start < MAX_MS) {
  await sleep(30_000);
  const pending = jobs.filter((j) => j.status === 'queued' && j.newId);
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
        j.status = 'failed';
      }
    } catch (e) {
      console.error(`[${j.kind}] ${(e as Error).message}`);
    }
  }
}

const done = jobs.filter((j) => j.status === 'done').length;
console.log(`\n결과: done=${done} / failed=${jobs.length - done}`);
process.exit(done === jobs.length ? 0 : 1);
