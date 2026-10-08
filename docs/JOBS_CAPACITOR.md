# JOBS — Capacitor 네이티브 래핑 준비 (2차 출시)

PWA(`/jobs/`)를 그대로 스토어 앱으로 감싸는 방식입니다. 이 저장소의 `capacitor.config.ts`는 **원격 URL 모드**(네이티브 셸이 운영 서버의 `/jobs/`를 로드)로 되어 있어, 웹 코드를 고치면 스토어 재심사 없이 바로 반영됩니다. 네이티브 기능(백그라운드 위치 · 푸시 · 잠금화면 알림 액션)은 플러그인으로 붙입니다.

네이티브 빌드는 Android SDK · Xcode가 있는 PC에서 합니다(클라우드 세션에서는 빌드 불가).

## 1. 준비물
| 항목 | 내용 | 비용 · 기간 |
|---|---|---|
| Google Play 개발자 계정 | 조직 계정 권장(사업자) | 1회 $25 · 신원 확인 1~3일 |
| Apple Developer Program | 조직 등록은 D-U-N-S 번호 필요 | 연 $99 · 조직 승인 1~2주 [확인 필요] |
| 앱 아이콘 · 스플래시 | 1024×1024 PNG 1장 → `@capacitor/assets`로 자동 생성 | — |
| 개인정보처리방침 URL | 스토어 필수 | `https://<origin>/jobs/legal/privacy` |
| 위치 사용 사유서 | 백그라운드 위치 사용 시 양쪽 스토어 심사 항목 | 문장 초안 아래 |
| 위치기반서비스사업 신고 | 방송통신위원회 | 앱 설명 · 약관에 신고 번호 표기 |

## 2. 설치 (로컬 PC)
```bash
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npm i @capacitor/geolocation @capacitor/camera @capacitor/push-notifications @capacitor/local-notifications
npx cap add android
npx cap add ios          # macOS + Xcode
npx cap sync
npx cap open android     # Android Studio
npx cap open ios         # Xcode
```
`capacitor.config.ts`의 `server.url`을 운영 도메인(`https://www.frameplus.kr/jobs/` 또는 `https://frameplus-erp.pages.dev/jobs/`)으로 맞춥니다. 개발 중에는 `http://<PC IP>:3000/jobs/` + `cleartext: true`.

## 3. 권한 문구 (스토어 심사용)
- **위치(사용 중)**: "출근 기록 시 현재 위치가 등록된 현장 안인지 확인하고, 현장 사진에 촬영 위치를 남기기 위해 사용합니다."
- **위치(항상 · 백그라운드)** [2차 후반]: "등록된 현장 반경을 벗어나면 퇴근 알림을 보내기 위해 사용합니다. 위치는 앱 밖으로 전송되지 않고 출근 기록에만 저장됩니다."
- **카메라 · 사진**: "현장 사진을 찍어 출근 기록과 청구서에 첨부합니다."
- **알림**: "퇴근 시각, 입금 예정일 3일 전, 입금 예정일 초과를 알립니다."

Android `AndroidManifest.xml`: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `CAMERA`, `POST_NOTIFICATIONS`; 백그라운드 위치는 `ACCESS_BACKGROUND_LOCATION` + 플레이 콘솔 «위치 권한 선언» 영상 제출 [확인 필요].
iOS `Info.plist`: `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSCameraUsageDescription`, `NSPhotoLibraryAddUsageDescription`.

## 4. 웹 ↔ 네이티브 연결 지점 (코드 기준)
| 명세 | 현재(PWA) | 네이티브 추가 |
|---|---|---|
| S-04 GPS 출근 | `navigator.geolocation` 1회 | `@capacitor/geolocation` — 정확도 · 권한 UX 개선 |
| S-05 퇴근 알람(잠금화면 액션) | 홈 «퇴근» 버튼 | `@capacitor/local-notifications` 예약(현장 `clockOutTime`) + 액션 버튼 «퇴근 기록» → `PUT /api/jobs/worklogs/:id {checkOutOnly:true}` |
| 지오펜스 이탈 → 퇴근 알람 앞당기기 | 없음 | `@capacitor-community/background-geolocation` 또는 플랫폼 지오펜스 API [확인 필요] |
| 입금 D-3 · 초과 알림 | 없음 | 서버 크론(`scheduled`) → 푸시(`@capacitor/push-notifications`, FCM/APNs) — 서버에 기기 토큰 저장 테이블 필요 |
| 사진 EXIF | 캔버스 리사이즈(EXIF 소실), 앱 DB에 시각 · 좌표 별도 저장 | `@capacitor/camera`로 원본 EXIF 유지 가능 |

## 5. 출시 순서 (권장)
1. 내부 테스트 트랙(Android) · TestFlight(iOS)로 파일럿 반장 설치 — PWA와 동일 화면
2. 로컬 알림(퇴근 알람) · 푸시 토큰 저장 → D-3 알림
3. 백그라운드 지오펜스 — 심사 부담이 커서 마지막
