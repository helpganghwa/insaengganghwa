/**
 * 3차 애니·스토리 검수 — /admin/anim-review.
 * 정적 페이지(public/review-anim3.html)를 iframe으로 감싸 PWA 내에서 열리게 한다.
 * ((admin) 레이아웃이 접근을 게이트하므로 어드민 전용. 정적 HTML은 scripts/build-review-anim3.ts가 생성.)
 */
export const dynamic = 'force-static';

export default function AnimReviewPage() {
  return (
    <div className="h-[calc(100dvh-3rem)] w-full">
      <iframe
        src="/review-anim3.html"
        title="3차 애니·스토리 검수"
        className="h-full w-full border-0"
      />
    </div>
  );
}
