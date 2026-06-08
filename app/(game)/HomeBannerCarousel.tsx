'use client';

import { Children, type ReactNode } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination } from 'swiper/modules';

import 'swiper/css';
import 'swiper/css/pagination';

/**
 * 메인 홈 배너 carousel — DailySupplyCard / HubCheckinCard 등을 한 슬롯에 묶음.
 *
 * - 자동 슬라이드 X(사용자 액션 방해 회피). 사용자가 좌우 스와이프할 때만 전환.
 * - 자식 1개면 carousel 미적용(단독 표시) → swiper UI overhead 회피.
 * - children은 RSC 또는 client 자유.
 */
export function HomeBannerCarousel({ children }: { children: ReactNode }) {
  const slides = Children.toArray(children).filter(Boolean);
  if (slides.length === 0) return null;
  // 공통 outer — h-16 + border/rounded. 자식 카드는 frameless(h-full)로 그림만 채움.
  // 슬라이드 콘텐츠만 좌우로 슬라이드하고 outer 테두리는 고정.
  const outerClass =
    'relative h-16 w-full min-w-0 isolate overflow-hidden rounded-xl border border-amber-600/40';
  if (slides.length === 1) {
    return <div className={outerClass}>{slides[0]}</div>;
  }
  return (
    <div className={outerClass}>
      <Swiper
        modules={[Pagination]}
        pagination={{ clickable: true }}
        spaceBetween={0}
        slidesPerView={1}
        className="home-banner-swiper h-full"
      >
        {slides.map((slide, i) => (
          <SwiperSlide key={i} className="h-full">
            {slide}
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
