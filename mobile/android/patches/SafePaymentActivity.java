package app.ganghwa.game;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;

import com.google.androidbrowserhelper.playbilling.provider.PaymentActivity;

/**
 * 결제창 부활 방지(2026-09-29) — Chrome의 PAY 요청을 받는 결제 화면.
 *
 * 라이브러리 PaymentActivity(billing 1.2.0, 업스트림 최신도 동일)는 onCreate에서 savedInstanceState를 보지 않고
 * 매번 새 결제 흐름을 연다. 결제창을 띄운 채 앱을 떠났다가 프로세스가 정리된 뒤 돌아오면 이 화면이 저장 상태로
 * 되살아나 같은 상품의 결제창을 다시 띄웠고, 확인하면 청구되지만 결과를 받을 웹 결제 요청은 이미 사라져
 * 서버 주문과 연결되지 않았다(09-29 68,000원 청구·미지급).
 *
 * 새 PAY 요청은 항상 새 인스턴스(Bundle null)로 오므로, Bundle이 있으면 되살아난 것이다. 이때는 빈 인텐트를 넣어
 * 부모가 결제 연결 없이 곧바로 실패(RESULT_CANCELED)로 닫게 한다. 웹은 이를 취소로 처리한다.
 * ⚠ 매니페스트에 stateNotNeeded를 켜면 복원 때 Bundle이 null로 와서 이 가드가 무력화된다(금지).
 */
public class SafePaymentActivity extends PaymentActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        if (savedInstanceState != null) {
            Log.w("SafePayment", "restored instance; refusing to start a new billing flow");
            setIntent(new Intent());
        }
        super.onCreate(savedInstanceState);
    }
}
