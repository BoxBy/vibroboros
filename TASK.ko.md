# 작업: 조건부 가지치기 구현

## 기능: 지능형 컨텍스트 관리 구현
기존 OrchestratorAgent 및 관련 파일을 수정하여 LLM으로 전송되는 대화 기록을 동적으로 관리합니다.

## 작업: 조건부 가지치기 구현

### LLMService.ts 수정:
vibroborus/src/vs/ai-partner/services/LLMService.ts에서 `LlmMessage` 유형 정의에 선택적 속성 `pruningState?: 'pending' | 'keep' | 'prune';`를 추가합니다. 이는 크고 잠재적으로 폐기 가능한 콘텐츠를 포함하는 메시지의 컨텍스트 관련성을 추적하는 데 사용됩니다.

### OrchestratorAgent.ts 시스템 프롬프트 업데이트:
`createSystemPrompt`에 LLM에게 코드 블록, 로그 또는 파일 덤프와 같은 길고 잠재적으로 중요하지 않은 콘텐츠를 `<prunable>...</prunable>` 태그로 래핑하도록 지시하는 새로운 규칙을 추가합니다. 이를 통해 에이전트는 조건부로 제외할 수 있는 콘텐츠를 식별할 수 있습니다.

### 가지치기 논리 구현:
- `processLlmResponse`에서 `<prunable>` 태그가 있는 어시스턴트 메시지를 받으면 `pruningState: 'pending'`으로 `llmConversationHistory`에 저장합니다.
- `handleChatAndSpecialistCommands`에서 새 사용자 메시지를 처리하기 전에 이전 어시스턴트 메시지의 `pruningState`가 `'pending'`인지 확인합니다.
- 새 사용자 메시지에 관련성을 나타내는 키워드(예: "this code," "that file," "it," "저 코드")가 포함된 경우 이전 메시지의 `pruningState`를 `'keep'`으로 변경합니다.
- 그렇지 않으면 `'prune'`으로 변경합니다.
- 새로운 비공개 메서드 `getPrunedHistory()`를 만듭니다. 이 메서드는 `llmConversationHistory`를 필터링하여 `'prune'`으로 표시된 모든 메시지의 내용을 `[간결함을 위해 내용 가지치기됨]`과 같은 자리 표시자로 바꾼 후 목록을 반환합니다. `processLlmResponse` 함수는 이 메서드를 호출하여 LLM에 보낼 컨텍스트를 가져와야 합니다.
