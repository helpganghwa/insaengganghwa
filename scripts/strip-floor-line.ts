// 스프라이트 바닥에 깔린 1px 지면선(그림자) 제거.
//
// Pixellab이 종종 발밑에 본체보다 좌우로 더 넓은 검은 가로줄을 그린다. 아이템은 배경 없이
// 떠 있는 형태로 쓰므로 이 줄은 노이즈다. "가장 아래 줄이 (a) 거의 검고 (b) 위 줄보다
// 눈에 띄게 넓다"는 두 조건을 모두 만족할 때만 지운다 — 신발 밑창 외곽선을 깎지 않기 위함.
//
// 사용: bun run scripts/strip-floor-line.ts <파일…>
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const A = 8; // 알파 임계 — 이 아래는 빈 픽셀로 본다
const DARK = 70; // 지면선으로 인정할 최대 밝기(채널 최댓값)
const WIDER = 1.25; // 위 줄 대비 가로 폭 배수

type Row = { n: number; span: number; dark: number };

function scan(d: Buffer, w: number, y: number): Row {
  let n = 0,
    dark = 0,
    min = w,
    max = -1;
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (d[i + 3] <= A) continue;
    n++;
    if (Math.max(d[i], d[i + 1], d[i + 2]) <= DARK) dark++;
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return { n, span: max < 0 ? 0 : max - min + 1, dark };
}

/** 지면선으로 판정된 줄들을 투명화. 지운 y 목록을 돌려준다. */
export async function stripFloorLine(file: string): Promise<number[]> {
  const img = sharp(file).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  const cleared: number[] = [];
  for (let pass = 0; pass < 2; pass++) {
    let bottom = -1;
    for (let y = h - 1; y >= 0; y--) {
      if (scan(data, w, y).n > 0) {
        bottom = y;
        break;
      }
    }
    if (bottom < 1) break;
    const cur = scan(data, w, bottom);
    const above = scan(data, w, bottom - 1);
    const isFloor = cur.dark / cur.n >= 0.9 && cur.span >= above.span * WIDER;
    if (!isFloor) break;
    for (let x = 0; x < w; x++) data[(bottom * w + x) * 4 + 3] = 0;
    cleared.push(bottom);
  }
  if (cleared.length) {
    const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
    writeFileSync(file, png);
  }
  return cleared;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/strip-floor-line.ts')) {
  const files = process.argv.slice(2);
  for (const f of files) {
    const ys = await stripFloorLine(f);
    console.log(`${ys.length ? '제거 y=' + ys.join(',') : '지면선 없음'}  ${f}`);
  }
}
