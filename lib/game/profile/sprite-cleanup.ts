import 'server-only';

import sharp from 'sharp';

/**
 * 캐릭터 외곽/공중 픽셀 노이즈 제거 — 두 단계:
 *
 *  1) 흰점 노이즈 — "흰색인데 주변에 흰색이 적고(고립) 배경(투명) 인접" 픽셀만 투명화.
 *     - 흰 옷/금속(주변도 흰색)·눈 하이라이트(투명 이웃 없음)는 보존.
 *
 *  2) 분리 픽셀 덩어리 — alpha 채널 8-connectivity components 분석 후 가장 큰
 *     컴포넌트(=캐릭터 본체) 외에 BLOB_SIZE_MAX 미만의 작은 덩어리는 통째 제거.
 *     pixellab가 가끔 머리 위·옆 공중에 작은 픽셀 덩어리(예: 16x38, ~300px)를
 *     뱉는 케이스를 처리. 큰 분리 부속(BLOB_SIZE_MAX 이상)은 정상 부속으로 간주해 보존.
 */
const ALPHA_ON = 40;
const WHITE = 200;
const MAX_BRIGHT_NEIGHBORS = 3;
const BLOB_ALPHA_THRESHOLD = 16;
const BLOB_SIZE_MAX = 500;
/**
 * 분리 덩어리 제거 상대 임계 — 본체(최대 컴포넌트) 크기 대비 이 비율 미만이면 제거.
 * 절대값(BLOB_SIZE_MAX)만으로는 큰 캐릭터의 떠있는 결함(예: 751px 해골·519px 검 =
 * 본체 ~7,900px의 7~10%)이 500을 넘겨 빠져나감. 비율을 더해 캐릭터 크기에 강건하게.
 * 단 이 비율 이상 큰 분리 부속(망토·대형 무기)은 의도된 것으로 보존.
 */
const BLOB_REL_MAX = 0.12;

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
    const main = components[0]!;
    // 절대(BLOB_SIZE_MAX) + 상대(본체 대비 BLOB_REL_MAX) 중 큰 값 미만이면 제거.
    const sizeLimit = Math.max(BLOB_SIZE_MAX, Math.floor(main.size * BLOB_REL_MAX));
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
