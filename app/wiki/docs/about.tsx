import type { WikiDocMeta } from '../registry';
import { Note } from '../ui';

export const meta: WikiDocMeta = {
  slug: 'about',
  cat: '시작',
  title: '인생강화란',
  summary: '기다릴수록 확률이 오르는 방치형 강화 RPG의 얼개.',
  sections: [],
};

export default function Doc() {
  return (
    <>
      <Note>작성 중인 문서다.</Note>
    </>
  );
}
