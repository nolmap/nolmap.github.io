# 놀맵 iOS 앱

놀맵 사이트(https://nolmap.github.io)를 아이폰 앱 화면 전체에 띄우는 Swift 프로젝트예요 (WKWebView).
사이트·관리자 페이지에서 고친 내용은 앱에도 바로 반영돼요.

| 항목 | 값 |
|---|---|
| 번들 ID | `kr.or.playguro.nolmap` (안드로이드와 같음) |
| 앱 이름 | 놀맵 |
| 최소 iOS | 15.0 |
| 시작 주소 | `https://nolmap.github.io/?source=ios` |

## 앱에서 따로 해 주는 것

- 놀맵 안의 이동은 앱 안에서, **다른 사이트 링크는 사파리 창**으로 열어요.
- **전화·메일 링크**는 아이폰 전화·메일 앱으로 열어요.
- 인터넷이 끊기면 앱 자체의 **"연결 없음" 화면과 다시 시도 버튼**을 보여줘요.
- 페이지 알림창(alert/confirm)을 아이폰 기본 알림창으로 보여줘요.
- 시작 화면(로고), 앱 아이콘, 위치 권한 안내 문구가 들어 있어요.

## 맥에서 열기

```bash
brew install xcodegen      # 처음 한 번
cd ios
xcodegen generate          # NolMap.xcodeproj 생성
open NolMap.xcodeproj
```

또는 GitHub의 `ios-build` 브랜치에 자동으로 만들어진 `NolMap.xcodeproj.zip` 을 받아 `ios` 폴더에 풀어도 돼요.

1. Xcode에서 **NolMap 타깃 → Signing & Capabilities → Team** 에 애플 개발자 계정을 고르세요.
2. 위쪽에서 아이폰 시뮬레이터나 연결한 아이폰을 고르고 ▶ 실행.

## 앱스토어에 올리기

1. [Apple Developer Program](https://developer.apple.com/programs/) 가입 (유료, 매년). 놀구로 이름의 **조직**으로 가입하면 D-U-N-S 번호가 필요해요.
2. [App Store Connect](https://appstoreconnect.apple.com) 에서 새 앱 만들기 → 번들 ID `kr.or.playguro.nolmap`.
3. Xcode에서 **Product → Archive → Distribute App → App Store Connect** 로 업로드.
4. 먼저 **TestFlight** 로 아이폰에서 테스트한 뒤 심사 제출.

새 버전을 올릴 때마다 `project.yml` 의 `CURRENT_PROJECT_VERSION` 을 1씩 올려 주세요.

### 심사 준비물

| 항목 | 준비된 것 |
|---|---|
| 앱 아이콘 1024 | 프로젝트에 포함 (`Assets.xcassets/AppIcon`) |
| 개인정보처리방침 URL | `https://nolmap.github.io/privacy.html` |
| 스크린샷 | 시뮬레이터에서 캡처 (6.9인치·6.5인치 등) |
| 개인정보 라벨 | 위치(길찾기에만, 저장 안 함), 문의 시 이름·연락처(선택) |
| 수출 규정 | 일반 HTTPS만 사용 → `ITSAppUsesNonExemptEncryption = NO` 이미 설정 |

> ⚠️ 애플은 "웹사이트를 그대로 감싼 앱"을 **심사 지침 4.2(최소 기능)** 로 거절하는 경우가 많아요.
> 거절되면 알림(푸시), 오프라인 지도, 공유 같은 앱 전용 기능을 더 넣어서 다시 제출해야 할 수 있어요.
