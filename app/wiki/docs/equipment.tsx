import type { WikiDocMeta } from '../registry';
import { Note } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'equipment',
  cat: '성장',
  title: '장비와 장착',
  summary: '슬롯 구성과 장착 규칙, 보유 장비의 쓰임.',
  sections: [],
};

export default function Doc() {
  return (
    <>
      <Note>작성 중인 문서다.</Note>
    </>
  );
}
