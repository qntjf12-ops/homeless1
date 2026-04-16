# CLASP (Apps Script CLI) 사용 가이드

선생님의 로컬 환경에서 구글 앱스 스크립트를 관리할 수 있는 **CLASP** 환경이 구축되었습니다.

## 1. 필수 선행 작업 (딱 한 번만)

CLASP를 사용하기 전에 구글 계정에서 API 사용 설정을 켜야 합니다.

1.  **[Google Apps Script 설정](https://script.google.com/home/settings)** 페이지에 접속합니다.
2.  오른쪽 하단의 **Google Apps Script API** 항목을 **[켜기(ON)]**로 변경합니다.

## 2. 로그인하기

터미널에서 아래 명령어를 입력하여 구글 계정 인증을 진행하세요.

```powershell
.\clasp.bat login
```
- 브라우저가 열리면 앱에서 요청하는 권한을 승인해 주세요.

## 3. 주요 명령어 사용법

이제 `1번` 폴더에서 `.\clasp.bat` 명령어를 통해 다음 작업들을 할 수 있습니다.

| 명령어 | 설명 |
| :--- | :--- |
| `.\clasp.bat clone <ScriptID>` | 구글 시트의 코드를 내 컴퓨터로 가져옵니다. |
| `.\clasp.bat pull` | 구글 시트의 최신 코드를 다시 가져옵니다. |
| `.\clasp.bat push` | 내가 수정한 코드를 구글 시트에 즉시 반영합니다. |
| `.\clasp.bat open` | 브라우저에서 해당 Apps Script 에디터를 엽니다. |

> [!TIP]
> **Script ID 확인 방법**
> 구글 시트의 [Apps Script] 화면에서 **[프로젝트 설정(톱니바퀴)]**을 누르면 '스크립트 ID'를 복사할 수 있습니다.

## 4. 설치된 경로 정보
- Node.js: `.\node-v20.11.1-win-x64\` (무설치 버전)
- 실행 파일: `.\clasp.bat`

이제 로컬 에디터(VS Code 등)에서 코드를 수정하고 바로 서버에 반영할 수 있는 전문적인 개발 환경이 준비되었습니다!
