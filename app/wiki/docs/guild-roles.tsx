import type { WikiDocMeta } from '../registry';
import { Note } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'guild-roles',
  cat: '길드',
  title: '길드 권한',
  summary: '길드장·간부·길드원이 할 수 있는 일.',
  sections: [],
};

export default function Doc() {
  return (
    <>
      <Note>작성 중인 문서다.</Note>
    </>
  );
}
