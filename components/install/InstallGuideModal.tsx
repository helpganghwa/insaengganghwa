'use client';

/** iOS / 안드로이드 수동 설치 안내 모달 — 띠지·설정 버튼 공용. */
export function InstallGuideModal({
  platform,
  onClose,
}: {
  platform: 'ios' | 'android';
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[64] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="m-4 max-w-sm rounded-xl bg-white p-4 text-sm shadow-[0_0_40px_rgba(245,158,11,0.18)] ring-1 ring-amber-700/40 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        {platform === 'android' ? (
          <>
            <h3 className="mb-2 text-base font-semibold">홈 화면에 추가 (Android)</h3>
            <ol className="space-y-2 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
              <li>
                1. Chrome 우측 상단 <strong>⋮ 메뉴</strong> 탭
              </li>
              <li>
                2. <strong>“홈 화면에 추가”</strong>(또는 “앱 설치”) 선택
              </li>
              <li>
                3. <strong>추가/설치</strong> 확인
              </li>
              <li>4. 홈 화면의 인생강화 아이콘으로 실행</li>
            </ol>
            <p className="mt-3 text-[11px] text-zinc-500">
              시크릿 모드에서는 설치가 제한될 수 있어요. 일반 탭에서 시도해 주세요.
            </p>
          </>
        ) : (
          <>
            <h3 className="mb-2 text-base font-semibold">iOS 홈 화면 추가</h3>
            <ol className="space-y-2 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
              <li>
                1. Safari 하단의 <strong>공유 버튼</strong> <span className="font-mono">⎙</span> 탭
              </li>
              <li>
                2. 메뉴에서 <strong>“홈 화면에 추가”</strong> 선택
              </li>
              <li>
                3. 이름 확인 후 우상단 <strong>추가</strong> 탭
              </li>
              <li>4. 홈 화면에서 인생강화 아이콘으로 실행</li>
            </ol>
            <p className="mt-3 text-[11px] text-zinc-500">
              iOS에서는 보안 정책상 버튼으로 자동 설치가 불가능합니다.
            </p>
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          확인
        </button>
      </div>
    </div>
  );
}
