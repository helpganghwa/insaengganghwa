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

// 마스코트 v3(2026-05-25) — 일본 anime/manga 결 강화 + 대장장이 완전 제거.
// 레퍼런스: 엘프(녹색드레스)·검사(빨강머리)·모험가(금발) — Japanese anime/JRPG illustration의
// 픽셀 변환. doll-like 얼굴, ahoge, gradient 머리, pastel jewel 팔레트.
const DESCRIPTION =
  // 스타일 첫 토큰 — Japanese anime 강조
  'beautiful Japanese anime manga style pixel art character illustration, ' +
  'detailed JRPG game character portrait converted to pixel art, ' +
  // 캐릭터 정체성 — 대장장이 X, 우아한 모험가
  'an elegant young fantasy adventurer character, gender-neutral bishōnen/bishōjo, ' +
  'full body standing pose centered front-facing T-pose, ' +
  // 비례 — 슬림 어른 7등신
  'slim 7-heads-tall adult anatomy with long legs and slim torso, ' +
  'NOT chibi NOT super deformed NOT cute baby NOT short proportions, ' +
  // 얼굴 — doll-like anime 핵심
  'delicate doll-like anime face: large round expressive doe eyes with multiple bright shining highlights and detailed eyelashes, ' +
  'small refined button nose, small petal-pink lips with very subtle gentle smile, ' +
  'pale porcelain skin with soft pink cheek blush, ' +
  // 머리카락 — 풍성·바람결·그라데이션·ahoge
  'voluminous long flowing hair cascading past shoulders with rich smooth gradient color, ' +
  'warm chestnut brown to golden amber tips with darker root shadow, ' +
  'individual wind-swept wavy hair strands visible, single ahoge antenna strand on top of head, ' +
  // 의상 — 우아한 판타지, 무기 없음
  'wearing elegant fantasy adventurer outfit: ' +
  'cream sleeveless high-collared turtleneck top with subtle gold trim and gradient shading, ' +
  'brown leather corset belt with iron buckle wrapping the waist, ' +
  'deep forest green long hooded cape with gradient fading to teal at edges flowing behind from shoulders, ' +
  'fitted dark teal pants with leather wraps at knees, ' +
  'knee-high laced brown leather boots with metal eyelets, ' +
  'small leather satchel pouch on hip, delicate gold pendant necklace, ' +
  // 손·자세 — 무기/도구 절대 없음
  'both hands relaxed empty at sides (NO weapons NO hammer NO sword NO staff NO bow NO tools NO items in hands), ' +
  'graceful calm confident heroic stance, ' +
  // 결 (가장 중요)
  'high quality Japanese anime illustration art style with painterly soft details, ' +
  'rich gradient cel shading with 4 tone steps per area on hair fabric and skin (NOT flat shading), ' +
  'crisp dark reddish-brown outline rim around silhouette (NOT black outline NOT cartoon outline), ' +
  'subtle anti-aliasing pixels for smooth color transitions, ' +
  'detailed individual pixels visible with delicate manga-like rendering, ' +
  // 팔레트
  'warm Japanese RPG art palette: cream beige, chestnut brown, golden amber, ' +
  'forest green, dark teal, soft petal pink, iron grey accents, ' +
  // 배경
  'pure white background, character only, no scenery, no other characters, no UI, no text';

async function main() {
  console.log('[create_character] queuing...');
  const createdText = await callTool('create_character', {
    description: DESCRIPTION,
    name: 'Insaeng-Mascot-V3',
    body_type: 'humanoid',
    mode: 'pro',
    // 슬림 어른 비례 — head 조금 더 작게(0.8), 다리 더 길게(1.7) → 일본 anime 결
    proportions:
      '{"type":"custom","head_size":0.8,"arms_length":1.3,"legs_length":1.7,"shoulder_width":0.75,"hip_width":0.7}',
    size: 128,
    view: 'side',
    // 'selective outline' — anime 결에 가까움(검정 outline 폐기)
    outline: 'selective outline',
    shading: 'detailed shading',
    detail: 'high detail',
    text_guidance_scale: 10, // prompt 충실도 더 ↑ (스타일 핵심 키워드 살리기)
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
        const file = join(OUT, `mcp-mascot-v3-${charId}-south.png`);
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
