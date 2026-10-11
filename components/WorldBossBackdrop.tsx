'use client';

import { useEffect, useRef } from 'react';

/**
 * 월드보스 무대 배경 — 정지 배경 + 배경에서 뽑은 불씨 맥동 + 떠오르는 불티(캔버스) + 햇살 깜빡임.
 * 연기·안개 레이어는 어색해 넣지 않는다(2026-10-09 사용자). 움직임 줄이기면 불티를 그리지 않고 CSS도 멈춘다.
 * 배경 그림은 400×240이라 Pixellab 애니 한도(256px)를 넘어 코드로만 움직인다.
 */
export function WorldBossBackdrop({ bgSrc, emberSrc, className = '', paused = false }: { bgSrc: string; emberSrc: string; className?: string; /** 위에 재생 무대 같은 다른 층이 덮였을 때 — IntersectionObserver는 가림을 모른다(10-11 재검사). */ paused?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused; // 렌더 중 ref 갱신은 금지(react-hooks/refs) — 효과에서 동기화, 그리기 루프는 0.4초마다 다시 읽는다
  }, [paused]);

  useEffect(() => {
    const c = canvasRef.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; s: number };
    const spawn = (): P => ({ x: Math.random() * 400, y: 240 + Math.random() * 20, vx: (Math.random() - 0.5) * 0.3, vy: -(0.25 + Math.random() * 0.6), life: 0, max: 180 + Math.random() * 200, s: Math.random() < 0.25 ? 2 : 1 });
    const ps: P[] = Array.from({ length: 46 }, () => {
      const p = spawn();
      p.y = Math.random() * 240;
      p.life = Math.random() * p.max;
      return p;
    });
    let raf = 0;
    let visible = true; // 화면 안에 있고 탭이 보일 때만 그린다(10-11 감사: 히어로·팝업·재생 무대가 동시에 돌았다)
    let last = 0;
    let idle = 0;
    const tick = (now: number) => {
      if (!visible || document.hidden) {
        raf = 0;
        return;
      }
      // 팝업 뒤(앱 셸 전체 blur)나 재생 무대 아래에서는 그리지 않는다 — 매 프레임 블러를 다시 계산하던 비용(10-11 재검사). 0.4초마다 다시 본다.
      if (pausedRef.current || document.documentElement.classList.contains('ig-modal-open')) {
        idle = window.setTimeout(() => {
          raf = requestAnimationFrame(tick);
        }, 400);
        return;
      }
      if (now - last < 33) {
        raf = requestAnimationFrame(tick); // 30fps면 충분한 불티
        return;
      }
      const k = last ? Math.min(3, (now - last) / 16.7) : 1; // 60Hz 한 프레임 기준 경과 비율 — 프레임을 줄여도 속도는 그대로(10-11 재검사)
      last = now;
      g.clearRect(0, 0, 400, 240);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]!;
        p.x += (p.vx + Math.sin((p.life + i * 13) / 30) * 0.15) * k;
        p.y += p.vy * k;
        p.life += k;
        if (p.life > p.max || p.y < -4) {
          ps[i] = spawn();
          continue;
        }
        const a = Math.sin((Math.PI * p.life) / p.max);
        g.fillStyle = `rgba(255,${140 + ((i * 37) % 80)},60,${a.toFixed(2)})`;
        g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf === 0 && visible && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) start();
    });
    io.observe(c);
    const onVis = () => start();
    document.addEventListener('visibilitychange', onVis);
    start();
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(idle);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bgSrc} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={emberSrc} alt="" className="wbb-ember absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
      <div className="wbb-shaft absolute inset-0" />
      <canvas ref={canvasRef} width={400} height={240} className="absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
    </div>
  );
}
