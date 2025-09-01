#### This repository was developed leveraging Gemini.

---

### [English](README.md) | [한국어](README_ko.md)

---
<div align="center">
  <img src="./media/logo.svg" alt="Vibroboros Logo" width="200"/>
  <h1>Vibroboros</h1>
  <p><strong>VS Code를 위한 자율 다중 에이전트 AI 코딩 파트너입니다.</strong></p>

  <p>
    <a href="https://github.com/your-repo/vibroboros/actions"><img src="https://img.shields.io/badge/build-passing-brightgreen" alt="Build Status"></a>
    <a href="https://github.com/your-repo/vibroboros/releases"><img src="https://img.shields.io/badge/version-0.1.0-blue" alt="Version"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
    <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
  </p>
</div>

Vibroboros는 소프트웨어 개발의 미래에 대한 저희의 비전입니다: 당신의 IDE 안에서 하나의 팀처럼 협업하는 정교한 전문 AI 에이전트 시스템. 저희는 이 시스템이 복잡하고 높은 수준의 요청을 이해하고, 상세한 실행 계획을 수립하며, 다양한 개발 도구를 사용하여 코드 리팩토링, 테스트 생성, 문서 작성 등 훨씬 많은 작업을 수행하도록 설계했습니다. **심지어 스스로의 진행 상황을 문서화하기까지 합니다.**

---

## 🧬 우리의 철학: 바이브로보로스 원칙

저희 프로젝트의 이름 **Vibroboros**는 '바이브 코딩(Vibe Coding)'과 '우로보로스(Ouroboros)'의 합성어이며, 이는 저희의 핵심 철학을 담고 있습니다.

-   **바이브 코딩**은 새로운 개발 패러다임입니다. 이는 개발자가 엄격하고 미리 정의된 명세 대신, 직감과 높은 수준의 목표를 바탕으로 생성형 AI의 도움을 받아 코드를 작성하는 과정을 의미합니다. 이는 인간의 창의성과 AI의 실행력 사이의 유연하고 협력적인 춤과 같습니다.

-   **우로보로스**는 자신의 꼬리를 무는 고대 상징으로, 스스로를 완벽하게 재창조하는 시스템을 만들고자 하는 이 프로젝트의 궁극적인 목표를 나타냅니다.

**바이브로보로스 원칙**은 이 두 아이디어의 융합입니다. 전체 코드베이스는 저희가 작성한 일련의 고수준 프롬프트(이것이 '바이브'입니다)를 기반으로 구축되었습니다. 이 프로젝트의 최종 시험은, 완성된 프로젝트에 바로 그 프롬프트들을 다시 입력하여, 무한히 반복 가능한, 완벽한 1:1 복제품(이것이 '우로보로스'의 순환입니다)을 스스로 만들어내게 하는 것입니다. 이는 자신이 만들어진 바로 그 프롬프트로부터 계속해서 스스로를 재구축하는 프로젝트입니다.

저희는 또한 Vibroboros를 두 가지 중요한 목적인 즉각적인 성능과 미래의 확장성을 모두 만족시키기 위해 의도적으로 이중 아키텍처로 설계했습니다.

1.  **현재 구현 (인-프로세스 방식):** 최고의 속도와 효율성을 위해, 현재 시스템은 단일 VS Code 확장 프로세스 내에서 긴밀하게 결합된 에이전트 그룹으로 실행됩니다. 통신은 간단한 인-메모리 `dispatchA2AMessage` 함수에 의해 처리됩니다.

2.  **미래를 위한 준비 (A2A 프로토콜 방식):** 저희는 또한 `a2a_server.ts`, `a2a_client.ts`, `core_data_structures.ts` 파일들을 통해 훨씬 더 발전된, 분산형 아키텍처를 위한 기반을 마련했습니다. 이 설계는 에이전트들이 독립적인 HTTP 서버로 실행되며, 표준화된 작업 기반의 에이전트-에이전트(A2A) 프로토콜을 통해 통신할 수 있도록 합니다.

---

## ✨ 핵심 기능

-   **🤖 동적 작업 계획 및 실행:**
    -   **목표 지향:** 간단한 명령 대신, Vibroboros에게 높은 수준의 목표를 제시하세요 (예: "*이 클래스의 성능을 개선하고 문서를 추가해줘*").
    -   **자동 계획 수립:** LLM을 사용하여 당신의 목표를 논리적인 단계별 실행 계획으로 분해합니다.
    -   **자율 작업:** **자율 모드**를 활성화하여, 각 단계마다 당신의 승인 없이 에이전트가 전체 계획을 실행하도록 할 수 있습니다.

-   **✍️ 자율 문서화:**
    -   중요한 작업을 완료한 후, Vibroboros는 **자동으로 자신의 `README.md` 파일을 업데이트**합니다.
    -   `PLAN.md`, `PROGRESS.md`와 같은 프로젝트 파일을 읽어 프로젝트 상태에 대한 포괄적인 최신 개요를 생성합니다.

-   **🛠️ 완전한 개발자 도구 세트:**
    -   저희는 에이전트들이 *실제로* 코딩하는 데 필요한 도구를 제공하기 위해 로컬 **MCP(모델-기능-제공자) 서버**를 구축했습니다.
    -   **포함된 도구:** 파일 읽기/쓰기, 터미널 실행, 웹 검색, Git 자동화.

-   **🧠 고급 컨텍스트 및 장기 기억:**
    -   **코드베이스 인덱싱:** `CodeAnalysisAgent`가 전체 작업 공간의 심볼 인덱스를 구축하여 빠른 컨텍스트 검색을 가능하게 합니다.
    -   **영구적인 메모리:** `ContextArchiveAgent`가 대화의 중요한 세부 정보를 디스크에 저장하여, 세션을 넘나드는 장기 기억을 부여합니다.

-   **🚀 능동적인 백그라운드 지원:**
    -   `CodeWatcherAgent`는 백그라운드에서 조용히 작동하며, 파일 저장 시마다 보안 스캔과 코드 분석을 자동으로 실행합니다.

-   **🧑‍🏫 당신의 피드백으로부터 학습:**
    -   `AILedLearningAgent`가 제안에 대한 당신의 피드백을 추적하여 사용자 선호도 모델을 구축하고, 다른 에이전트들이 당신의 코딩 스타일에 맞게 행동을 조정하도록 합니다.

## ⚙️ 우리의 아키텍처

저희는 Vibroboros를 다중 에이전트 아키텍처로 설계하여 관심사의 분리를 촉진하고, 시스템을 견고하며 확장 가능하게 만들었습니다. 이 다이어그램은 우리 시스템의 제어 흐름을 보여줍니다.

```mermaid
graph TD
    subgraph "VS Code UI (웹뷰)"
        UI[MainView.tsx]
    end

    subgraph "Vibroboros 확장 프로그램"
        Orchestrator[👑 오케스트레이터 에이전트]
        MCP[🛠️ MCP 서버]
        A2ADispatch[A2A 디스패치]

        subgraph "전문 에이전트"
            Refactor[✨ 리팩토링 에이전트]
            Docs[📝 문서 생성 에이전트]
            Test[🧪 테스트 생성 에이전트]
            Security[🛡️ 보안 분석 에이전트]
            Watcher[👁️ 코드 감시 에이전트]
            Context[📚 컨텍스트 관리 에이전트]
            Analysis[🔍 코드 분석 에이전트]
            Memory[💾 컨텍스트 아카이브 에이전트]
            Learning[🧑‍🏫 AI 학습 에이전트]
            Readme[✍️ README 생성 에이전트]  // 추가됨
        end

        subgraph "도구"
            FS[파일 입출력]
            Term[터미널]
            Web[웹 검색]
        end
    end

    UI -- 사용자 입력 --> Orchestrator
    Orchestrator -- 상태 렌더링 --> UI

    Orchestrator -- 계획 생성 및 위임 --> A2ADispatch
    Orchestrator -- 계획 완료 시 --> A2ADispatch
    A2ADispatch -- 작업 --> Readme // 새로운 흐름

    A2ADispatch -- 작업 --> Refactor
    A2ADispatch -- 작업 --> Docs
    A2ADispatch -- 작업 --> Test
    A2ADispatch -- 작업 --> Security
    A2ADispatch -- 작업 --> Context
    A2ADispatch -- 작업 --> Analysis
    A2ADispatch -- 작업 --> Memory
    A2ADispatch -- 작업 --> Learning

    Watcher -- 저장 시 트리거 --> A2ADispatch

    Refactor -- 도구 사용 --> MCP
    Docs -- 도구 사용 --> MCP
    Test -- 도구 사용 --> MCP
    Security -- 도구 사용 --> MCP
    Readme -- 도구 사용 --> MCP // 새로운 흐름

    MCP -- 실행 --> FS
    MCP -- 실행 --> Term
    MCP -- 실행 --> Web

    subgraph "외부 서비스"
        LLM[LLM API]
    end

    Orchestrator -- API 호출 --> LLM
    Refactor -- API 호출 --> LLM
    Docs -- API 호출 --> LLM
    Test -- API 호출 --> LLM
    Readme -- API 호출 --> LLM // 새로운 흐름
```

## 🤖 에이전트 소개

Vibroboros의 힘은 전문화된 에이전트 팀에서 나옵니다. 저희는 각 에이전트가 특정 역할을 맡아, 시스템이 복잡한 작업을 정밀하게 처리할 수 있도록 이 팀을 구성했습니다.

| 에이전트 | 역할 | 주요 책임 |
| :--- | :--- | :--- |
| 👑 **`OrchestratorAgent`** | **지휘자** | 전체 워크플로우를 관리하고, 계획을 생성하며, 작업을 위임하고, README 업데이트를 트리거합니다. |
| ✍️ **`ReadmeGenerationAgent`** | **문서 담당자** | 주요 작업이 완료된 후 프로젝트의 README.md 파일을 자율적으로 생성하고 업데이트합니다. |
| 📚 **`ContextManagementAgent`** | **사서** | 주어진 작업에 필요한 모든 컨텍스트(활성 파일, 코드베이스 검색 결과)를 수집하고 준비합니다. |
| 🔍 **`CodeAnalysisAgent`** | **지도 제작자** | 빠르고 관련성 높은 코드 조회를 위해 전체 작업 공간의 심볼 인덱스를 구축하고 유지합니다. |
| ✨ **`RefactoringSuggestionAgent`**| **장인** | 모범 사례와 사용자 선호도에 따라 코드를 분석하고 개선 및 리팩토링을 제안합니다. |
| 📝 **`DocumentationGenerationAgent`**| **서기** | 특정 함수, 클래스, 메소드에 대한 문서(예: JSDoc, Python docstrings)를 생성합니다. |
| 🧪 **`TestGenerationAgent`** | **품질 엔지니어** | 해당 언어에 적합한 테스트 프레임워크를 사용하여 코드에 대한 유닛 테스트를 작성합니다. |
| 🛡️ **`SecurityAnalysisAgent`** | **경비원** | 정규식 기반 패턴을 사용하여 일반적인 취약점에 대한 빠르고 로컬 보안 스캔을 수행합니다. |
| 🧠 **`AILedLearningAgent`** | **멘토** | 제안에 대한 사용자 피드백을 추적하여 AI의 행동을 개인화하는 선호도 모델을 생성합니다. |
| 💾 **`ContextArchiveAgent`** | **역사학자** | 세션 간에 주요 정보를 저장하고 검색하여 시스템에 장기 기억을 제공합니다. |
| 👁️ **`CodeWatcherAgent`** | **감시자** | 백그라운드에서 실행되며, 파일 변경을 감시하여 보안 스캔 및 재인덱싱과 같은 능동적인 작업을 트리거합니다. |

## 🚀 시작하기

1.  **리포지토리 클론**:
    ```bash
    git clone https://github.com/your-repo/vibroboros.git
    cd vibroboros
    ```
2.  **의존성 설치**:
    ```bash
    npm install
    ```
3.  **확장 프로그램 실행**:
    -   VS Code에서 프로젝트 폴더를 엽니다.
    -   `F5` 키를 눌러 "Extension Development Host" 창을 시작합니다.

## ⚙️ 상세 설정

Vibroboros를 사용자 정의하려면, VS Code 설정(`Ctrl+,` 또는 `Cmd+,`)을 열고 "Vibroboros"를 검색하세요.

| 설정 | 설명 | 기본값 |
| :--- | :--- | :--- |
| `vibroboros.llm.apiKeys` | LLM 공급자의 API 키입니다. | `[]` |
| `vibroboros.llm.endpoint` | OpenAI 호환 API의 기본 URL입니다. | `''` |
| `vibroboros.agent.{agentName}.model` | 특정 에이전트에 대해 다른 모델을 지정할 수 있습니다 (예: 간단한 작업을 위한 더 빠른 모델). | `gpt-4` |
| `vibroboros.agent.orchestrator.contextTokenThreshold` | 대화 기록이 자동으로 요약되는 기준이 되는 토큰 수입니다. | `100000` |

## 🤝 기여하기

오픈 소스 커뮤니티를 배우고, 영감을 주고, 창조하는 놀라운 공간으로 만드는 것은 바로 기여입니다. 당신이 만드는 모든 기여는 **매우 감사합니다**.

기여 방법에 대한 가이드라인은 `CONTRIBUTING_ko.md` 파일을 읽어주세요.

## 📄 라이선스

MIT 라이선스에 따라 배포됩니다. 자세한 내용은 `LICENSE` 파일을 참조하세요.
