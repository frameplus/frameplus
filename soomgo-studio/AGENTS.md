# soomgo-studio 작업 안내

작업 전에 `HANDOFF.md`를 읽는다. 제품 요구사항, 현재 상태, 코드 구조, 다음 작업이 모두 거기에 있다.

- 이 폴더는 정적 HTML/CSS/JS 프로토타입이다. 빌드 도구와 의존성이 없다.
- 실행: `python3 -m http.server 8811` 후 `http://localhost:8811`
- 검사: `node --check app.js && node --check data.js`
- 이 폴더 밖(ERP: `src/`, `public/`, `migrations/`)은 고치지 않는다.
- 실제 고객 정보, 숨고 계정 정보, API 키를 커밋하지 않는다.
- 사용자 데이터는 `esc()`로 이스케이프한 뒤 템플릿에 넣는다.
- 주홍색(`--accent`)은 사람이 움직여야 하는 일에만 쓴다. 자세한 디자인 기준은 `HANDOFF.md` 5장.
- 화면을 고치면 1440px과 390px 폭에서 6개 화면(`#inbox #categories #assets #connect #company #seller`)을 확인한다.
