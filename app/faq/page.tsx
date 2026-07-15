import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

import { PublicFooter } from '@/components/PublicFooter';

/**
 * 자주 묻는 질문 — 공개 페이지 + FAQPage JSON-LD(SEO 검수 B2, 2026-07-15).
 * 문항은 CBT 실문의·검색 의도 기반. 답변 원칙: 대화체(~요)이되 **첫 문장은 그것만 떼어
 * 읽어도 완결된 답**(답변 엔진 인용 단위). a(JSON-LD용 평문)와 body(링크 포함 렌더)를
 * 분리 — 두 텍스트는 내용 동일해야 함(스키마-화면 불일치는 리치결과 실격 사유).
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: '자주 묻는 질문',
  description:
    '인생강화 FAQ — 게임 소개, 무료 여부, 강화 방법과 실패 규칙, 전투력 계산, 초월, 계정 이전까지 자주 묻는 질문을 모았습니다.',
};

const FAQS: { q: string; a: string; body?: ReactNode }[] = [
  {
    q: '인생강화는 어떤 게임인가요?',
    a: '장비를 강화 슬롯에 올려두면 시간이 흐를수록 성공 확률이 올라가는 방치형 강화 RPG예요. 게임을 켜두지 않아도 진행되니, 일상을 보내다 돌아와 결과를 확인하고 다음 강화를 걸어두면 됩니다. 무기·방어구·장신구를 모아 강화·초월하고, 레이드와 대난투에서 다른 대장장이들과 겨루세요.',
  },
  {
    q: '무료로 즐길 수 있나요?',
    a: '네, 무료로 시작해서 끝까지 무료로 즐길 수 있어요. 유료 재화(다이아)는 강화 대기 시간을 줄이는 편의 위주라, 결제가 승패를 사지 않습니다. 상품 구성과 가격은 상품 안내 페이지에 전부 공개되어 있어요.',
    body: (
      <>
        네, 무료로 시작해서 끝까지 무료로 즐길 수 있어요. 유료 재화(다이아)는 강화 대기 시간을
        줄이는 편의 위주라, 결제가 승패를 사지 않습니다. 상품 구성과 가격은{' '}
        <Link href="/pricing" className="underline">
          상품 안내
        </Link>{' '}
        페이지에 전부 공개되어 있어요.
      </>
    ),
  },
  {
    q: '앱을 설치해야 하나요?',
    a: '아니요, 설치 없이 웹 브라우저에서 바로 플레이할 수 있어요. 홈 화면에 앱으로 추가(PWA)하면 전체 화면과 푸시 알림까지 지원돼서 더 편해집니다.',
  },
  {
    q: '강화는 어떻게 하나요?',
    a: '강화소에서 장비를 슬롯에 올리면, 시간이 흐를수록 성공 확률이 점점 올라가요. 일찍 수령하면 낮은 확률로 도전하고, 끝까지 기다리면 최대 확률로 도전합니다 — 조급함과 기다림 사이의 선택이 인생강화의 핵심 재미예요.',
  },
  {
    q: '강화에 실패하면 장비가 사라지나요?',
    a: '아니요, 장비가 파괴되거나 사라지는 일은 없어요. 강화 결과는 성공·유지·하락 세 가지뿐이고, 단계별 확률은 확률 공시 페이지에 전부 공개되어 있습니다.',
    body: (
      <>
        아니요, 장비가 파괴되거나 사라지는 일은 없어요. 강화 결과는 성공·유지·하락 세 가지뿐이고,
        단계별 확률은{' '}
        <Link href="/probability" className="underline">
          확률 공시
        </Link>{' '}
        페이지에 전부 공개되어 있습니다.
      </>
    ),
  },
  {
    q: '전투력은 어떻게 계산되나요?',
    a: '착용 여부와 상관없이, 보유한 모든 장비의 강화·초월 수치를 합산한 값이에요. 그래서 장착 중인 6개만 키우는 것보다 인벤토리의 장비까지 골고루 강화하는 게 훨씬 유리합니다. 이 전투력이 레이드 데미지, 대난투 승률, 랭킹에 그대로 쓰여요.',
  },
  {
    q: '초월이 뭔가요?',
    a: '같은 장비를 중복으로 얻으면 자동으로 초월돼요. 초월 단계가 오를수록 전투력 보너스가 커지고 장비 테두리가 화려해집니다. 별도 재료나 조작 없이, 보급 상자를 열다 보면 자연히 진행돼요.',
  },
  {
    q: '다른 유저와 함께 즐길 수 있나요?',
    a: '네, 친구를 맺어 레이드를 함께 공략하고, 매일 아침 9시 대난투에서 모든 대장장이가 자동으로 겨뤄요. 길드에 가입하면 기부·점령전 같은 협동 콘텐츠도 열립니다.',
  },
  {
    q: '기기를 바꾸면 데이터가 사라지나요?',
    a: '아니요, 카카오 계정으로 로그인하기 때문에 기기를 바꿔도 같은 계정으로 로그인하면 그대로 이어서 즐길 수 있어요.',
  },
  {
    q: '확률 정보는 어디서 확인하나요?',
    a: '강화·초월·보급의 모든 확률과 수치를 확률 공시 페이지에 상시 공개하고 있어요. 확률이 바뀔 때는 사전 공지 후 반영됩니다.',
    body: (
      <>
        강화·초월·보급의 모든 확률과 수치를{' '}
        <Link href="/probability" className="underline">
          확률 공시
        </Link>{' '}
        페이지에 상시 공개하고 있어요. 확률이 바뀔 때는 사전 공지 후 반영됩니다.
      </>
    ),
  },
  {
    q: '알림은 왜 켜는 게 좋나요?',
    a: '강화가 최대 확률에 도달하는 순간을 알림으로 알려드려요. 시간 기반 게임이라 알림을 켜두면 수령 타이밍을 놓치지 않아서 성장 속도가 눈에 띄게 빨라집니다.',
  },
  {
    q: '버그 제보나 문의는 어디로 하나요?',
    a: '게임 안 프로필 → 고객센터에서 문의를 남길 수 있어요. 버그 제보와 제안 모두 환영하고, 확인 후 답변드립니다.',
  },
];

export default function FaqPage() {
  // FAQPage 구조화 데이터 — 화면 텍스트(a)와 1:1 동일(불일치는 리치결과 실격).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-white text-zinc-900 dark:bg-black dark:text-zinc-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="flex-1 px-4 py-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold">자주 묻는 질문</h1>
          <Link
            href="/"
            className="rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1.5 text-[12px] font-extrabold text-amber-950 active:opacity-90"
          >
            게임 시작 ⚒️
          </Link>
        </div>
        <div className="mt-4 space-y-5">
          {FAQS.map((f) => (
            <section key={f.q}>
              <h2 className="text-[13.5px] font-bold text-amber-700 dark:text-amber-400">
                Q. {f.q}
              </h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                {f.body ?? f.a}
              </p>
            </section>
          ))}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
