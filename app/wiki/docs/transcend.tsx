import type { WikiDocMeta } from '../registry';
import { Note } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'transcend',
  cat: '성장',
  title: '초월',
  summary: '같은 장비를 다시 얻으면 오르는 단계와 보너스.',
  sections: [],
};

export default function Doc() {
  return (
    <>
      <Note>작성 중인 문서다.</Note>
    </>
  );
}
