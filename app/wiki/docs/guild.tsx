import type { WikiDocMeta } from '../registry';
import { Note } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'guild',
  cat: '길드',
  title: '길드 기본',
  summary: '가입과 탈퇴, 기부, 길드가 주는 것.',
  sections: [],
};

export default function Doc() {
  return (
    <>
      <Note>작성 중인 문서다.</Note>
    </>
  );
}
