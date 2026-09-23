/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package app.ganghwa.game;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.widget.ImageView;

import androidx.browser.customtabs.CustomTabsService;

import com.google.androidbrowserhelper.trusted.SessionStore;
import com.google.androidbrowserhelper.trusted.SharedPreferencesTokenStore;
import com.google.androidbrowserhelper.trusted.TwaLauncher;

import java.util.List;



public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    

    

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    /**
     * 스플래시 이미지를 화면에 꽉 채운다(2026-09-14).
     *
     * 상위 구현의 기본값은 CENTER — 이미지를 **원래 크기 그대로 가운데** 놓는다. 그래서 종전엔
     * 512px 정사각 아이콘이 어두운 바탕 한가운데에 네모 경계까지 드러난 채 떠 있었다.
     * CENTER_CROP으로 바꾸면 세로 이미지가 비율을 지키며 화면을 채워, 로그인 배경과 같은
     * 대장간 그림이 그대로 나온다(res/drawable-* 밑 splash.png를 세로 이미지로 둔 이유다).
     */
    @Override
    protected ImageView.ScaleType getSplashImageScaleType() {
        return ImageView.ScaleType.CENTER_CROP;
    }

    /**
     * TWA 제공자를 Chrome으로 고정한다(2026-09-23).
     *
     * 기본 구현은 기기의 기본 브라우저를 우선 고르므로, 삼성 인터넷이 기본인 갤럭시에서는 앱이 삼성 인터넷으로
     * 열렸다. 삼성 인터넷은 TWA는 되지만 Google Play 결제창(PaymentRequest)을 열지 못해 결제가 전부
     * 실패했다(실서버 실패 76회 전부 SamsungBrowser UA, 성공은 Chrome). Chrome이 설치·활성 상태이고 TWA를
     * 지원하면 Chrome으로 띄우고, 아니면 종전처럼 자동 선택에 맡긴다.
     */
    @Override
    protected TwaLauncher createTwaLauncher() {
        String provider = chromeTwaProviderOrNull();
        Log.i("Launcher", provider != null ? "TWA provider = Chrome" : "TWA provider = auto");
        return new TwaLauncher(this, provider, SessionStore.makeSessionId(getTaskId()),
                new SharedPreferencesTokenStore(this));
    }

    private static final String CHROME_PACKAGE = "com.android.chrome";

    /** Chrome이 설치·활성 상태이고 TWA(CustomTabsService + TWA 카테고리)를 제공하면 패키지명, 아니면 null. */
    private String chromeTwaProviderOrNull() {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(CHROME_PACKAGE, 0);
            if (!info.enabled) return null;
            Intent serviceIntent = new Intent(CustomTabsService.ACTION_CUSTOM_TABS_CONNECTION)
                    .addCategory(CustomTabsService.TRUSTED_WEB_ACTIVITY_CATEGORY)
                    .setPackage(CHROME_PACKAGE);
            List<ResolveInfo> services = pm.queryIntentServices(serviceIntent, 0);
            return (services != null && !services.isEmpty()) ? CHROME_PACKAGE : null;
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        } catch (RuntimeException e) {
            Log.w("Launcher", "Chrome TWA check failed", e);
            return null;
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch Url.
        Uri uri = super.getLaunchingUrl();

        

        return uri;
    }
}
