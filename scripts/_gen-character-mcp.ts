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

// 인생강화 공식 마스코트 v2(2026-05-25) — 일본 애니메이션 풍 픽셀 일러스트.
// 레퍼런스(엘프·검사·모험가): 6~7등신 슬림 어른 비례, anime 일러스트의 픽셀화,
// 풍성한 그라데이션 머리, 큰 anime 눈, 빨강-갈색 outline, gradient cel shading.
const DESCRIPTION =
  'anime JRPG illustration pixel art of a full body fantasy adventurer hero character, ' +
  // 비례 — 어른 슬림 6.5~7등신
  '7-heads-tall slim adult proportions, long legs and slim torso, ' +
  'NOT chibi NOT super deformed NOT cute baby proportions, ' +
  // 포즈
  'standing centered front-facing T-pose, slight relaxed hip stance, ' +
  // 얼굴 — anime 결
  'detailed anime style face: large expressive eyes with multiple shining highlights, ' +
  'small refined nose, small detailed mouth, calm confident expression, soft cheek blush, ' +
  // 머리카락 — 풍성·바람결·그라데이션 (레퍼런스 핵심)
  'voluminous flowing detailed hair with multiple gradient color tones, ' +
  'wind-blown wavy strands cascading down past shoulders, ' +
  'medium-length warm chestnut brown hair with golden amber highlights and darker root shadow, ' +
  // 의상 — 디테일 풍부, 다중 톤
  'wearing a cream high-collared sleeveless tunic with subtle gradient shading, ' +
  'brown leather harness straps with iron buckles crossing the chest, ' +
  'dark forest green hooded long cloak with gradient shading flowing behind from one shoulder, ' +
  'fingerless leather gloves, ' +
  'fitted dark green pants with cloth wrap detail, ' +
  'sturdy laced brown leather boots with metal eyelets, ' +
  'small leather belt pouch on hip, ' +
  // 소품 — 작은 망치(인생강화 시그니처)
  'right hand holding a small ornate iron forge hammer with detailed wooden handle, ' +
  // 결·스타일 (가장 중요)
  'high quality anime illustration pixel art style, ' +
  'reference look: detailed 2D RPG character illustration converted to pixel art, ' +
  'crisp dark reddish-brown outline rim around silhouette (NOT pure black outline), ' +
  'rich gradient cel shading with 3-4 tone steps on hair fabric and skin (NOT flat shading), ' +
  'detailed individual pixels visible but with smooth color transitions, ' +
  // 팔레트
  'warm multi-tone palette: cream skin, chestnut brown, amber gold, forest green, ' +
  'iron grey accents, soft cream highlights, dark reddish-brown shadows, ' +
  // 배경
  'pure white background, character only, no scenery, no UI elements, no text, no border';

async function main() {
  console.log('[create_character] queuing...');
  const createdText = await callTool('create_character', {
    description: DESCRIPTION,
    name: 'Insaeng-Mascot-V2',
    body_type: 'humanoid',
    mode: 'pro',
    // 6.5~7등신 슬림 어른 비례 — custom으로 강제(preset stylized 3등신 폐기)
    proportions:
      '{"type":"custom","head_size":0.85,"arms_length":1.3,"legs_length":1.6,"shoulder_width":0.8,"hip_width":0.7}',
    size: 128,
    view: 'side',                                      // 정면 캐릭터 view (low top-down 아님)
    outline: 'single color outline',                   // 빨강-갈색 rim
    shading: 'detailed shading',                       // gradient cel 강화
    detail: 'high detail',
    text_guidance_scale: 9,                            // prompt 충실도 약간 ↑
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
        const file = join(OUT, `mcp-mascot-v2-${charId}-south.png`);
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
