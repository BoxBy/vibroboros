/**
 * Tokenizer Service
 *
 * 텍스트와 메시지의 토큰 수를 계산합니다.
 * js-tiktoken을 사용하여 정확한 토큰 수를 제공합니다.
 */

import { getEncoding } from 'js-tiktoken';
import { ITokenizerService } from './ITokenizerService';
import { LlmMessage } from '../../services/LLMService';

export class TokenizerService implements ITokenizerService {
    private static instance: TokenizerService;

    private constructor() {}

    public static getInstance(): TokenizerService {
        if (!TokenizerService.instance) {
            TokenizerService.instance = new TokenizerService();
        }
        return TokenizerService.instance;
    }

    /**
     * 텍스트 또는 메시지의 토큰 수를 계산합니다.
     */
    public countTokens(content: string | LlmMessage[], modelId: string = 'gpt-4o'): number {
        if (typeof content === 'string') {
            return this.countTextTokens(content, modelId);
        }
        return this.countMessagesTokens(content, modelId);
    }

    /**
     * 텍스트의 토큰 수를 계산합니다.
     */
    public countTextTokens(text: string, modelId: string = 'gpt-4o'): number {
        try {
            const enc = getEncoding('cl100k_base');
            return enc.encode(text).length;
        } catch (e) {
            // Fallback heuristic: char / 3.5
            return Math.ceil(text.length / 3.5);
        }
    }

    /**
     * 메시지 배열의 토큰 수를 계산합니다.
     */
    public countMessagesTokens(messages: LlmMessage[], modelId: string = 'gpt-4o'): number {
        try {
            const enc = getEncoding('cl100k_base');

            let total = 0;
            for (const msg of messages) {
                let text = '';
                if (typeof msg.content === 'string') {
                    text = msg.content;
                } else if (Array.isArray(msg.content)) {
                    text = msg.content
                        .filter(c => c.type === 'text')
                        .map(c => (c as any).text || '')
                        .join('');
                }
                total += enc.encode(text).length + 4; // +4 for role/message overhead
            }
            return total;
        } catch (e) {
            // Fallback: 각 메시지의 문자열 길이 합산 / 3.5
            let totalLength = 0;
            for (const msg of messages) {
                if (typeof msg.content === 'string') {
                    totalLength += msg.content.length;
                } else if (Array.isArray(msg.content)) {
                    totalLength += msg.content.reduce((sum, c) => {
                        return sum + (c.type === 'text' ? ((c as any).text || '').length : 0);
                    }, 0);
                }
            }
            return Math.ceil(totalLength / 3.5) + messages.length * 4;
        }
    }

    /**
     * 시스템 프롬프트의 토큰 수를 계산합니다.
     */
    public countSystemPromptTokens(systemPrompt: string, modelId: string = 'gpt-4o'): number {
        return this.countTextTokens(systemPrompt, modelId);
    }

    /**
     * 단어 수를 추정합니다 (대략적인 토큰 수 추정용).
     */
    public estimateWordCount(text: string): number {
        return text.split(/\s+/).filter(w => w.length > 0).length;
    }

    /**
     * 문자 수에서 토큰 수를 추정합니다 (빠른 추정용).
     */
    public estimateTokensFromCharCount(charCount: number): number {
        return Math.ceil(charCount / 3.5);
    }
}
