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
  if (slides.length === 1) return <>{slides[0]}</>;
  return (
    <Swiper
      modules={[Pagination]}
      pagination={{ clickable: true }}
      spaceBetween={12}
      slidesPerView={1}
      className="home-banner-swiper"
    >
      {slides.map((slide, i) => (
        <SwiperSlide key={i}>{slide}</SwiperSlide>
      ))}
    </Swiper>
  );
}
