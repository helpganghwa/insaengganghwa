import 'server-only';

import sharp from 'sharp';

/**
 * 캐릭터 외곽/공중 픽셀 노이즈 제거 — 두 단계:
 *
 *  1) 흰점 노이즈 — "흰색인데 주변에 흰색이 적고(고립) 배경(투명) 인접" 픽셀만 투명화.
 *     - 흰 옷/금속(주변도 흰색)·눈 하이라이트(투명 이웃 없음)는 보존.
 *
 *  2) 분리 픽셀 잡티 — alpha 8-connectivity components 분석 후 가장 큰 컴포넌트(=본체)
 *     외의 덩어리 중 **아주 작은 잡티(BLOB_SIZE_MAX 미만)만** 제거.
 *     ⚠ 의미 있는 분리 요소(머리 위 천사 후광 링, 끊긴 무기 조각 등)는 보존한다.
 *     - 천사 후광이 잡티로 지워지던 이슈 + 끊긴 무기 조각을 여기서 지우면 검수가 못 잡는
 *       문제 때문에, 임계를 미세 잡티 수준으로 낮추고 상대 비율 임계(BLOB_REL_MAX)는 제거.
 *       끊긴 무기·이상 부속은 지우지 말고 그대로 둬서 AI 검수(ai-review)가 판정하게 한다.
 */
const ALPHA_ON = 40;
const WHITE = 200;
const MAX_BRIGHT_NEIGHBORS = 3;
const BLOB_ALPHA_THRESHOLD = 16;
// 미세 잡티만 제거(안티에일리어싱 점 수준). 후광 링·무기 조각 등 의미있는 분리 요소는 보존.
const BLOB_SIZE_MAX = 30;

export async function cleanupSprite(pngBuf: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(pngBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const isWhite = (i: number) =>
    data[i + 3]! > ALPHA_ON && data[i]! >= WHITE && data[i + 1]! >= WHITE && data[i + 2]! >= WHITE;

  // 1) 흰점 노이즈 제거.
  let changed = false;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!isWhite(i)) continue;
      let bright = 0;
      let transparent = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) {
            transparent++;
            continue;
          }
          const ni = (ny * W + nx) * 4;
          if (data[ni + 3]! <= ALPHA_ON) transparent++;
          else if (isWhite(ni)) bright++;
        }
      }
      if (bright < MAX_BRIGHT_NEIGHBORS && transparent >= 1) {
        data[i + 3] = 0;
        changed = true;
      }
    }
  }

  // 2) 분리 픽셀 덩어리 제거 — main 외에 BLOB_SIZE_MAX 미만 component를 통째 알파 0.
  const visited = new Uint8Array(W * H);
  const components: { size: number; pixels: number[] }[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (visited[idx]) continue;
      if (data[idx * 4 + 3]! < BLOB_ALPHA_THRESHOLD) {
        visited[idx] = 1;
        continue;
      }
      const comp = { size: 0, pixels: [] as number[] };
      const stack = [idx];
      while (stack.length) {
        const j = stack.pop()!;
        if (visited[j]) continue;
        visited[j] = 1;
        if (data[j * 4 + 3]! < BLOB_ALPHA_THRESHOLD) continue;
        comp.size++;
        comp.pixels.push(j);
        const jy = Math.floor(j / W);
        const jx = j - jy * W;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = jx + dx;
            const ny = jy + dy;
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const ni = ny * W + nx;
            if (!visited[ni]) stack.push(ni);
          }
        }
      }
      components.push(comp);
    }
  }
  if (components.length > 1) {
    components.sort((a, b) => b.size - a.size);
    // 미세 잡티(BLOB_SIZE_MAX 미만)만 제거. 후광 링·무기 조각 등은 보존 → 검수로 넘김.
    const sizeLimit = BLOB_SIZE_MAX;
    for (let i = 1; i < components.length; i++) {
      const c = components[i]!;
      if (c.size >= sizeLimit) continue;
      for (const p of c.pixels) data[p * 4 + 3] = 0;
      changed = true;
    }
  }

  if (!changed) return pngBuf;
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}
