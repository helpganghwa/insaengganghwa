package app.ganghwa.game;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.browser.trusted.Token;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.google.androidbrowserhelper.playbilling.provider.MethodData;
import com.google.androidbrowserhelper.playbilling.provider.PaymentResult;
import com.google.androidbrowserhelper.trusted.ChromeOsSupport;
import com.google.androidbrowserhelper.trusted.SharedPreferencesTokenStore;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Chrome의 PAY 요청을 받는 결제 화면(앱 1.0.3, 2026-09-29) — docs/PLAYSTORE.md "결제 귀속 표식".
 *
 * 라이브러리 PaymentActivity(billing 1.2.0)와 같은 규약·동작으로 옮기되 두 가지를 더한다.
 *  1) 결제 귀속 표식 — 웹이 PaymentRequest data에 실은 accountId·orderId를 BillingFlowParams의
 *     obfuscatedAccountId·obfuscatedProfileId로 싣는다. 구글이 구매 조회에 그대로 돌려줘서, 결과가 화면에 돌아오지
 *     못한 결제도 서버가 정확히 어느 주문인지 안다. 라이브러리에는 이걸 넣을 방법이 없다(필드·메서드 전부 private).
 *  2) 되살아남 방지 — 저장 상태로 복원된 인스턴스(Bundle 있음)는 결제를 새로 열지 않고 곧바로 실패로 닫는다.
 *     원래 PAY 요청(웹 결제 요청)은 이미 사라졌으므로, 새로 열면 청구만 되고 결과를 받을 곳이 없다(09-29 사고).
 *     ⚠ 매니페스트에 stateNotNeeded를 켜면 복원 때 Bundle이 null로 와서 이 가드가 무력화된다(금지).
 *
 * 규약(라이브러리와 동일): extras "methodNames"[0] + "methodData" 번들 → JSON {sku, …}. 결과 intent extras
 * "methodName" = https://play.google.com/billing, "details" = PaymentResult JSON({token, purchaseToken} 또는 {error}).
 * 성공 RESULT_OK, 실패 RESULT_CANCELED(웹은 AbortError). 보류 결제도 응답 코드 OK면 토큰을 돌려준다(서버가 보류로 처리).
 * 우리는 일회성 상품만 판다 — 구독 변경(oldSku·purchaseToken·가격 변경 확인)은 받지 않는다.
 */
public class GanghwaPaymentActivity extends Activity implements PurchasesUpdatedListener {
    private static final String TAG = "GanghwaPayment";
    private static final String METHOD_NAME = "https://play.google.com/billing";
    /** 구글 규칙: 표식은 64자 이하. 넘으면 싣지 않는다(결제는 진행 — 서버가 표식 없는 구매로 처리). */
    private static final int MAX_ID_LEN = 64;

    @Nullable private BillingClient mClient;
    private boolean mDone;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (savedInstanceState != null) {
            fail("Restored instance; refusing to start a new billing flow.");
            return;
        }
        ComponentName caller = getCallingActivity();
        if (caller == null) {
            fail("Must be launched with startActivityForResult.");
            return;
        }
        if (!callerAllowed(caller.getPackageName())) {
            fail("Launching app is not verified.");
            return;
        }
        MethodData data = MethodData.fromIntent(getIntent());
        if (data == null) {
            fail("Could not parse product ID.");
            return;
        }
        if (data.isPriceChangeConfirmation || data.oldSku != null || data.purchaseToken != null) {
            fail("Subscription changes are not supported.");
            return;
        }
        JSONObject raw = rawMethodData(getIntent());
        String accountId = idOrNull(raw, "accountId");
        // 구글 규칙: profileId는 accountId와 함께만 쓴다.
        String orderId = accountId == null ? null : idOrNull(raw, "orderId");

        mClient = BillingClient.newBuilder(this)
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build();
        mClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult result) {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    fail("Billing setup failed: " + result);
                    return;
                }
                queryAndLaunch(data.sku, accountId, orderId);
            }

            @Override
            public void onBillingServiceDisconnected() {
                fail("BillingClient disconnected.");
            }
        });
    }

    private void queryAndLaunch(String sku, @Nullable String accountId, @Nullable String orderId) {
        if (mDone || mClient == null) return;
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(
                        QueryProductDetailsParams.Product.newBuilder()
                                .setProductId(sku)
                                .setProductType(BillingClient.ProductType.INAPP)
                                .build()))
                .build();
        mClient.queryProductDetailsAsync(params, (result, detailsResult) -> {
            List<ProductDetails> list = detailsResult == null ? null : detailsResult.getProductDetailsList();
            if (list == null || list.isEmpty()) {
                fail("Play Billing did not find product.");
                return;
            }
            launch(list.get(0), accountId, orderId);
        });
    }

    private void launch(ProductDetails details, @Nullable String accountId, @Nullable String orderId) {
        if (mDone || mClient == null) return;
        List<BillingFlowParams.ProductDetailsParams> products = new ArrayList<>();
        products.add(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details).build());
        BillingFlowParams.Builder builder = BillingFlowParams.newBuilder().setProductDetailsParamsList(products);
        if (accountId != null) builder.setObfuscatedAccountId(accountId);
        if (orderId != null) builder.setObfuscatedProfileId(orderId);
        BillingResult r = mClient.launchBillingFlow(this, builder.build());
        if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            fail("Payment attempt failed (have you already bought the item?).");
        }
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult result, @Nullable List<Purchase> purchases) {
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            fail("Purchase flow ended with result: " + result);
            return;
        }
        String token = purchases == null || purchases.isEmpty() ? "" : purchases.get(0).getPurchaseToken();
        finishWith(PaymentResult.paymentSuccess(token));
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (mClient != null) {
            mClient.endConnection();
            mClient = null;
        }
    }

    /** 라이브러리 PaymentVerifier와 같은 규칙 — 검증된 TWA 제공자(Chrome)만, ChromeOS는 ARC 결제 앱 허용. */
    private boolean callerAllowed(String callingPackage) {
        if (callingPackage == null) return false;
        PackageManager pm = getPackageManager();
        if (ChromeOsSupport.isRunningOnArc(pm) && ChromeOsSupport.ARC_PAYMENT_APP.equals(callingPackage)) return true;
        Token token = new SharedPreferencesTokenStore(this).load();
        if (token == null) {
            Log.w(TAG, "Denied payment as no verified app set.");
            return false;
        }
        if (!token.matches(callingPackage, pm)) {
            Log.w(TAG, "Denied payment to unverified app (" + callingPackage + ").");
            return false;
        }
        return true;
    }

    /** methodNames[0]의 methodData JSON(표식 읽기용). 없거나 깨졌으면 null — 표식 없이 결제한다. */
    @Nullable
    private static JSONObject rawMethodData(Intent intent) {
        try {
            ArrayList<String> names = intent.getStringArrayListExtra("methodNames");
            Bundle bundle = intent.getBundleExtra("methodData");
            if (names == null || names.isEmpty() || bundle == null) return null;
            String json = bundle.getString(names.get(0));
            return TextUtils.isEmpty(json) ? null : new JSONObject(json);
        } catch (Exception e) {
            Log.w(TAG, "methodData unreadable", e);
            return null;
        }
    }

    @Nullable
    private static String idOrNull(@Nullable JSONObject raw, String key) {
        if (raw == null) return null;
        String v = raw.optString(key, "");
        return v.isEmpty() || v.length() > MAX_ID_LEN ? null : v;
    }

    private void fail(String message) {
        finishWith(PaymentResult.failure(message));
    }

    private void finishWith(PaymentResult result) {
        if (mDone) return;
        mDone = true;
        result.log();
        Intent intent = new Intent();
        intent.putExtra("methodName", METHOD_NAME);
        intent.putExtra("details", result.getDetails());
        setResult(result.getActivityResult(), intent);
        finish();
    }
}
