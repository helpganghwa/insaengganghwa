// 강화 FX용 대장장이 캐릭터 4 표정 생성 — Pixellab MCP create_character_state.
// SOURCE = 사용자가 만든 대장장이(40ce2048-edb1-4e30-af6c-352784efa0b1) 베이스.
// 각 state 새 character_id 발급 → polling → south frame 다운로드 → public/fx/char-{kind}.png.
//
// 실행: bun run scripts/_gen-fx-character-states.ts
// pro mode 생성은 state당 5~30분 — 4개 병렬 큐잉 + 30초 간격 polling.

import { config } from 'dotenv';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });

const KEY = process.env.PIXELLAB_API_KEY!;
const SOURCE_ID = '40ce2048-edb1-4e30-af6c-352784efa0b1';
const OUT_DIR = join(process.cwd(), 'public', 'fx');

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type StateSpec = { kind: 'success-mega' | 'success' | 'hold' | 'down'; edit: string };

const STATES: StateSpec[] = [
  {
    kind: 'success-mega',
    edit:
      'BOTH arms raised high above the head in triumphant cheer, fists clenched, ' +
      'big wide open mouth grinning with pure joy and excitement, eyes wide open and bright with sparkle, ' +
      'whole body leaning slightly back from euphoria, ' +
      'celebrating epic success, exhilarated, sparkles around the head',
  },
  {
    kind: 'success',
    edit:
      'right hand raised giving a thumbs up gesture forward toward the viewer, ' +
      'gentle satisfied smile with one eye slightly winking, ' +
      'relaxed confident posture, mild pleased expression, ' +
      'small green sparkle near the thumb',
  },
  {
    kind: 'hold',
    edit:
      'head tilted to one side in mild confusion, ' +
      'shoulders shrugged with palms up at chest level showing both hands open, ' +
      'eyes slightly half-lidded with wry resigned expression, ' +
      'gently puzzled neutral mood, mouth in a small flat line',
  },
  {
    kind: 'down',
    edit:
      'one hand placed flat against forehead in dejected face-palm gesture, ' +
      'shoulders slumped forward, body posture lowered and drooping, ' +
      'eyes closed tightly with sad downturned mouth, deep sigh expression, ' +
      'small gray sweatdrop near the temple, disheartened defeated mood',
  },
];

type Job = {
  kind: string;
  newId?: string;
  status: 'queuing' | 'queued' | 'done' | 'failed';
};

const jobs: Job[] = STATES.map((s) => ({ kind: s.kind, status: 'queuing' }));

// 4개 동시 큐잉 (createCharacterState 자체는 가벼움, 실제 생성은 백엔드 큐).
console.log('[queue] 4 states 동시 큐잉...');
await Promise.all(
  STATES.map(async (s, i) => {
    try {
      const text = await callTool('create_character_state', {
        character_id: SOURCE_ID,
        edit_description: s.edit,
      });
      const id = extractId(text);
      if (!id) {
        console.error(`[${s.kind}] no new id\n${text.slice(0, 300)}`);
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
  console.error('큐잉 0건 — 종료');
  process.exit(1);
}
console.log(`[polling] ${queued.length}건 polling 시작 (30s 간격, 최대 45분)`);

const start = Date.now();
const MAX_MS = 45 * 60_000;

while (Date.now() - start < MAX_MS) {
  await sleep(30_000);
  const pending = jobs.filter((j) => j.status === 'queued');
  if (pending.length === 0) break;

  for (const j of pending) {
    try {
      const text = await callTool('get_character', { character_id: j.newId! });
      const elapsed = Math.round((Date.now() - start) / 1000);
      const statusM = text.match(/status:\s*(\w+)/i);
      const st = statusM?.[1] ?? 'unknown';
      console.log(`[${elapsed}s][${j.kind}] ${st}`);

      if (/status:\s*(completed|done|success|ready)/i.test(text)) {
        const south = text.match(/south:\s*(https?:\/\/\S+)/i);
        if (south) {
          const r = await fetch(south[1]!);
          const buf = Buffer.from(await r.arrayBuffer());
          const file = join(OUT_DIR, `char-${j.kind}.png`);
          writeFileSync(file, buf);
          console.log(`  ✓ ${file} (${buf.length}B)`);
          j.status = 'done';
        } else {
          console.error(`  [${j.kind}] completed but no south URL`);
          j.status = 'failed';
        }
      } else if (/status:\s*(failed|error)/i.test(text)) {
        console.error(`  [${j.kind}] failed`);
        j.status = 'failed';
      }
    } catch (e) {
      console.error(`[${j.kind}] poll error: ${(e as Error).message}`);
      // 일시 오류 — 다음 사이클 재시도
    }
  }
}

const done = jobs.filter((j) => j.status === 'done').length;
const failed = jobs.filter((j) => j.status === 'failed').length;
console.log(`\n결과: done=${done} / failed=${failed} / total=${jobs.length}`);
process.exit(failed === 0 ? 0 : 1);
