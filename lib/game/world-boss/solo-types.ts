/** 개인 월드보스(0253) 화면 데이터 — 순수 타입(클라이언트가 import). */
import type { FaceBox } from '@/components/faceCrop';

import type { SoloPower, SoloSlot } from './solo';

export type SoloPiece = { slot: SoloSlot; key: string; name: string; level: number; transcend: number; cp: number; mult: 0 | 1 | 2; score: number; src: string | null };

export type SoloDetail = {
  id: string;
  bossCode: string;
  zoneId: number;
  zoneName: string;
  /** active = 도전 가능 · settling = 시간은 지났고 정산 전 · left = 정산 끝. */
  status: 'active' | 'settling' | 'left';
  leaveAt: string;
  total: number;
  /** 넘긴 페이즈 수 — 화면도 이 수를 그대로 'N페이즈'로 보인다(불사조와 같게). */
  stage: number;
  top: { rank: number; userId: string; nickname: string; best: number; me: boolean; avatar: string | null; faceBox: FaceBox | null; guildName: string | null; guildEmblem: string | null }[];
  pool: Record<SoloSlot, { key: string; name: string; src: string | null; owned: boolean }[]>;
  me: {
    nickname: string;
    faceBox: FaceBox | null;
    guildName: string | null;
    guildEmblem: string | null;
    resident: boolean;
    homeZoneName: string | null;
    best: number | null;
    rank: number | null;
    finalRank: number | null;
    reward: { diamond: number; boxes: number } | null;
    freeLeft: number;
    /** 사 두고 아직 안 쓴 재도전. */
    retryLeft: number;
    retryBought: number;
    /** 다음 재도전 값(대난투 포인트) — 오늘 더 못 사면 null. */
    retryNext: number | null;
    pieces: SoloPiece[];
    power: SoloPower;
    avatarSouth: string | null;
    hasAvatar: boolean;
    ownedRequired: number;
  } | null;
};
