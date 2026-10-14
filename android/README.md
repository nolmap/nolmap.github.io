# 놀맵 안드로이드 앱

놀맵 사이트(https://nolmap.github.io)를 앱으로 감싼 프로젝트예요.
구글 공식 방식인 **TWA(신뢰할 수 있는 웹 활동)** 를 써서, 앱을 열면 크롬 엔진으로 놀맵을 전체 화면에 띄워요.
사이트(관리자 페이지 포함)에서 고친 내용은 앱에도 바로 반영돼요. 앱을 다시 올릴 필요는 **앱 이름·아이콘·버전 같은 앱 자체 설정을 바꿀 때만** 있어요.

| 항목 | 값 |
|---|---|
| 패키지 이름 | `kr.or.playguro.nolmap` (출시 후 변경 불가) |
| 앱 이름 | 놀맵 |
| 시작 주소 | `https://nolmap.github.io/?source=app` |
| 최소 안드로이드 | 6.0 (API 23) |
| 대상 SDK | API 36 |

---

## 1. Android Studio에서 열기

1. [Android Studio](https://developer.android.com/studio)를 설치해요.
2. **File → Open** 에서 이 `android` 폴더를 골라요.
3. 처음 열면 Gradle 동기화(Sync)가 몇 분 걸려요.
   - "Android Gradle Plugin을 업그레이드할까요?" 같은 창이 뜨면 **업그레이드해도 괜찮아요.**
   - "SDK 36이 없다"고 하면 안내대로 설치를 눌러요.

## 2. 휴대폰에서 바로 실행해 보기

1. 휴대폰 **설정 → 휴대전화 정보 → 소프트웨어 정보 → 빌드번호**를 7번 눌러 개발자 모드를 켜요.
2. **설정 → 개발자 옵션 → USB 디버깅**을 켜고 컴퓨터에 USB로 연결해요.
3. Android Studio 위쪽에서 휴대폰을 고르고 ▶ (Run)을 눌러요.

> 처음 실행하면 **화면 맨 위에 주소창이 보일 수 있어요.** 아래 3번(사이트와 앱 연결)을 하면 사라져요.
> 휴대폰에 크롬이 꼭 설치·업데이트되어 있어야 해요.

## 3. 사이트와 앱 연결 (주소창 없애기)

앱과 사이트가 같은 주인이라는 걸 증명하려면, 앱 **서명 키의 SHA-256 지문**을
`https://nolmap.github.io/.well-known/assetlinks.json` 에 넣어야 해요. (파일은 이미 만들어 두었고 지문만 비어 있어요.)

지문은 키마다 달라요. 쓰는 키의 지문을 모두 넣으면 돼요.

| 언제 | 어디서 지문을 보나요 |
|---|---|
| Android Studio에서 ▶ 로 테스트할 때 (디버그 키) | 오른쪽 **Gradle** 패널 → `NolMap > Tasks > android > signingReport` 더블클릭 → 아래 Run 창의 `Variant: debug` 의 **SHA-256** |
| 플레이스토어에 올린 뒤 (앱 서명 키) | Play Console → 앱 → **설정 → 앱 서명(App signing)** → "앱 서명 키 인증서"의 **SHA-256** |

지문(`AB:CD:12:...` 형태)을 Claude에게 보내 주면 `assetlinks.json` 에 넣어서 올려 줄게요.
반영 후 앱을 지웠다가 다시 설치하면 주소창이 사라져요.

## 4. 플레이스토어용 파일 만들기 (AAB)

1. **Build → Generate Signed App Bundle / APK** → **Android App Bundle** 선택.
2. **Create new...** 로 업로드 키(keystore)를 새로 만들어요.
   - 저장 위치는 **이 폴더 바깥**(예: 문서 폴더)으로 하세요. 저장소에 올라가면 안 돼요.
   - 비밀번호와 `.jks` 파일은 **꼭 따로 백업**하세요. 잃어버리면 업데이트가 매우 번거로워져요.
3. `release` 를 골라 만들면 `app/release/app-release.aab` 가 생겨요. 이 파일을 Play Console에 올려요.

새 버전을 올릴 때마다 `app/build.gradle.kts` 의 `versionCode` 를 1씩 올려야 해요 (예: 1 → 2).

## 5. Play Console 준비물

| 항목 | 준비된 것 |
|---|---|
| 앱 아이콘 512×512 | `store/icon-512.png` |
| 그래픽 이미지 1024×500 | `store/feature-graphic-1024x500.png` |
| 개인정보처리방침 URL | `https://nolmap.github.io/privacy.html` |
| 휴대전화 스크린샷 2장 이상 | 앱을 실행해서 직접 찍어 주세요 |
| 앱 설명 | 예) "신도림놀구로까지 가는 가장 안전한 길과, 길을 지켜주는 구로엔젤 가게, 동네 명소 삼대발견을 알려주는 지도 앱이에요." |

**데이터 보안(Data safety) 설문**에 참고할 내용:
- **위치:** 길찾기를 누를 때만 현재 위치를 써요. 경로 계산을 위해 좌표가 놀맵 서버(Cloudflare)를 거쳐 카카오 길찾기로 전달되고, 저장하지 않아요.
- **이름·연락처(선택)·문의 내용:** 문의하기를 보낼 때만, 놀구로 메일로 전달돼요.
- 광고 없음, 계정 없음, 다른 앱과 공유 없음.

**계정 종류:** 개인 개발자 계정이면 출시 전에 테스터 12명이 14일 동안 비공개 테스트를 해야 해요. 놀구로 이름의 **조직 계정**이면 이 과정이 없어요.

---

## 폴더 구조

```
android/
├─ app/
│  ├─ build.gradle.kts          ← 버전(versionCode/versionName)은 여기서
│  └─ src/main/
│     ├─ AndroidManifest.xml    ← 시작 주소, 색, 스플래시 설정
│     └─ res/                   ← 아이콘, 앱 이름(values/strings.xml)
├─ store/                       ← 플레이스토어 등록용 이미지
└─ README.md                    ← 이 문서
```
