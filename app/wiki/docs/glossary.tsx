import type { WikiDocMeta } from '../registry';
import { Note } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'glossary',
  cat: '시작',
  title: '용어 사전',
  summary: '게임과 위키에서 쓰는 말을 한곳에 모았다.',
  sections: [],
};

export default function Doc() {
  return (
    <>
      <Note>작성 중인 문서다.</Note>
    </>
  );
}
