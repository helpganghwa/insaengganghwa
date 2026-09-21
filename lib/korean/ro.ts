/**
 * '(으)로' 고르기 — 닉네임·서버 이름처럼 실행 시점에 정해지는 말 뒤에 붙일 때 쓴다.
 * 받침이 없거나 **ㄹ받침**이면 '로'(나무로·서울로), 그 밖의 받침이면 '으로'(치즈스틱으로).
 * 숫자는 발음 기준(0 영·3 삼·6 육만 '으로', 1 일·7 칠·8 팔은 ㄹ받침이라 '로'),
 * 로마자는 근사다 — 대문자로 끝나면 약어로 보고 **글자 이름**으로 읽는다(CBT 씨비티·SEB 에스이비 = '로',
 * M 엠·N 엔만 '으로'). 소문자로 끝나면 낱말로 보고 표기 관례를 따른다(b·c·d·g·k·m·n·p·t 끝 = '으로',
 * l과 모음 등 = '로'). 판정할 수 없는 끝 글자(기호 등)는 '로'.
 */
export function roJosa(word: string): '으로' | '로' {
  const ch = word.trim().slice(-1);
  if (!ch) return '로';
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 || jong === 8 ? '로' : '으로'; // 8 = ㄹ
  }
  if (/[0-9]/.test(ch)) return '036'.includes(ch) ? '으로' : '로';
  if (/[A-Z]/.test(ch)) return ch === 'M' || ch === 'N' ? '으로' : '로';
  if (/[a-z]/.test(ch)) return /[bcdgkmnpt]/.test(ch) ? '으로' : '로';
  return '로';
}
