import { PATRON_MILESTONES, formatKrwMan } from '@/lib/game/patron/milestones';

import type { WikiDocMeta } from '../registry';
import { fmtInt } from '../fmt';
import { H2, LI, Note, Tbl, UL } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'patron',
  cat: '계정',
  title: '후원 감사 보급',
  summary: '누적 결제 구간마다 오는 감사 우편의 구간과 보상.',
  sections: [
    { id: 'bands', label: '구간과 보상' },
    { id: 'rules', label: '규칙' },
  ],
};

/** 연속 구간을 (단위·보상)이 같은 묶음으로 접는다 — 표가 41행이 아니라 3행이 된다. */
function bandRows(): { range: string; step: string; reward: string; count: number }[] {
  const rows: { from: number; to: number; step: number; diamond: number; boxes: number; count: number }[] = [];
  let prev = 0;
  for (const m of PATRON_MILESTONES) {
    const step = m.krw - prev;
    const last = rows[rows.length - 1];
    if (last && last.step === step && last.diamond === m.diamond && last.boxes === m.boxes) {
      last.to = m.krw;
      last.count += 1;
    } else {
      rows.push({ from: m.krw, to: m.krw, step, diamond: m.diamond, boxes: m.boxes, count: 1 });
    }
    prev = m.krw;
  }
  return rows.map((r) => ({
    range: r.from === r.to ? `${formatKrwMan(r.from)}원` : `${formatKrwMan(r.from)}~${formatKrwMan(r.to)}원`,
    step: `${formatKrwMan(r.step)}원마다`,
    reward: `💎${fmtInt(r.diamond)} + 📦${fmtInt(r.boxes)}`,
    count: r.count,
  }));
}

export default function Body() {
  const rows = bandRows();
  const total = PATRON_MILESTONES.reduce((a, m) => ({ d: a.d + m.diamond, b: a.b + m.boxes }), { d: 0, b: 0 });
  const titled = PATRON_MILESTONES.filter((m) => m.titleLabel);
  return (
    <>
      <H2 id="bands">구간과 보상</H2>
      <UL>
        <LI>누적 결제 금액이 구간에 도달할 때마다 감사 우편이 한 통씩 온다. 여러 구간을 한 번에 넘으면 구간마다 따로 온다.</LI>
        <LI>
          구간은 모두 {fmtInt(PATRON_MILESTONES.length)}개이고, {formatKrwMan(PATRON_MILESTONES[PATRON_MILESTONES.length - 1]!.krw)}
          원까지 모두 받으면 💎{fmtInt(total.d)}과 📦{fmtInt(total.b)}이 된다.
        </LI>
      </UL>
      <Tbl head={['누적 금액', '간격', '구간마다 받는 보상', '구간 수']} rows={rows.map((r) => [r.range, r.step, r.reward, fmtInt(r.count)])} />
      <Note>
        후원 칭호가 걸린 구간({titled.map((m) => `${formatKrwMan(m.krw)}원 ${m.titleLabel}`).join(' · ')})은 같은 우편에 칭호
        안내가 함께 실린다.
      </Note>

      <H2 id="rules">규칙</H2>
      <UL>
        <LI>누적 금액은 실제 결제된 금액 기준이며 환불된 결제는 빠진다.</LI>
        <LI>보상은 우편함에서 받기를 눌러 받는다. 우편은 30일 뒤 사라지므로 그 안에 받아야 한다.</LI>
        <LI>구간별 보상은 경제 밸런스에 따라 늘거나 줄 수 있다. 늘어나면 이미 결제한 사람에게도 차액을 소급해 지급하고, 줄어들어도 이미 받은 보상은 회수하지 않는다.</LI>
        <LI>구간이 더 잘게 나뉘는 조정이 있을 때는 같은 금액까지 결제했을 때의 누적 총액이 이전과 같도록 맞춘다.</LI>
      </UL>
    </>
  );
}
