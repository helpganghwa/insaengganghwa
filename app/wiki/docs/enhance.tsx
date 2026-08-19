import type { WikiDocMeta } from '../registry';
import { Note } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'enhance',
  cat: '성장',
  title: '강화',
  summary: '시간이 쌓일수록 오르는 확률과 성공·유지·하락 판정.',
  sections: [],
};

export default function Doc() {
  return (
    <>
      <Note>작성 중인 문서다.</Note>
    </>
  );
}
