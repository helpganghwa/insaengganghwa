// PWA 아이콘·iOS 스플래쉬 생성. icon-512.png를 소스로 리사이즈/합성.
// 실행: bun --conditions=react-server run scripts/_gen-pwa-assets.ts
import sharp from 'sharp';

const SRC = 'public/icons/icon-512.png';

// 1) Next.js convention — app/icon.png(브라우저 favicon)·app/apple-icon.png(iOS).
//    metadata에 명시 없어도 자동 <link rel> 주입됨.
await sharp(SRC).resize(192, 192).png().toFile('app/icon.png');
console.log('✓ app/icon.png 192x192');

await sharp(SRC).resize(180, 180).png().toFile('app/apple-icon.png');
console.log('✓ app/apple-icon.png 180x180');

// 2) iOS 스플래쉬 — iPhone Pro Max 6.7"(1290x2796 portrait) 1종부터 시작.
//    검은 배경(#151518, layout viewport.themeColor) + 가운데 로고 384px.
const BG = { r: 0x15, g: 0x15, b: 0x18, alpha: 1 };
const SPLASH_LOGO = 384;
const logoBuf = await sharp(SRC).resize(SPLASH_LOGO, SPLASH_LOGO).png().toBuffer();

async function makeSplash(width: number, height: number, name: string) {
  await sharp({
    create: { width, height, channels: 4, background: BG },
  })
    .composite([{ input: logoBuf, gravity: 'center' }])
    .png()
    .toFile(`public/icons/${name}`);
  console.log(`✓ public/icons/${name} ${width}x${height}`);
}

// iPhone 14/15 Pro Max (6.7"): 1290x2796.
await makeSplash(1290, 2796, 'splash-1290x2796.png');
// iPhone 14/15 (6.1"): 1179x2556.
await makeSplash(1179, 2556, 'splash-1179x2556.png');
// iPhone 12/13/14 (6.1"): 1170x2532.
await makeSplash(1170, 2532, 'splash-1170x2532.png');
// iPhone 8/SE (4.7"): 750x1334.
await makeSplash(750, 1334, 'splash-750x1334.png');
