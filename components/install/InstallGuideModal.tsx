'use client';

import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';

/** iOS / 안드로이드 수동 설치 안내 모달 — 띠지·설정 버튼 공용. */
export function InstallGuideModal({
  platform,
  onClose,
}: {
  platform: 'ios' | 'android';
  onClose: () => void;
}) {
  return (
    <ModalShell onClose={onClose} onSubmit={onClose} label="앱 설치 안내">
      <ModalLayout
        title="홈 화면에 추가"
        subtitle={platform === 'android' ? 'Android · Chrome' : 'iOS · Safari'}
        maxBodyClass="max-h-[56vh]"
        footer={
          <ModalButton tone="contrast" onClick={onClose}>
            확인
          </ModalButton>
        }
      >
      <div>
        {platform === 'android' ? (
          <>
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
            <ol className="space-y-2 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
              <li>
                1. 화면 하단 오른쪽 <strong>⋯</strong> 버튼 탭
              </li>
              <li>
                2. <strong>공유</strong> 선택
              </li>
              <li>
                3. 목록을 아래로 내려 <strong>“홈 화면에 추가”</strong> 선택
              </li>
              <li>4. 홈 화면에서 인생강화 아이콘으로 실행</li>
            </ol>
            <p className="mt-3 text-[11px] text-zinc-500">
              iOS에서는 보안 정책상 버튼으로 자동 설치가 불가능합니다.
            </p>
          </>
        )}
      </div>
      </ModalLayout>
    </ModalShell>
  );
}
