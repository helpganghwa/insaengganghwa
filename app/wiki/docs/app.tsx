import type { WikiDocMeta } from '../registry';
import { DocLink, H2, LI, UL } from '../ui';

/**
 * 앱(Google Play · App Store) 안내 — docs/APPSTORE.md §3.6 · PLAYSTORE.md.
 * 스토어 출시와 함께 노출된다. 결제·환불 경로는 스토어마다 달라 여기서 한 번에 정리한다.
 */
export const meta: WikiDocMeta = {
  slug: 'app',
  cat: '시작',
  title: '앱으로 즐기기',
  summary: '스토어 앱 설치, 같은 계정으로 이어하기, 앱 결제와 환불.',
  sections: [
    { id: 'install', label: '설치' },
    { id: 'account', label: '계정' },
    { id: 'payment', label: '결제와 환불' },
    { id: 'push', label: '알림' },
    { id: 'faq', label: '자주 묻는 질문' },
  ],
};

export default function Doc() {
  return (
    <>
      <H2 id="install">설치</H2>
      <UL>
        <LI>Google Play와 App Store에서 &ldquo;인생강화&rdquo;를 검색해 설치한다. 브라우저(ganghwa.app)와 홈 화면 추가(PWA)도 그대로 쓸 수 있다.</LI>
        <LI>앱과 웹은 같은 서버, 같은 캐릭터다. 어느 쪽에서 플레이해도 진행은 하나로 이어진다.</LI>
      </UL>

      <H2 id="account">계정</H2>
      <UL>
        <LI>로그인 수단은 카카오와 Apple이다. 웹에서 쓰던 계정으로 앱에서 로그인하면 그대로 이어진다.</LI>
        <LI>
          Apple 로그인은 카카오 계정과 <b>이메일이 같으면</b> 같은 계정으로 연결된다. Apple의 &ldquo;이메일 숨기기&rdquo;를 고르면
          이메일이 달라져 새 계정이 만들어지니, 기존 캐릭터를 이어 하려면 숨기기 없이 로그인한다.
        </LI>
        <LI>계정 탈퇴는 설정에서 할 수 있고, 앱과 웹 어느 쪽에서 해도 같은 계정이 지워진다.</LI>
      </UL>

      <H2 id="payment">결제와 환불</H2>
      <UL>
        <LI>
          상품과 가격은 웹·Google Play·App Store 모두 같다(<DocLink slug="shop" hash="charge">상점</DocLink>). 앱에서는 스토어 결제(Google Play 결제 ·
          App 내 구입)로 진행되고, 웹에서는 카드·간편결제로 진행된다.
        </LI>
        <LI>결제 내역과 영수증은 결제한 곳에서 확인한다. 앱 결제는 Google Play 주문 내역 · Apple 구입 내역, 웹 결제는 결제창에 적은 이메일로 온 매출전표.</LI>
        <LI>
          환불도 결제한 곳의 정책을 따른다. Google Play는 Play 스토어 주문 내역에서, App Store는 Apple에 환불을 요청한다(reportaproblem.apple.com).
          웹 결제는 고객센터로 문의한다.
        </LI>
        <LI>환불이 확정되면 그 결제로 받은 다이아·상자는 회수되고, 이미 쓴 만큼은 부족분으로 남는다.</LI>
        <LI>미성년자의 월 결제 한도와 본인인증은 앱·웹 모두 같은 기준이 적용된다.</LI>
      </UL>

      <H2 id="push">알림</H2>
      <UL>
        <LI>앱은 설정 &gt; 알림 받기를 켜면 강화 완료·레이드·보급·대난투 알림을 앱 알림으로 받는다. iPhone은 홈 화면 추가 없이도 된다.</LI>
        <LI>알림 종류별 켜고 끄기는 웹과 같은 설정 화면에서 한다. 알림을 끈 기기는 다시 켜기 전까지 조용하다.</LI>
      </UL>

      <H2 id="faq">자주 묻는 질문</H2>
      <UL>
        <LI>
          <b>앱과 웹에서 산 다이아가 따로 보이나요?</b> 아니다. 다이아는 계정 하나에 쌓이고 어디서 결제했든 같은 지갑에 들어온다. 다만 환불은 결제한 곳에서만 처리된다.
        </LI>
        <LI>
          <b>앱에서 결제 버튼이 안 눌려요.</b> 스토어 앱을 최신으로 업데이트하고 다시 시도한다. 그래도 안 되면 설정 &gt; 문의하기로 기기와 상황을 알려 달라.
        </LI>
        <LI>
          <b>Apple로 로그인했더니 캐릭터가 없어요.</b> &ldquo;이메일 숨기기&rdquo;로 새 계정이 만들어진 경우다. 로그아웃 후 카카오로 다시 로그인하면 기존 캐릭터가 보인다.
        </LI>
      </UL>
    </>
  );
}
