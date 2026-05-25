// Pixellab MCP HTTP 직접 호출 (현재 세션에 MCP tool 미로드 우회).
// create_character → queue character ID → get_character 폴링 → download URL.
//
// 사용: bun run scripts/_gen-character-mcp.ts
// 출력: /tmp/character-prototype/mcp-blacksmith-{character_id}.png
//
// PRO mode: 20-40 generations (시간 2~5분), 8방향, 고품질. 인생강화 anchor 후보.

import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });

const KEY = process.env.PIXELLAB_API_KEY;
if (!KEY) {
  console.error('PIXELLAB_API_KEY 필요');
  process.exit(1);
}

const OUT = '/tmp/character-prototype';
mkdirSync(OUT, { recursive: true });

const MCP_URL = 'https://api.pixellab.ai/mcp';
const HEADERS = {
  'Authorization': `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/event-stream',
};

let nextId = 1;
async function call(method: string, params: Record<string, unknown> = {}) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params });
  const res = await fetch(MCP_URL, { method: 'POST', headers: HEADERS, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  // SSE 응답에서 data: 라인 파싱
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      const obj = JSON.parse(line.slice(6));
      if (obj.error) throw new Error(`MCP error: ${JSON.stringify(obj.error)}`);
      return obj.result;
    }
  }
  throw new Error(`no data in response: ${text.slice(0, 300)}`);
}

async function callTool(name: string, args: Record<string, unknown>) {
  const result = await call('tools/call', { name, arguments: args });
  // result 형태: { content: [{ type: 'text', text: '...' }], ... }
  if (result?.content) {
    for (const c of result.content) {
      if (c.type === 'text') {
        try {
          return JSON.parse(c.text);
        } catch {
          return c.text;
        }
      }
    }
  }
  return result;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const DESCRIPTION =
  '인생강화 game blacksmith mascot character — cute kawaii chibi style, ' +
  'big round head with large expressive eyes and bright highlights, ' +
  'small button nose, soft pink blush cheeks, warm friendly smile, ' +
  'wearing a thick brown leather forge apron with visible iron rivets over a cream linen shirt with rolled-up sleeves, ' +
  'small leather gloves, short sturdy boots, ' +
  'tiny soot smudge on cheek, ' +
  'holding a chunky iron forge hammer at side (clearly recognizable hammer with square iron head and short wooden handle), ' +
  'reference style: Korean mobile pixel game character (픽셀법사키우기 / MapleStory), ' +
  'JRPG illustration pixel art with crisp 1-pixel outlines and gradient shading, ' +
  'palette: warm cream skin, brown leather, peach blush, charcoal accents, soft amber forge glow';

async function main() {
  console.log('[create_character] queuing...');
  const created = (await callTool('create_character', {
    description: DESCRIPTION,
    name: 'Insaeng-Blacksmith-Anchor',
    body_type: 'humanoid',
    mode: 'pro',                      // AI reference 기반 고품질
    proportions: '{"type":"preset","name":"chibi"}',
    size: 128,                        // max — 디테일 최대
    view: 'low top-down',             // 정면 캐릭터 시점 (Stardew/MapleStory 결)
    outline: 'single color black outline',
    shading: 'medium shading',
    detail: 'high detail',
  })) as { character_id?: string; characterId?: string; id?: string; status?: string; [k: string]: unknown };
  console.log('[create_character] response:', JSON.stringify(created, null, 2).slice(0, 600));

  const charId = created.character_id ?? created.characterId ?? created.id;
  if (!charId) {
    console.error('character_id 못 찾음');
    process.exit(1);
  }
  console.log(`[create_character] queued id=${charId}, polling...`);

  // 폴링 — pro mode는 2~5분. 매 15초 체크, 최대 10분.
  const start = Date.now();
  const MAX_MS = 10 * 60_000;
  while (Date.now() - start < MAX_MS) {
    await sleep(15_000);
    const status = await callTool('get_character', { character_id: charId });
    const s = String(status.status ?? status.state ?? 'unknown');
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[poll ${elapsed}s] status=${s}`);
    if (s === 'completed' || s === 'success' || s === 'done' || status.download_url || status.image_url) {
      const url = status.download_url ?? status.image_url ?? status.url;
      console.log('[done] keys:', Object.keys(status));
      console.log(JSON.stringify(status, null, 2).slice(0, 1500));
      if (url) {
        const img = await fetch(url);
        const buf = Buffer.from(await img.arrayBuffer());
        const file = join(OUT, `mcp-blacksmith-${charId}.png`);
        writeFileSync(file, buf);
        console.log(`✓ saved ${file} (${buf.length}B)`);
      }
      return;
    }
    if (s === 'failed' || s === 'error') {
      console.error('[poll] generation failed:', status);
      process.exit(1);
    }
  }
  console.error('[poll] timeout (10min)');
  process.exit(1);
}

await main();
