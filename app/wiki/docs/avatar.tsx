import type { WikiDocMeta } from '../registry';
import { Note } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'avatar',
  cat: '계정',
  title: '아바타와 프로필',
  summary: '아바타 생성과 프로필 공개 범위.',
  sections: [],
};

export default function Doc() {
  return (
    <>
      <Note>작성 중인 문서다.</Note>
    </>
  );
}
