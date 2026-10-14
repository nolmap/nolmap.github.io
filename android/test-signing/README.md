# 테스트 전용 서명 키

`nolmap-test.jks` 는 **테스트 APK(디버그 빌드) 전용** 키예요. 비밀번호는 `nolmap-test` 로 공개되어 있어요.

- 테스트 APK를 다시 빌드해도 같은 키로 서명돼서, 휴대폰에 **업데이트로 덮어 설치**할 수 있어요.
- 이 키의 SHA-256 지문은 `/.well-known/assetlinks.json` 에 들어 있어서 테스트 앱에서도 주소창이 안 보여요.

⚠️ **플레이스토어에 올릴 앱(release)은 절대 이 키로 서명하지 마세요.**
플레이스토어용 키는 Android Studio의 *Generate Signed App Bundle* 에서 새로 만들고, 저장소 바깥에 따로 보관하세요.
