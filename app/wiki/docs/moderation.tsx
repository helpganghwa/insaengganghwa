import type { WikiDocMeta } from '../registry';
import { Note } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'moderation',
  cat: '사회',
  title: '신고와 제재',
  summary: '신고 사유와 처리 절차, 제재 단계.',
  sections: [],
};

export default function Doc() {
  return (
    <>
      <Note>작성 중인 문서다.</Note>
    </>
  );
}
