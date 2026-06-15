import { assetUrl } from '@/lib/asset-versions';

/**
 * 단계 개방 안개 지도 — 잠긴 지역이 있으면 구름 덮인 지도 일러스트로 통째 교체.
 *
 * 런타임 마스크 합성(SVG 홀)은 그려진 구름을 반투명하게 뚫어 경계가 인위적 —
 * 개방 단계별로 구름 가장자리까지 그려진 정적 일러스트를 쓴다(개간지 둘레로
 * 구름이 자연스럽게 말려 들어감). 개방 순서는 고정(왕국→오크→늪→화산→신전→부유섬,
 * SERVER.md §7)이라 "개방 지역 수 = 단계" 하나로 식별 가능.
 *
 * 단계 에셋은 생성 완료분만 등록 — 미등록 단계(아직 안 그림)는 원본 지도 폴백
 * (잠긴 구역은 노드·간선이 숨겨져 기능상 안전, 시각 차폐만 없음).
 */
const FOG_STAGE_SRC: Record<number, string> = {
  1: '/sprites/guild/worldmap-fog-stage1.webp', // 왕국만 개방
  2: '/sprites/guild/worldmap-fog-stage2.webp', // +오크 부락
  3: '/sprites/guild/worldmap-fog-stage3.webp', // +슬라임 늪
};

export function fogMapSrc(
  zones: { region: string; locked: boolean }[],
  originalSrc: string,
): string {
  if (!zones.some((z) => z.locked)) return originalSrc;
  const unlocked = new Set(zones.filter((z) => !z.locked).map((z) => z.region)).size;
  const fog = FOG_STAGE_SRC[unlocked];
  return fog ? assetUrl(fog) : originalSrc;
}
