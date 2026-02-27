/**
 * Context Manager Interface
 *
 * 컨텍스트 관리 및 프루닝을 위한 인터페이스입니다.
 */

import { LlmMessage, LLMProvider, ModelInfo } from '../../services/LLMService';

export interface IContextManager {
    /**
     * 컨텍스트 윈도우에 맞춰 대화 기록을 자릅니다.
     * @param provider LLM 제공자
     * @param modelId 모델 ID
     * @param messages 대화 메시지 배열
     * @param systemPrompt 시스템 프롬프트 (옵션)
     * @param safetyBuffer 안전 버퍼 비율 (기본값: 0.9 = 90% 사용)
     * @returns 자른 후의 메시지 배열
     */
    truncateContext(
        provider: LLMProvider,
        modelId: string,
        messages: LlmMessage[],
        systemPrompt?: string,
        safetyBuffer?: number
    ): Promise<LlmMessage[]>;

    /**
     * 추론 매개변수를 해결합니다.
     * @param modelInfo 모델 정보
     * @param effort 추론 노력 (low/medium/high 또는 숫자)
     * @returns 해결된 매개변수 또는 null
     */
    resolveReasoningParameters(
        modelInfo: ModelInfo,
        effort: 'low' | 'medium' | 'high' | number | undefined
    ): { paramName: string, paramValue: any, warning?: string } | null;

    /**
     * 주어진 토큰 수가 모델의 컨텍스트 윈도우에 맞는지 확인합니다.
     * @param tokenCount 토큰 수
     * @param modelInfo 모델 정보
     * @param reservedOutput 예약된 출력 토큰 수
     * @returns 적합 여부
     */
    fitsInContext(tokenCount: number, modelInfo: ModelInfo, reservedOutput?: number): boolean;

    /**
     * 사용 가능한 입력 컨텍스트 토큰 수를 계산합니다.
     * @param modelInfo 모델 정보
     * @param safetyBuffer 안전 버퍼 비율
     * @returns 사용 가능한 토큰 수
     */
    calculateAvailableContext(modelInfo: ModelInfo, safetyBuffer?: number): number;
}
