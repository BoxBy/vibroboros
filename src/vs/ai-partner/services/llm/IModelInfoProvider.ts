/**
 * Model Info Provider Interface
 *
 * 모델 메타데이터 관리를 위한 인터페이스입니다.
 */

import { ModelInfo, LLMProvider } from '../../services/LLMService';

export interface IModelInfoProvider {
    /**
     * 모델의 상세 정보를 가져옵니다.
     * @param provider LLM 제공자
     * @param model 모델 ID
     * @param apiKey API 키
     * @param endpoint 엔드포인트 URL
     * @returns 모델 정보
     */
    getModelInfo(provider: LLMProvider, model: string, apiKey?: string, endpoint?: string): Promise<ModelInfo>;

    /**
     * 제공자별 사용 가능한 모델 목록을 가져옵니다.
     * @param provider LLM 제공자
     * @param apiKey API 키
     * @param endpoint 엔드포인트 URL
     * @returns 모델 ID 배열
     */
    listModels(provider: LLMProvider, apiKey: string, endpoint: string): Promise<string[]>;

    /**
     * 모델 정보 캐시를 지웁니다.
     */
    clearCache(): void;

    /**
     * 사용자 오버라이드 설정이 있는지 확인합니다.
     * @returns 오버라이드된 maxContextTokens 값 또는 undefined
     */
    getUserOverride(): number | undefined;
}
