import { describe, expect, it } from 'vitest';

import { faceBoxFromPoints } from '@/lib/game/profile/ai-review';

// 검수 이미지 = 트림 → 768 정사각 contain. 원본 256×256에서 (64,0)부터 128×256을 트림했다고 가정하면
// contain 배율 3, 가로 여백 192px — 검수 이미지 u=0.5는 원본 x=128(0.5)로 돌아와야 한다.
const g = { W: 256, H: 256, trimL: 64, trimT: 0, tw: 128, th: 256 };

describe('faceBoxFromPoints — 얼굴 기준점 → 원본 크롭 박스(10-05)', () => {
  it('트림·여백을 되돌리고 7차 교정 규칙으로 계산한다', () => {
    const b = faceBoxFromPoints({ eyeL: [0.47, 0.2], eyeR: [0.53, 0.2], hairTop: 0.12, chin: 0.26 }, g)!;
    expect(b.cx).toBeCloseTo(0.5, 3);
    expect(b.h).toBeCloseTo(0.14, 3);
    // cy = 눈높이 0.2 − 0.16/(0.5/0.14)
    expect(b.cy).toBeCloseTo(0.2 - 0.16 / (0.5 / 0.14), 3);
  });
  it('머리 높이는 0.11~0.2로 제한한다(장식 아래 두피·포니테일 끝 오독)', () => {
    expect(faceBoxFromPoints({ eyeL: [0.45, 0.3], eyeR: [0.55, 0.3], hairTop: 0.05, chin: 0.4 }, g)!.h).toBe(0.2);
    expect(faceBoxFromPoints({ eyeL: [0.45, 0.2], eyeR: [0.55, 0.2], hairTop: 0.18, chin: 0.22 }, g)!.h).toBe(0.11);
  });
  it('눈이 턱 아래거나 이미지 밖이면 null(종전 방식으로)', () => {
    expect(faceBoxFromPoints({ eyeL: [0.45, 0.3], eyeR: [0.55, 0.3], hairTop: 0.1, chin: 0.2 }, g)).toBeNull();
    // 트림이 원본 왼쪽 끝에서 시작했으면 검수 이미지의 왼쪽 여백은 원본 밖이다.
    expect(faceBoxFromPoints({ eyeL: [0.02, 0.2], eyeR: [0.05, 0.2], hairTop: 0.1, chin: 0.3 }, { ...g, trimL: 0 })).toBeNull();
  });
});
