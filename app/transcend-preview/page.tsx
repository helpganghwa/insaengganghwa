'use client';

import { TranscendSprite } from '@/components/TranscendSprite';

// 초월 시각 시스템 검증 + 글로우/광택/발광 비교.
const ITEMS = [
  { code: 'runescar_warhammer', slot: 'weapon' as const, name: '룬흉터 전쟁망치' },
  { code: 'merchants_scale_pendant', slot: 'accessory' as const, name: '상인의 저울 펜던트' },
];
const W = ITEMS[0];

function Cell({
  label,
  level,
  isChampion,
  championMode,
  highlight,
}: {
  label: string;
  level: number;
  isChampion?: boolean;
  championMode?: 'additive' | 'override';
  highlight?: boolean;
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <TranscendSprite
        code={W.code}
        slot={W.slot}
        level={level}
        isChampion={isChampion}
        championMode={championMode}
        size={132}
      />
      <div style={{ fontSize: 11, color: highlight ? '#ffd98a' : '#9aa', marginTop: 3, fontWeight: highlight ? 700 : 400 }}>
        {label}
      </div>
    </div>
  );
}

export default function TranscendPreview() {
  return (
    <div style={{ background: '#0b0b10', color: '#e6e6ec', minHeight: '100vh', padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: 18 }}>초월 시각 — 정상 진행 / 효과 분해 / 챔피언 모델 비교</h1>

      <h2 style={{ fontSize: 15, color: '#9cc0e6', marginTop: 20 }}>① 정상 진행 +0~+10</h2>
      {ITEMS.map((it) => (
        <div key={it.code} style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: '#889' }}>{it.name}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 4 }}>
            {Array.from({ length: 11 }, (_, lv) => (
              <div key={lv} style={{ textAlign: 'center' }}>
                <TranscendSprite code={it.code} slot={it.slot} level={lv} size={104} />
                <div style={{ fontSize: 10, color: '#9aa', marginTop: 2 }}>+{lv}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <h2 style={{ fontSize: 15, color: '#9cc0e6', marginTop: 26 }}>
        ② 효과 분해 — 글로우(뒤 색 후광) vs 광택(표면 흰빛 스윕) vs 발광(챔피언)
      </h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 6 }}>
        <Cell label="+7 전설 (글로우X·광택X)" level={7} />
        <Cell label="+8 (글로우만 ON)" level={8} />
        <Cell label="+10 (글로우+광택)" level={10} highlight />
        <Cell label="+5 챔피언 (발광만·등급=영웅)" level={5} isChampion highlight />
        <Cell label="+10 챔피언 (글로우+광택+발광 전부)" level={10} isChampion highlight />
      </div>

      <h2 style={{ fontSize: 15, color: '#9cc0e6', marginTop: 26 }}>
        ③ 챔피언 모델 비교 — override(레벨 무관 신화 대체) vs additive(실제 등급 + 발광 추가)
      </h2>
      {[5, 10].map((lv) => (
        <div key={lv} style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, color: '#889' }}>+{lv} 최고 강화자</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: 4 }}>
            <Cell label={`override (+${lv})`} level={lv} isChampion championMode="override" />
            <Cell label={`additive (+${lv}) ★권장`} level={lv} isChampion championMode="additive" highlight />
            <Cell label={`참고: +${lv} 일반(비챔피언)`} level={lv} />
          </div>
        </div>
      ))}
      <p style={{ color: '#9aa', fontSize: 12, marginTop: 18 }}>
        override: 챔피언이면 +5든 +10이든 똑같이 신화 빨강·광택 없음 (레벨 표현 사라짐). additive: 실제 초월 등급
        프레임/글로우/광택은 그대로 두고 발광만 더함 — +5는 영웅+발광, +10은 신화+글로우+광택+발광 전부 중복.
      </p>
    </div>
  );
}
