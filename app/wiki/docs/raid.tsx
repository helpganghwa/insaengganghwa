import type { WikiDocMeta } from '../registry';
import { Note } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'raid',
  cat: '경쟁',
  title: '레이드',
  summary: '보스 공략 — 개설·공격 횟수·페이즈·보상.',
  sections: [],
};

export default function Doc() {
  return (
    <>
      <Note>작성 중인 문서다.</Note>
    </>
  );
}
