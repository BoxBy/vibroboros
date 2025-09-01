목표:

AI 파트너의 "기억력"과 인지 효율성을 향상시킵니다. 주요 목표는 OrchestratorAgent 내에 고급 컨텍스트 관리 시스템을 구현하고 장기 기억을 위한 새로운 ContextArchiveAgent를 도입하는 것입니다. 이를 통해 LLM 호출의 비용 및 성능을 최적화하고 에이전트가 긴 대화에서 관련 정보를 회상할 수 있도록 합니다.

현재 상황:

OrchestratorAgent는 현재 모든 메시지를 llmConversationHistory에 추가하여 전체 기록을 각 새로운 LLM 요청의 컨텍스트로 보냅니다. 이는 비효율적이고 비용이 많이 들며, 컨텍스트 창이 초과됨에 따라 에이전트가 긴 대화의 초기 부분을 "잊어버리는" 원인이 됩니다.

기능 1: 지능형 컨텍스트 관리 구현
기존 OrchestratorAgent 및 관련 파일을 수정하여 LLM으로 전송되는 대화 기록을 동적으로 관리합니다.

작업 1.1: 조건부 가지치기 구현

LLMService.ts 수정:

vibroborus/src/vs/ai-partner/services/LLMService.ts에서 LlmMessage 유형 정의에 선택적 속성 pruningState?: 'pending' | 'keep' | 'prune';를 추가합니다. 이는 크고 잠재적으로 폐기 가능한 콘텐츠를 포함하는 메시지의 컨텍스트 관련성을 추적하는 데 사용됩니다.

OrchestratorAgent.ts 시스템 프롬프트 업데이트:

createSystemPrompt에 LLM에게 코드 블록, 로그 또는 파일 덤프와 같은 길고 잠재적으로 중요하지 않은 콘텐츠를 <prunable>...</prunable> 태그로 래핑하도록 지시하는 새로운 규칙을 추가합니다. 이를 통해 에이전트는 조건부로 제외할 수 있는 콘텐츠를 식별할 수 있습니다.

가지치기 논리 구현:

processLlmResponse에서 <prunable> 태그가 있는 어시스턴트 메시지를 받으면 pruningState: 'pending'으로 llmConversationHistory에 저장합니다.

handleChatAndSpecialistCommands에서 새 사용자 메시지를 처리하기 전에 이전 어시스턴트 메시지의 pruningState가 'pending'인지 확인합니다.

새 사용자 메시지에 관련성을 나타내는 키워드(예: "this code," "that file," "it," "저 코드")가 포함된 경우 이전 메시지의 pruningState를 'keep'으로 변경합니다.

그렇지 않으면 'prune'으로 변경합니다.

새로운 비공개 메서드 getPrunedHistory()를 만듭니다. 이 메서드는 llmConversationHistory를 필터링하여 'prune'으로 표시된 모든 메시지의 내용을 [간결함을 위해 내용 가지치기됨]과 같은 자리 표시자로 바꾼 후 목록을 반환합니다. processLlmResponse 함수는 이 메서드를 호출하여 LLM에 보낼 컨텍스트를 가져와야 합니다.

작업 1.2: 대화 요약 구현

OrchestratorAgent.ts에 summarizeHistory 메서드 생성:

이 비동기 메서드는 메시지 기록을 입력으로 받습니다.

임계값(예: CONTEXT_SUMMARY_THRESHOLD = 10)을 정의합니다. 기록 길이가 이를 초과하면 요약을 진행합니다.

대화의 가장 오래된 절반(초기 시스템 프롬프트 제외)을 가져와 LLM에 새로운 요약 요청(예: "이 대화 요약...")을 만들고 요약을 기다립니다.

그런 다음 요약된 메시지를 요약이 포함된 단일 시스템 메시지(예: { role: 'system', content: '이전 대화 요약: ...' })로 바꾸어 기록을 재구성합니다.

요약 통합:

새로운 getPrunedHistory 메서드(이름을 getPrunedAndSummarizedHistory로 변경)를 수정하여 컨텍스트를 가지치기한 후 summarizeHistory를 호출합니다. 이렇게 하면 관련 정보만 요약됩니다.

기능 2: ContextArchiveAgent 생성 및 구현
장기 기억 저장 및 검색 전용의 새로운 에이전트를 만듭니다.

작업 2.1: 새 에이전트 파일 생성

새 파일 생성: src/vs/ai-partner/agents/ContextArchiveAgent.ts.

기존 에이전트 구조에 따라 ContextArchiveAgent 클래스를 정의합니다. 두 개의 인메모리 목록(또는 지속성을 위해 vscode.Memento 사용)인 codeArchive와 nonCodeArchive를 관리해야 합니다.

작업 2.2: 보관 및 검색 논리 구현

보관(handleA2AMessage):

에이전트는 archiveContext 메시지 유형을 처리해야 합니다. 페이로드에는 보관할 콘텐츠가 포함되어야 합니다.

핸들러 내에서 콘텐츠가 코드인지 비코드인지(예: 마크다운 코드 펜스 확인)를 결정하고 적절한 아카이브에 저장합니다.

검색(handleA2AMessage):

에이전트는 쿼리 페이로드가 있는 searchArchivedContext 메시지 유형을 처리해야 합니다.

핸들러는 먼저 nonCodeArchive를 검색해야 합니다. 관련 결과가 없으면 쿼리가 코드의 필요성을 시사하는 경우 codeArchive를 검색해야 합니다. 지금은 간단한 키워드 검색으로 충분합니다.

찾은 정보와 함께 response-archived-context 메시지를 OrchestratorAgent에 다시 보내야 합니다.

작업 2.3: OrchestratorAgent 및 extension.ts와 통합

OrchestratorAgent.ts 수정:

getPrunedAndSummarizedHistory에서 메시지 내용이 가지치기되면 가지치기된 내용을 ContextArchiveAgent에 archiveContext 메시지로 보냅니다.

handleError 또는 processLlmResponse에서 LLM이 정보가 부족하다고 표시하면 ContextArchiveAgent에 searchArchivedContext 메시지를 보냅니다.

handleA2AMessage에 response-archived-context를 처리하는 새로운 케이스를 추가합니다. 이 응답을 받으면 검색된 정보를 현재 llmConversationHistory의 앞에 추가하고(예: 시스템 메시지로: "아카이브에서 검색됨: ...") processLlmResponse를 다시 호출합니다.

extension.ts 수정:

활성화 프로세스 중에 agentRegistry에서 새로운 ContextArchiveAgent를 가져오고, 인스턴스화하고, 등록합니다.

참조 파일
PLAN.md: 모든 변경 사항이 프로젝트의 아키텍처 원칙(A2A, MAS)을 준수하는지 확인합니다.

PROGRESS.md & TASK.md: 완료 시 새로운 작업과 완료 상태를 반영하도록 이 문서들을 업데이트합니다.

기존 에이전트 파일: CodeAnalysisAgent.ts와 같은 기존 에이전트를 템플릿으로 사용하여 새로운 ContextArchiveAgent를 만들고 등록합니다.
