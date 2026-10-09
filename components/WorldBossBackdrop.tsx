'use client';

import { useEffect, useRef } from 'react';

/**
 * 월드보스 무대 배경 — 정지 배경 + 배경에서 뽑은 불씨 맥동 + 떠오르는 불티(캔버스) + 햇살 깜빡임.
 * 연기·안개 레이어는 어색해 넣지 않는다(2026-10-09 사용자). 움직임 줄이기면 불티를 그리지 않고 CSS도 멈춘다.
 * 배경 그림은 400×240이라 Pixellab 애니 한도(256px)를 넘어 코드로만 움직인다.
 */
export function WorldBossBackdrop({ bgSrc, emberSrc, className = '' }: { bgSrc: string; emberSrc: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    const tick = () => {
      g.clearRect(0, 0, 400, 240);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]!;
        p.x += p.vx + Math.sin((p.life + i * 13) / 30) * 0.15;
        p.y += p.vy;
        p.life++;
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
    tick();
    return () => cancelAnimationFrame(raf);
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
