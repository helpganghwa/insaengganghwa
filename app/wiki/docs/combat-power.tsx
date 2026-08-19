import type { WikiDocMeta } from '../registry';
import { Note } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'combat-power',
  cat: '성장',
  title: '전투력',
  summary: '전투력이 매겨지는 방식과 올리는 길.',
  sections: [],
};

export default function Doc() {
  return (
    <>
      <Note>작성 중인 문서다.</Note>
    </>
  );
}
