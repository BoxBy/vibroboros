/**
 * Tokenizer Service Interface
 *
 * 토큰 계산을 위한 인터페이스입니다.
 */

import { LlmMessage } from '../../services/LLMService';

export interface ITokenizerService {
    /**
     * 텍스트 또는 메시지의 토큰 수를 계산합니다.
     * @param content 계산할 텍스트 또는 메시지 배열
     * @param modelId 모델 ID (기본값: 'gpt-4o')
     * @returns 토큰 수
     */
    countTokens(content: string | LlmMessage[], modelId?: string): number;

    /**
     * 텍스트의 토큰 수를 계산합니다 (간소화 버전).
     * @param text 계산할 텍스트
     * @param modelId 모델 ID (기본값: 'gpt-4o')
     * @returns 토큰 수
     */
    countTextTokens(text: string, modelId?: string): number;

    /**
     * 메시지 배열의 토큰 수를 계산합니다.
     * @param messages 계산할 메시지 배열
     * @param modelId 모델 ID (기본값: 'gpt-4o')
     * @returns 토큰 수
     */
    countMessagesTokens(messages: LlmMessage[], modelId?: string): number;
}
