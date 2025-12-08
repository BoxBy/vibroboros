 # Viper

<p align="center">
  <img src="media/logo.svg" width="400">
</p>

<div align="center">
  <a href="LICENSE.txt"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=Viper.viper"><img src="https://img.shields.io/visual-studio-marketplace/v/Viper.viper.svg?color=blue&label=VS%20Marketplace" alt="VS Marketplace"></a>
</div>

## 소개

Viper는 VS Code에 통합된 정교한 다중 에이전트 AI 코딩 파트너입니다. 여러 전문 에이전트가 협업하여 개발자의 생산성을 높이고, 코드 품질을 개선하며, 전체 개발 수명주기를 간소화하도록 설계되었습니다. 각 에이전트는 특정 작업에 특화되어 있으며, 진정한 Agent‑to‑Agent(A2A) 프로토콜을 통해 서로 통신합니다.

## 핵심 기능

* **진정한 다중 에이전트 시스템(MAS)**: 복잡한 개발 작업을 처리하기 위해 독립적인 서비스로 동작하는 전문 AI 에이전트 팀.
* **A2A 통신**: 에이전트 간 통신은 표준 HTTP 기반 Agent‑to‑Agent 프로토콜을 통해 이루어지며, 시스템을 모듈식이고 확장 가능하게 만듭니다.
* **동적 작업 계획**: `OrchestratorAgent`가 사용자의 목표를 기반으로 실행 계획을 동적으로 생성하고, 적절한 전문 에이전트에게 작업을 위임합니다.
* **능동적 & 백그라운드 작업**: `CodeWatcherAgent`, `SecurityAnalysisAgent`와 같은 에이전트가 백그라운드에서 동작하여 문제를 찾아내고 프로젝트 인덱스를 유지합니다.
* **확장 가능한 도구 체인**: 시스템은 Model Context Protocol (MCP) 표준을 사용하여 파일 I/O, 터미널 실행, 웹 검색 등의 도구를 에이전트에 제공합니다.

## 아키텍처

Viper는 진정한 Agent‑to‑Agent(A2A) 아키텍처를 기반으로 구축되었습니다. 모든 에이전트는 중앙 `a2a_server`에 의해 독립적인 서비스로 호스팅됩니다. `OrchestratorAgent`는 사용자 요청의 주요 진입점 역할을 하지만, 모든 에이전트는 `A2AClient`를 사용해 동등한 동료로서 서로 통신합니다.

자세한 아키텍처 설명은 [프로젝트 블루프린트](./PLAN.md)를 참고하세요.

프로젝트의 핵심 철학은 [Philosophy 문서](./docs/philosophy.md)에서 확인할 수 있습니다.

## 시작하기

1. **확장 설치**: VS Code 마켓플레이스에서 "Viper"를 검색해 설치합니다.
2. **확장 설정**:
   * VS Code 설정(`Ctrl+,`)을 엽니다.
   * "Viper"를 검색합니다.
   * LLM 서비스의 API 키와 엔드포인트를 입력합니다.
3. **대화 시작**: Viper 사이드바를 열어 AI 파트너와 상호작용을 시작합니다.

## 문서

프로젝트의 아키텍처와 철학에 대한 자세한 문서는 `docs` 폴더에서 확인할 수 있습니다.

* **[Project Blueprint](./PLAN.md)** (가장 최신의 아키텍처 문서)
* **[Philosophy](./docs/philosophy.md)**

## 기여하기

기여는 언제나 환영입니다! 시작하는 방법에 대한 자세한 내용은 [기여 가이드라인](./CONTRIBUTING_ko.md)을 참고하세요.

## 라이선스

이 프로젝트는 MIT 라이선스로 배포됩니다. 자세한 내용은 [LICENSE.txt](./LICENSE.txt) 파일을 참고하세요.
