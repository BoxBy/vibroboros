# 폴더: src/vs/ai-partner/services

## 역할
이 디렉터리는 AI 파트너 서브시스템 여러 부분에서 공통으로 사용하는 서비스들을 포함합니다. 서비스는 LLM 호출, 로깅, 설정, 스트리밍 등 **가로지르는 관심사(cross-cutting concern)**를 캡슐화합니다.

## 서비스 개요
- `LLMService.ts` – 외부 LLM(OpenAI 호환, Ollama, Anthropic, xAI, Google, Groq, OpenRouter 등)과 통신하는 중앙 서비스입니다. 엔드포인트 해석, 스트리밍, 구조화 출력, 오류 처리, 토큰 사용량 집계를 담당합니다.
- `DeveloperLogService.ts` – Orchestrator 라우팅 결정, A2A 디스패치 로그 등 에이전트/서비스에서 발생하는 개발자용 로그를 수집하여 디버깅과 투명성을 제공합니다.
- `TerminalStreamService.ts` – 장시간 실행되는 터미널 명령의 출력을 스트리밍 방식으로 관리하여 UI가 중간 결과를 점진적으로 표시할 수 있도록 합니다.

(설정 및 인증과 관련된 서비스는 이 폴더 밖의 `ConfigService.ts`, `AuthService.ts` 등에 위치하지만, 최종적으로는 `extension.ts`에서 함께 초기화됩니다.)

## AI 분석 가이드
- 확장이 LLM과 어떻게 통신하는지 이해하려면 `LLMService.ts`를 먼저 읽으세요.
- 내부 의사결정과 이벤트가 사용자에게 어떻게 노출되는지 보려면 `DeveloperLogService.ts`를 살펴보세요.
- 터미널 기반 장기 작업과 UI 연동 방식을 이해하려면 `TerminalStreamService.ts`와 그 사용처를 확인하세요.
