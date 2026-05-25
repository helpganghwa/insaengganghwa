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

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await call('tools/call', { name, arguments: args });
  if (result?.content) {
    for (const c of result.content) {
      if (c.type === 'text') return c.text as string;
    }
  }
  return JSON.stringify(result);
}

function extractId(text: string): string | null {
  // 'id: <uuid>' 패턴 우선
  const m = text.match(/(?:^|\n)\s*id:\s*([0-9a-f-]{36})/i);
  return m?.[1] ?? null;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// 인생강화 공식 마스코트(2026-05-25) — 직업 무관 영웅형 모험가.
// 레퍼런스 결: 픽셀법사키우기 / 메이플스토리 캐릭터 일러스트 픽셀화.
// 3~3.5등신, 풍성한 머리카락, 큰 눈, 그라데이션 채색, 진한 빨강-갈색 outline.
const DESCRIPTION =
  'official mascot character of Korean idle RPG game 인생강화 — ' +
  'a young adventurer hero standing centered front-facing T-pose full body, ' +
  // 비례 — chibi 아님, 슬림 3등신
  'slim stylized proportions about 3 heads tall (NOT chibi NOT super deformed), ' +
  // 얼굴
  'large detailed expressive eyes with multiple highlights, small button nose, gentle confident smile, ' +
  'warm cream skin with soft cheek shading, ' +
  // 머리 — 풍부함 강조
  'short tousled warm brown hair with golden tips, wind-blown wavy strands, detailed hair flow, ' +
  // 의상 — 다중 톤 + 그라데이션
  'wearing a cream sleeveless tunic with rolled cloth collar, ' +
  'brown leather harness with iron buckle across chest, ' +
  'dark forest green hooded cloak with subtle gradient draped over shoulders flowing softly behind, ' +
  'small dark leather gloves, sturdy short brown boots with metal toe caps, ' +
  // 소품 — 망치(인생강화 시그니처)
  'holding a small iron forge hammer at right side (small square iron head, short wooden handle), ' +
  // 포즈·정서
  'calm proud heroic stance, slight smile, slight hip tilt for charm, ' +
  // 스타일·결
  'JRPG anime illustration pixel art style, ' +
  'reference style: 픽셀법사키우기 mobile game character, MapleStory NPC illustration, ' +
  'Korean mobile pixel RPG character portrait, ' +
  'crisp 1-pixel dark red-brown outline rim around silhouette, ' +
  'soft gradient cel shading on hair and fabric (multiple tone steps, NOT flat), ' +
  'warm multi-tone palette: cream, brown, forest green, amber gold, soft charcoal accents, ' +
  // 배경
  'pure white background, character only, no scenery, no UI elements, no text';

async function main() {
  console.log('[create_character] queuing...');
  const createdText = await callTool('create_character', {
    description: DESCRIPTION,
    name: 'Insaeng-Mascot',
    body_type: 'humanoid',
    mode: 'pro',                                       // AI reference 기반 고품질
    proportions: '{"type":"preset","name":"stylized"}', // chibi 아닌 슬림 3등신
    size: 128,
    view: 'low top-down',
    outline: 'single color outline',                   // 검정 대신 컬러 outline(빨강-갈색)
    shading: 'medium shading',
    detail: 'high detail',
  });
  console.log('[create_character] response:\n', createdText.slice(0, 600));

  const charId = extractId(createdText);
  if (!charId) {
    console.error('character_id 못 찾음');
    process.exit(1);
  }
  console.log(`[create_character] queued id=${charId}, polling...`);

  // 폴링 — pro mode는 2~5분. 매 15초 체크, 최대 10분.
  const start = Date.now();
  const MAX_MS = 30 * 60_000;
  while (Date.now() - start < MAX_MS) {
    await sleep(15_000);
    const text = await callTool('get_character', { character_id: charId });
    const elapsed = Math.round((Date.now() - start) / 1000);
    const statusM = text.match(/status:\s*(\w+)/i);
    const status = statusM?.[1] ?? 'unknown';
    console.log(`[poll ${elapsed}s] ${status}`);
    if (/status:\s*(completed|done|success|ready)/i.test(text)) {
      // south(정면) URL 추출
      const south = text.match(/south:\s*(https?:\/\/\S+)/i);
      if (south) {
        const img = await fetch(south[1]!);
        const buf = Buffer.from(await img.arrayBuffer());
        const file = join(OUT, `mcp-mascot-${charId}-south.png`);
        writeFileSync(file, buf);
        console.log(`✓ saved ${file} (${buf.length}B)`);
        console.log(`id: ${charId} — full text:\n${text.slice(0, 1500)}`);
      }
      return;
    }
    if (/status:\s*(failed|error)/i.test(text)) {
      console.error('[poll] failed:', text);
      process.exit(1);
    }
  }
  console.error('[poll] timeout (10min)');
  process.exit(1);
}

await main();
