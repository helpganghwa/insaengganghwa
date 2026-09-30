'use client';

import { useState } from 'react';

import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { ModalShell } from '@/components/ModalShell';
import type { TowerSkill } from '@/lib/game/tower/battle';
import { TOWER_SKILL_INFO, towerFloorInfo } from '@/lib/game/tower/floors';

/**
 * 층 몬스터 스킬 라벨 — 무대 이름 아래·목록 층 카드에 붙는다. 누르면 그 층 스킬 설명 팝업(공통 틀).
 * 스킬 하나면 '🛡 강철 피부', 둘 이상이면 아이콘만 이어 쓴다(자리가 좁다). 스킬 없는 층은 수문장이면 '수문장', 아니면 빈칸.
 */
export function TowerSkillTags({ floor, className = '' }: { floor: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const info = towerFloorInfo(floor);
  const sk = info.skills;
  if (!sk.length) return info.guardian ? <span className={`text-zinc-300 ${className}`}>수문장</span> : null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`스킬: ${sk.map((s) => TOWER_SKILL_INFO[s].name).join(', ')}`}
        className={`inline-flex max-w-full items-center gap-0.5 truncate rounded bg-black/45 px-1 font-bold text-rose-200 ${className}`}
      >
        {sk.length === 1 ? `${TOWER_SKILL_INFO[sk[0]!].icon} ${TOWER_SKILL_INFO[sk[0]!].name}` : sk.map((s) => TOWER_SKILL_INFO[s].icon).join('')}
        <span className="font-normal text-zinc-400">›</span>
      </button>
      {open ? <TowerSkillSheet floor={floor} skills={sk} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function TowerSkillSheet({ floor, skills, onClose }: { floor: number; skills: TowerSkill[]; onClose: () => void }) {
  const info = towerFloorInfo(floor);
  return (
    <ModalShell onClose={onClose} label={`${info.name} 스킬`}>
      <ModalLayout
        title={info.name}
        subtitle={`${floor}층${info.guardian ? ' · 수문장' : ''} · 스킬 ${skills.length}개`}
        bodyPad="sm"
        footer={<ModalButton tone="neutral" onClick={onClose}>닫기</ModalButton>}
      >
        <ul className="flex flex-col gap-2">
          {skills.map((s) => (
            <li key={s} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
              <b className="block text-[13px] text-rose-200">
                {TOWER_SKILL_INFO[s].icon} {TOWER_SKILL_INFO[s].name}
              </b>
              <span className="text-[11.5px] leading-snug break-keep text-zinc-300">{TOWER_SKILL_INFO[s].desc}</span>
            </li>
          ))}
        </ul>
      </ModalLayout>
    </ModalShell>
  );
}
