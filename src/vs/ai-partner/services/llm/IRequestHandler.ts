/**
 * Request Handler Interface
 *
 * LLM 요청 처리를 위한 인터페이스입니다.
 */

import { LlmMessage, LlmFullResponse, LLMProvider } from '../../services/LLMService';

export interface CompletionOptions {
    structured?: { mode: 'json_object' | 'json_schema'; schema?: any; schemaName?: string };
    onRetry?: (attempt: number, maxRetries: number, error: any) => void;
}

export interface CompletionParams {
    provider: LLMProvider;
    conversationHistory: LlmMessage[];
    apiKey: string;
    endpoint: string;
    tools: any[];
    model: string;
    onChunk?: (chunk: string) => void;
    timeout?: number;
    options?: CompletionOptions;
    token?: any; // vscode.CancellationToken
    temperature?: number;
    maxTokens?: number;
    modelInfo?: any;
}

export interface IRequestHandler {
    /**
     * LLM 완료를 요청합니다.
     * @param params 완료 매개변수
     * @returns 완료 응답
     */
    requestCompletion(params: CompletionParams): Promise<LlmFullResponse>;

    /**
     * 스트리밍 지원 여부를 확인합니다.
     * @param provider LLM 제공자
     * @returns 스트리밍 지원 여부
     */
    supportsStreaming(provider: LLMProvider): boolean;

    /**
     * 제공자를 등록합니다.
     * @param providerId 제공자 ID
     * @param provider 제공자 인스턴스
     */
    registerProvider(providerId: string, provider: any): void;

    /**
     * 사용량 통계를 가져옵니다.
     */
    getUsageTotals(): { prompt_tokens: number; completion_tokens: number; total_tokens: number };

    /**
     * 사용량 통계를 재설정합니다.
     */
    resetUsageTotals(): void;
}
