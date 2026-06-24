```markdown
# Cloudtype Discord.js 봇 배포 가이드

이 문서는 업로드된 티켓봇 프로젝트의 Discord.js 백엔드 부분을 클라우드타이프(Cloudtype)에 배포하고 설정하는 방법을 안내합니다.

## 1. Discord 봇 설정

1.  **Discord 개발자 포털 접속**: [Discord Developer Portal](https://discord.com/developers/applications)에 접속하여 새로운 애플리케이션을 생성하거나 기존 애플리케이션을 선택합니다.
2.  **봇 추가**: 애플리케이션 설정에서 `Bot` 탭으로 이동하여 `Add Bot` 버튼을 클릭합니다.
3.  **토큰 복사**: `Token` 섹션에서 `Reset Token`을 클릭하여 새로운 토큰을 생성하고 복사합니다. **이 토큰은 외부에 노출되지 않도록 주의해야 합니다.**
4.  **권한 설정**: `Privileged Gateway Intents` 섹션에서 `PRESENCE INTENT`, `SERVER MEMBERS INTENT`, `MESSAGE CONTENT INTENT`를 모두 활성화합니다. (이 봇은 `GuildMembers` 인텐트를 사용하여 멤버십을 확인하므로 `SERVER MEMBERS INTENT`가 필수입니다.)
5.  **봇 초대**: `OAuth2` -> `URL Generator` 탭에서 `bot` 스코프를 선택하고, 필요한 권한(예: `Administrator` 또는 `Send Messages`, `Manage Channels`, `Read Message History`, `Use External Emojis` 등)을 선택한 후 생성된 URL을 통해 봇을 서버에 초대합니다.

## 2. 클라우드타이프(Cloudtype) 프로젝트 설정

1.  **새 서비스 생성**: 클라우드타이프 대시보드에서 새로운 서비스를 생성합니다. `Node.js` 런타임을 선택합니다.
2.  **Git 저장소 연결**: 이 Discord.js 봇 코드가 있는 Git 저장소를 연결합니다. (아직 Git에 올리지 않았다면, 이 `cloudtype-discord-bot` 폴더를 Git 저장소로 만들고 푸시해야 합니다.)
3.  **환경 변수 설정**: 서비스 설정에서 `환경 변수` 섹션으로 이동하여 다음 환경 변수를 추가합니다.
    *   `DISCORD_BOT_TOKEN`: 1단계에서 복사한 Discord 봇 토큰을 여기에 붙여넣습니다.
    *   `PORT`: `3000` (봇 서버가 3000번 포트에서 실행되도록 설정되어 있습니다.)
4.  **빌드 및 배포**: 설정을 저장하고 서비스를 배포합니다. 클라우드타이프가 자동으로 Node.js 애플리케이션을 빌드하고 실행할 것입니다.
5.  **서비스 도메인 확인**: 배포가 완료되면 클라우드타이프에서 할당된 서비스 도메인(URL)을 확인합니다. 이 URL은 다음 단계에서 프론트엔드 `ticket.js` 파일에 설정해야 합니다.

## 3. 프론트엔드 `ticket.js` 파일 수정

기존 티켓봇 프론트엔드 코드(`ticket.js`)에서 Discord.js 백엔드 서버의 URL을 클라우드타이프에 배포된 봇의 URL로 업데이트해야 합니다.

1.  **`ticket.js` 파일 열기**: 원본 티켓봇 프로젝트의 `ticket.js` 파일을 텍스트 편집기로 엽니다.
2.  **`BOT_SERVER_URL` 업데이트**: 파일 내에서 `BOT_SERVER_URL` 변수를 찾아 클라우드타이프에서 할당받은 봇 서버의 도메인으로 변경합니다.

    ```javascript
    // ticket.js (예시)
    const BOT_SERVER_URL = 'https://your-cloudtype-bot-domain.cloudtype.app'; // 클라우드타이프 봇 서버 URL로 변경
    ```

    *   `http://localhost:3000` 대신 클라우드타이프에서 제공하는 `https://your-cloudtype-bot-domain.cloudtype.app` 형식의 URL을 사용해야 합니다.

3.  **프론트엔드 재배포**: `ticket.js` 파일을 수정한 후, 프론트엔드 프로젝트를 다시 배포하여 변경 사항을 적용합니다.

## 4. 봇 코드 (`index.js`) 상세

제공된 `index.js` 파일은 다음 기능을 수행합니다.

*   **Discord 봇 초기화**: `discord.js` 라이브러리를 사용하여 봇을 초기화하고, 필요한 인텐트(`Guilds`, `GuildMessages`, `DirectMessages`, `MessageContent`, `GuildMembers`)를 설정합니다.
*   **Express 서버**: `express`를 사용하여 웹 서버를 구축하고, 클라우드타이프에서 지정하는 `PORT` 환경 변수를 사용합니다.
*   **CORS 설정**: 프론트엔드와의 통신을 위해 CORS를 허용합니다.
*   **`/api/check-membership` 엔드포인트**: 프론트엔드에서 특정 `userId`가 봇이 참여하고 있는 서버의 멤버인지 확인하는 API입니다. `ticket.js`의 `checkBotAndServer` 함수에서 호출됩니다.
*   **`/api/discord/notify` 엔드포인트**: 프론트엔드에서 티켓 생성 시 Discord 사용자에게 알림 DM을 보내는 API입니다. `ticket.js`의 `sendDiscordNotification` 함수에서 호출됩니다.
    *   티켓 정보와 사용자 ID를 받아 임베드 메시지와 웹사이트 링크 버튼을 포함한 DM을 전송합니다.

## 5. 추가 고려사항

*   **보안**: `DISCORD_BOT_TOKEN`은 `.env` 파일을 통해 관리되며, 클라우드타이프의 환경 변수 기능을 사용하여 안전하게 보호됩니다.
*   **오류 처리**: 봇 코드에는 기본적인 오류 처리 로직이 포함되어 있습니다. 클라우드타이프 대시보드의 로그를 통해 봇의 작동 상태를 모니터링할 수 있습니다.
*   **확장**: 현재 봇은 `check-membership`과 `discord/notify` 두 가지 API 엔드포인트를 제공합니다. 필요에 따라 `discord-thread-manager.js`의 기능(예: 티켓 상태 변경 알림, DM 메시지 삭제 등)을 백엔드 API로 구현하여 확장할 수 있습니다.

이 가이드를 통해 클라우드타이프에서 Discord.js 봇을 성공적으로 배포하고 티켓봇 프로젝트와 연동하시길 바랍니다.
```
