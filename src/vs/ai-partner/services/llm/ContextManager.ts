/**
 * Context Manager
 *
 * 컨텍스트 관리 및 프루닝 서비스입니다.
 * - 컨텍스트 윈도우에 맞춘 메시지 자르기
 * - 추론 매개변수 해결
 * - 사용 가능한 컨텍스트 계산
 */

import { IContextManager } from './IContextManager';
import { ITokenizerService } from './ITokenizerService';
import { IModelInfoProvider } from './IModelInfoProvider';
import { LlmMessage, LLMProvider } from '../../services/LLMService';
import { ModelInfo } from '../../constants/ModelRegistry';
import { CompositionRoot, ServiceIdentifiers } from '../../di/CompositionRoot';
import { ConfigService } from '../../config_service';

export class ContextManager implements IContextManager {
    private static instance: ContextManager;
    private tokenizer!: ITokenizerService;
    private modelInfoProvider!: IModelInfoProvider;

    private constructor(tokenizer?: ITokenizerService, modelInfoProvider?: IModelInfoProvider) {
        // Lazy initialization or dependency injection
        if (tokenizer) {
            this.tokenizer = tokenizer;
        }
        if (modelInfoProvider) {
            this.modelInfoProvider = modelInfoProvider;
        }
    }

    public static getInstance(tokenizer?: ITokenizerService, modelInfoProvider?: IModelInfoProvider): ContextManager {
        if (!ContextManager.instance) {
            ContextManager.instance = new ContextManager(tokenizer, modelInfoProvider);
        }
        return ContextManager.instance;
    }

    private getTokenizer(): ITokenizerService {
        if (!this.tokenizer) {
            const { TokenizerService } = require('./TokenizerService');
            this.tokenizer = TokenizerService.getInstance();
        }
        return this.tokenizer;
    }

    private getModelInfoProvider(): IModelInfoProvider {
        if (!this.modelInfoProvider) {
            const { ModelInfoProvider } = require('./ModelInfoProvider');
            this.modelInfoProvider = ModelInfoProvider.getInstance();
        }
        return this.modelInfoProvider;
    }

    /**
     * 컨텍스트 윈도우에 맞춰 대화 기록을 자릅니다.
     */
    public async truncateContext(
        provider: LLMProvider,
        modelId: string,
        messages: LlmMessage[],
        systemPrompt?: string,
        safetyBuffer: number = 0.9
    ): Promise<LlmMessage[]> {
        const modelInfoProvider = this.getModelInfoProvider();
        const modelInfo = await modelInfoProvider.getModelInfo(provider, modelId);

        const maxContext = modelInfo.maxContextTokens;
        const maxOutput = modelInfo.maxOutputTokens;

        // Budget available for INPUT (Context - reserved output)
        const reservedOutput = maxOutput;
        const effectiveLimit = Math.floor((maxContext - reservedOutput) * safetyBuffer);

        const tokenizer = this.getTokenizer();

        // 1. Mandatory Components
        let currentTokens = 0;
        const mandatoryMessages: LlmMessage[] = [];

        // System Prompt
        if (systemPrompt) {
            const sysTokens = tokenizer.countTokens(systemPrompt, modelId);
            currentTokens += sysTokens;
        }

        // Last User Message (The current query)
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'user') {
            const lastMsgTokens = tokenizer.countTokens([lastMsg], modelId);
            mandatoryMessages.push(lastMsg);
            currentTokens += lastMsgTokens;
        }

        // If mandatory alone exceeds limit, warn and return only mandatory
        if (currentTokens >= effectiveLimit) {
            console.warn(`[ContextManager] Warning: System prompt + Last message exceeds context limit (${currentTokens}/${effectiveLimit})`);
            return mandatoryMessages;
        }

        // 2. Add Recent History (Reverse Chronological)
        const historyMessages: LlmMessage[] = [];
        const availableTokens = effectiveLimit - currentTokens;
        let historyUsage = 0;

        // Iterate backwards from second-to-last message
        for (let i = messages.length - 2; i >= 0; i--) {
            const msg = messages[i];

            // Skip system messages in history
            if (msg.role === 'system') {
                continue;
            }

            const msgTokens = tokenizer.countTokens([msg], modelId);

            if (historyUsage + msgTokens <= availableTokens) {
                historyMessages.unshift(msg);
                historyUsage += msgTokens;
            } else {
                break;
            }
        }

        // Reconstruct final list: History + Last Message
        return [...historyMessages, ...mandatoryMessages];
    }

    /**
     * 추론 매개변수를 해결합니다.
     */
    public resolveReasoningParameters(
        modelInfo: ModelInfo,
        effort: 'low' | 'medium' | 'high' | number | undefined
    ): { paramName: string, paramValue: any, warning?: string } | null {
        if (!modelInfo.supportsReasoning) {
            return null;
        }

        const configService = CompositionRoot.resolve<ConfigService>(ServiceIdentifiers.ConfigService);
        const resolvedEffort = effort || configService.getGlobalReasoningEffort();

        // 1. Handle Integer Input (Custom Budget)
        if (typeof resolvedEffort === 'number') {
            const effortNum = resolvedEffort;
            if (modelInfo.reasoningType === 'budget') {
                return { paramName: 'budget_tokens', paramValue: effort };
            }
            // Fallback for non-budget models
            let fallbackLevel = 'high';
            if (effortNum < 10000) {
                fallbackLevel = 'low';
            } else if (effortNum < 50000) {
                fallbackLevel = 'medium';
            }
            return {
                paramName: modelInfo.reasoningType === 'level' ? 'thinkingLevel' : 'reasoning_effort',
                paramValue: fallbackLevel,
                warning: `Model does not support integer budget. Using '${fallbackLevel}' instead.`
            };
        }

        // 2. Handle Enum Input ('low', 'medium', 'high')

        // Anthropic (Budget)
        if (modelInfo.reasoningType === 'budget') {
            const budgets = configService.getReasoningBudgets();
            const maxOut = modelInfo.maxOutputTokens || 64000;
            let budget = 0;
            switch (resolvedEffort) {
                // High effort uses 80% of max output tokens as a safe performance ceiling (Senior Intuition)
                case 'low': budget = budgets.low || Math.max(1024, Math.floor(maxOut * 0.2)); break;
                case 'medium': budget = budgets.medium || Math.max(4096, Math.floor(maxOut * 0.5)); break;
                case 'high': budget = budgets.high || Math.max(8192, Math.floor(maxOut * 0.8)); break;
            }
            return { paramName: 'budget_tokens', paramValue: budget };
        }

        // Google (ThinkingLevel)
        if (modelInfo.reasoningType === 'level') {
            // Gemini 3.0 supports only Low / High (no Medium)
            if (resolvedEffort === 'medium' && modelInfo.id.includes('gemini-3')) {
                return {
                    paramName: 'thinkingLevel',
                    paramValue: 'high',
                    warning: `Gemini 3.0 does not support 'medium'. Upgraded to 'high'.`
                };
            }
            return { paramName: 'thinkingLevel', paramValue: resolvedEffort };
        }

        // OpenAI / xAI / Groq (ReasoningEffort)
        if (modelInfo.reasoningType === 'effort') {
            return { paramName: 'reasoning_effort', paramValue: resolvedEffort };
        }

        return null;
    }

    /**
     * 주어진 토큰 수가 모델의 컨텍스트 윈도우에 맞는지 확인합니다.
     */
    public fitsInContext(tokenCount: number, modelInfo: ModelInfo, reservedOutput?: number): boolean {
        const reserved = reservedOutput || modelInfo.maxOutputTokens || 4096;
        return tokenCount <= (modelInfo.maxContextTokens - reserved);
    }

    /**
     * 사용 가능한 입력 컨텍스트 토큰 수를 계산합니다.
     */
    public calculateAvailableContext(modelInfo: ModelInfo, safetyBuffer?: number): number {
        const configService = CompositionRoot.resolve<ConfigService>(ServiceIdentifiers.ConfigService);
        const effectiveBuffer = safetyBuffer ?? configService.getSafetyBufferRatio();
        const maxContext = modelInfo.maxContextTokens;
        const maxOutput = modelInfo.maxOutputTokens || 4096;
        return Math.floor((maxContext - maxOutput) * effectiveBuffer);
    }

    /**
     * 전체 컨텍스트 길이를 계산합니다 (시스템 프롬프트 + 메시지).
     */
    public async calculateTotalContextLength(
        _provider: LLMProvider,
        modelId: string,
        messages: LlmMessage[],
        systemPrompt?: string
    ): Promise<number> {
        const tokenizer = this.getTokenizer();
        let total = 0;

        if (systemPrompt) {
            total += tokenizer.countTokens(systemPrompt, modelId);
        }

        for (const msg of messages) {
            total += tokenizer.countTokens([msg], modelId);
        }

        return total;
    }

    /**
     * 컨텍스트가 초과되었는지 확인합니다.
     */
    public async isContextExceeded(
        provider: LLMProvider,
        modelId: string,
        messages: LlmMessage[],
        systemPrompt?: string,
        safetyBuffer?: number
    ): Promise<boolean> {
        const modelInfoProvider = this.getModelInfoProvider();
        const modelInfo = await modelInfoProvider.getModelInfo(provider, modelId);

        const totalTokens = await this.calculateTotalContextLength(provider, modelId, messages, systemPrompt);
        const available = this.calculateAvailableContext(modelInfo, safetyBuffer);

        return totalTokens > available;
    }

    /**
     * 초과된 토큰 수를 계산합니다.
     */
    public async calculateExceededTokens(
        provider: LLMProvider,
        modelId: string,
        messages: LlmMessage[],
        systemPrompt?: string,
        safetyBuffer?: number
    ): Promise<number> {
        const modelInfoProvider = this.getModelInfoProvider();
        const modelInfo = await modelInfoProvider.getModelInfo(provider, modelId);

        const totalTokens = await this.calculateTotalContextLength(provider, modelId, messages, systemPrompt);
        const available = this.calculateAvailableContext(modelInfo, safetyBuffer);

        return Math.max(0, totalTokens - available);
    }
}
