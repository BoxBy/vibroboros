import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { VSCodeButton, VSCodeDivider, VSCodeDropdown, VSCodeOption, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
import { vscodeService } from './services/vscode';
import { ProviderSettings } from './components/LLMProviderSettings';
import { validateApiKey, validateEndpoint, getDefaultEndpoint } from './utils/validation';

// Define the structure of an agent based on a2a-servers.json
interface Agent {
  path: string;
  card: {
    name: string;
    description: string;
    // Add other card properties if needed for display
  };
}

import { VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react'; // 추가

// LLM 설정 인터페이스 추가
interface LlmSettings {
  llmProvider: 'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter' | undefined; // undefined 허용
  openaiApiKeys: string;
  openaiEndpoint: string;
  ollamaEndpoint: string;
  ollamaApiKey: string;
  ollamaIsCloud: boolean;
  anthropicApiKey: string;
  anthropicEndpoint: string;
  xaiApiKey: string;
  xaiEndpoint: string;
  googleApiKey: string;
  googleEndpoint: string;
  groqApiKey: string;
  groqEndpoint: string;
  openrouterApiKey: string;
  openrouterEndpoint: string;
  model: string;
}

export const SettingsPage: React.FC = () => {
  // 유효성 검사 상태
  const [validationState, setValidationState] = useState<{
    apiKeyValid: boolean;
    endpointValid: boolean;
  }>({
    apiKeyValid: true,
    endpointValid: true
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  // LLM 설정 상태 추가
  const [llmSettings, setLlmSettings] = useState<LlmSettings>({
    llmProvider: undefined, // 초기값을 undefined로 설정하여 configService에서 가져온 값으로 초기화되도록 합니다.
    openaiApiKeys: '',
    openaiEndpoint: 'https://api.openai.com/v1',
  ollamaEndpoint: 'http://localhost:11434', // 로컬 기본값으로 변경
  ollamaApiKey: '',
  ollamaIsCloud: false,
    anthropicApiKey: '',
    anthropicEndpoint: 'https://api.anthropic.com/v1',
    xaiApiKey: '',
    xaiEndpoint: 'https://api.xai.com/v1',
    googleApiKey: '',
    googleEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
    groqApiKey: '',
    groqEndpoint: 'https://api.groq.com/openai/v1',
    openrouterApiKey: '',
    openrouterEndpoint: 'https://openrouter.ai/api/v1',
    model: '',
  });
  const [models, setModels] = useState<string[]>([]); // 모델 목록 상태 추가
  // Profiles state
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; provider: string; endpoint: string; model: string; enabled?: boolean; isDefault?: boolean }>>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const [editingProfile, setEditingProfile] = useState<{ id?: string; name: string; provider: string; endpoint: string; model: string; apiKey: string; notes?: string; timeout?: number }>({ name: '', provider: 'openai', endpoint: '', model: '', apiKey: '' });
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const llmSectionRef = useRef<HTMLDivElement | null>(null);
  const modelComboRef = useRef<HTMLDivElement | null>(null);
  const [showModelSuggestions, setShowModelSuggestions] = useState<boolean>(false);
  const modelPollTimerRef = useRef<any>(null);
  const modelPollDeadlineRef = useRef<number>(0);
  // Feature toggles
  const [streamingEnabled, setStreamingEnabled] = useState<boolean>(false);
  const [advancedHistorySummaryEnabled, setAdvancedHistorySummaryEnabled] = useState<boolean>(false);
  const [agentOverridesDraft, setAgentOverridesDraft] = useState<Record<string, { useDefault: boolean; model: string; profileId?: string }>>({});
  const [showAgentOverrides, setShowAgentOverrides] = useState<boolean>(false);

  const startModelPolling = useCallback((durationMs: number = 20000, intervalMs: number = 2000) => {
    if (modelPollTimerRef.current) {
      clearInterval(modelPollTimerRef.current);
      modelPollTimerRef.current = null;
    }
    modelPollDeadlineRef.current = Date.now() + durationMs;
    modelPollTimerRef.current = setInterval(() => {
      if (Date.now() > modelPollDeadlineRef.current) {
        clearInterval(modelPollTimerRef.current);
        modelPollTimerRef.current = null;
        return;
      }
      vscodeService.postMessage({ command: 'requestModels' });
    }, intervalMs);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'updateAgentList') {
        setAgents(message.agents);
      } else if (message.command === 'llmSettingsResponse') { // LLM 설정 응답 처리
        setLlmSettings(message.payload);
      } else if (message.command === 'updateModels') { // 모델 목록 응답 처리
        setModels(message.payload);
        if (Array.isArray(message.payload) && message.payload.length > 0 && modelPollTimerRef.current) {
          clearInterval(modelPollTimerRef.current);
          modelPollTimerRef.current = null;
        }
      } else if (message.command === 'featureToggles') {
        const p = message.payload || {};
        setStreamingEnabled(!!p.streamingEnabled);
        setAdvancedHistorySummaryEnabled(!!p.advancedHistorySummaryEnabled);
      } else if (message.command === 'profilesResponse') {
        setProfiles(message.payload?.profiles || []);
        setActiveProfileId(typeof message.payload?.activeProfileId === 'string' ? message.payload.activeProfileId : null);
      } else if (message.command === 'activeProfileChanged') {
        setActiveProfileId(typeof message.payload === 'string' ? message.payload : null);
      } else if (message.command === 'profileSaved' || message.command === 'profileDeleted') {
        vscodeService.postMessage({ command: 'requestProfiles' });
      }
    };

    window.addEventListener('message', handleMessage);

    // Click-outside to close model suggestions
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (modelComboRef.current && !modelComboRef.current.contains(t)) {
        setShowModelSuggestions(false);
      }
    };
    document.addEventListener('click', onDocClick);

    // 초기 LLM 설정 요청
    vscodeService.postMessage({ command: 'requestLlmSettings' });
    vscodeService.postMessage({ command: 'requestModels' }); // 모델 목록 요청
    vscodeService.postMessage({ command: 'requestProfiles' });
    vscodeService.postMessage({ command: 'requestFeatureToggles' });

    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('click', onDocClick);
    };
  }, []);

  const handleRemoveAgent = (agentName: string) => {
    vscodeService.postMessage({ command: 'removeAgent', agentName });
  };

  const handleAddAgent = () => {
    // For now, adds a placeholder agent. A form should be implemented later.
    const newAgent: Agent = {
      path: "./agents/NewAgent.ts",
      card: {
        name: "NewAgent",
        description: "A newly added agent.",
      }
    };
    vscodeService.postMessage({ command: 'addAgent', agent: newAgent });
  };

  // 자동 저장을 위한 debounce 함수
  const debounce = (func: Function, wait: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  };

  // LLM 설정 저장 핸들러
  const saveSettings = useCallback((newSettings: LlmSettings) => {
    vscodeService.postMessage({ command: 'saveLlmSettings', payload: newSettings });
  }, []);

  // Debounced 저장 함수
  const debouncedSave = useMemo(() => debounce(saveSettings, 500), [saveSettings]);

  // LLM 설정 변경 핸들러
  const handleLlmSettingChange = (key: keyof LlmSettings, value: any) => {
    setLlmSettings(prev => {
      const newState = { ...prev, [key]: value };

      // Provider 변경 시 기본 endpoint 설정
      if (key === 'llmProvider') {
        switch (value) {
          case 'openai':
            newState.openaiEndpoint = getDefaultEndpoint('openai');
            break;
          case 'ollama':
            newState.ollamaEndpoint = getDefaultEndpoint('ollama');
            break;
          case 'anthropic':
            newState.anthropicEndpoint = getDefaultEndpoint('anthropic');
            break;
          case 'xai':
            newState.xaiEndpoint = getDefaultEndpoint('xai');
            break;
          case 'google':
            newState.googleEndpoint = getDefaultEndpoint('google');
            break;
          case 'groq':
            newState.groqEndpoint = getDefaultEndpoint('groq');
            break;
          case 'openrouter':
            newState.openrouterEndpoint = getDefaultEndpoint('openrouter');
            break;
        }
      }

      // Ollama Cloud 설정 변경 시
      if (key === 'ollamaIsCloud') {
        // 클라우드 모드일 때는 기본 엔드포인트를 빈 문자열로 두어 사용자가
        // 실제 클라우드 엔드포인트를 입력하도록 유도합니다. 로컬 모드로
        // 되돌릴 때는 기본 로컬 엔드포인트를 설정합니다.
        newState.ollamaEndpoint = value ? '' : 'http://localhost:11434';
      }

      // API Key 유효성 검사
      if (key.toLowerCase().includes('apikey')) {
        // API 키 검증은 선택된 provider와 클라우드 여부에 따라 달라집니다.
        const provider = newState.llmProvider || 'openai';
        let isValid = validateApiKey(provider, value);
        // Ollama의 클라우드 모드인 경우에는 API 키가 반드시 필요합니다.
        if (provider === 'ollama' && newState.ollamaIsCloud) {
          isValid = !!(value && value.toString().trim().length > 0);
        }
        setValidationState(prev => ({ ...prev, apiKeyValid: !!isValid }));
      }

      // Endpoint 유효성 검사
      if (key.toLowerCase().includes('endpoint')) {
        const isValid = validateEndpoint(value);
        setValidationState(prev => ({ ...prev, endpointValid: isValid }));
        // Endpoint 변경 시 모델 목록 즉시 갱신 시도
        vscodeService.postMessage({ command: 'requestModels' });
      }

      // 자동 저장
      debouncedSave(newState);

      return newState;
    });
    // Provider 변경/클라우드 토글 시 모델 목록 요청 + 빠른 폴링 시작
    if (key === 'llmProvider' || key === 'ollamaIsCloud') {
      vscodeService.postMessage({ command: 'requestModels' });
      startModelPolling();
    }
    // Endpoint 변경 시도 시에도 빠른 폴링
    if (key.toLowerCase().includes('endpoint')) {
      startModelPolling();
    }
  };

  // LLM 설정 저장 핸들러
  const handleSaveLlmSettings = () => {
    vscodeService.postMessage({ command: 'saveLlmSettings', payload: llmSettings });
    // Save or update a profile and activate it, then refresh
    const name = (profileName && profileName.trim()) || 'Default Profile';
    const provider = llmSettings.llmProvider || 'openai';
    const model = llmSettings.model || '';
    const endpointMap: any = {
      openai: llmSettings.openaiEndpoint,
      ollama: llmSettings.ollamaEndpoint,
      anthropic: llmSettings.anthropicEndpoint,
      xai: llmSettings.xaiEndpoint,
      google: llmSettings.googleEndpoint,
      groq: llmSettings.groqEndpoint,
      openrouter: llmSettings.openrouterEndpoint,
    };
    const apiKeyMap: any = {
      openai: llmSettings.openaiApiKeys,
      ollama: llmSettings.ollamaApiKey,
      anthropic: llmSettings.anthropicApiKey,
      xai: llmSettings.xaiApiKey,
      google: llmSettings.googleApiKey,
      groq: llmSettings.groqApiKey,
      openrouter: llmSettings.openrouterApiKey,
    };
    const endpoint = endpointMap[provider] || '';
    const apiKey = apiKeyMap[provider] || '';
    const profileBase: any = {
      name,
      provider,
      endpoint,
      model,
      enabled: true,
    };
    const overridesArray = Object.entries(agentOverridesDraft || {}).map(([agentName, override]) => ({
      agentName,
      model: override.model,
      useDefault: !!override.useDefault,
      profileId: override.profileId,
    })).filter(o => !o.useDefault || (o.model && o.model.trim().length > 0));
    if (overridesArray.length > 0) {
      profileBase.agentOverrides = overridesArray;
    }
    if (editingProfileId) {
      profileBase.id = editingProfileId;
    }
    const payload = {
      profile: profileBase,
      apiKey,
      activateAfterSave: true,
    };
    vscodeService.postMessage({ command: 'saveProfile', payload });
    vscodeService.postMessage({ command: 'requestProfiles' });
    vscodeService.postMessage({ command: 'requestModels' });
    // After saving, clear edit id to avoid unintended updates on next create
    setEditingProfileId(null);
  };

  // Profiles handlers (inside component)
  const startAddProfile = () => {
    // Prefill LLM Configuration for creating a new profile via Save
    setProfileName('');
    // Do not change provider automatically; keep current selection
    if (llmSectionRef.current) {
      llmSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setEditingProfileId(null);
    setAgentOverridesDraft({});
  };
  const startEditProfile = (p: any) => {
    // Prefill LLM Configuration with selected profile values
    setProfileName(p.name || '');
    setEditingProfileId(p.id || null);
    setAgentOverridesDraft(() => {
      const draft: Record<string, { useDefault: boolean; model: string; profileId?: string }> = {};
      const overrides = Array.isArray(p.agentOverrides) ? p.agentOverrides : [];
      overrides.forEach((o: any) => {
        if (!o || typeof o.agentName !== 'string') {
          return;
        }
        draft[o.agentName] = {
          useDefault: !!o.useDefault,
          model: (o.model || ''),
          profileId: typeof o.profileId === 'string' && o.profileId.length > 0 ? o.profileId : undefined,
        };
      });
      return draft;
    });
    setLlmSettings(prev => {
      const next = { ...prev } as any;
      next.llmProvider = p.provider;
      next.model = p.model || '';
      switch (p.provider) {
        case 'openai': next.openaiEndpoint = p.endpoint || next.openaiEndpoint; break;
        case 'ollama': next.ollamaEndpoint = p.endpoint || next.ollamaEndpoint; break;
        case 'anthropic': next.anthropicEndpoint = p.endpoint || next.anthropicEndpoint; break;
        case 'xai': next.xaiEndpoint = p.endpoint || next.xaiEndpoint; break;
        case 'google': next.googleEndpoint = p.endpoint || next.googleEndpoint; break;
        case 'groq': next.groqEndpoint = p.endpoint || next.groqEndpoint; break;
        case 'openrouter': next.openrouterEndpoint = p.endpoint || next.openrouterEndpoint; break;
      }
      return next;
    });
    // Scroll to LLM Configuration section
    if (llmSectionRef.current) {
      llmSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const cancelEditProfile = () => {
    setIsEditing(false);
    setEditingProfile({ name: '', provider: 'openai', endpoint: '', model: '', apiKey: '' });
    setEditingProfileId(null);
  };
  const saveProfile = () => {
    const payload = {
      profile: {
        id: editingProfile.id,
        name: editingProfile.name || 'New Profile',
        provider: editingProfile.provider,
        endpoint: editingProfile.endpoint,
        model: editingProfile.model,
        enabled: true
      },
      apiKey: editingProfile.apiKey,
      activateAfterSave: true
    };
    vscodeService.postMessage({ command: 'saveProfile', payload });
    setIsEditing(false);
  };
  const removeProfile = (id: string) => {
    vscodeService.postMessage({ command: 'deleteProfile', payload: { id } });
  };
  const activateProfile = (id: string) => {
    vscodeService.postMessage({ command: 'setActiveProfile', payload: { id } });
  };

  // Ensure core MAS agents are always visible in the overrides list
  const mergedAgents: Agent[] = useMemo(() => {
    const defaults: Agent[] = [
      { path: './agents/OrchestratorAgent.ts', card: { name: 'OrchestratorAgent', description: 'Routes tasks and coordinates all agents.' } },
      { path: './agents/BrainstormAgent.ts', card: { name: 'BrainstormAgent', description: 'Understands complex goals and drafts execution plans.' } },
      { path: './agents/CodeEditAgent.ts', card: { name: 'CodeEditAgent', description: 'Creates and edits source files.' } },
      { path: './agents/TestGenerationAgent.ts', card: { name: 'TestGenerationAgent', description: 'Generates tests for your code.' } },
      { path: './agents/DocumentationGenerationAgent.ts', card: { name: 'DocumentationGenerationAgent', description: 'Generates documentation and comments.' } },
      { path: './agents/RefactoringSuggestionAgent.ts', card: { name: 'RefactoringSuggestionAgent', description: 'Suggests refactorings.' } },
      { path: './agents/TaskDecompositionAgent.ts', card: { name: 'TaskDecompositionAgent', description: 'Breaks large goals into concrete steps.' } },
      { path: './agents/ContextManagementAgent.ts', card: { name: 'ContextManagementAgent', description: 'Handles conversational context and Q&A.' } },
    ];

    const byName = new Map<string, Agent>();
    defaults.forEach(a => {
      if (a && a.card && a.card.name) {
        byName.set(a.card.name, a);
      }
    });
    (agents || []).forEach(a => {
      const name = a?.card?.name;
      if (name) {
        byName.set(name, a);
      }
    });
    return Array.from(byName.values());
  }, [agents]);

  return (
    <div className="settings-page-container">
      <div className="settings-section">
        <h3>Features</h3>
        <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: 8, justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Streaming Mode</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Stream LLM responses as they arrive.</div>
          </div>
          <VSCodeCheckbox
            checked={streamingEnabled}
            onChange={(e: any) => {
              const val = !!e.target.checked;
              setStreamingEnabled(val);
              vscodeService.postMessage({ command: 'setStreamingEnabled', payload: { enabled: val } });
            }}
          />
        </div>
        <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: 8, justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Enhanced History Summary (Plan-based)</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>Refresh chat history titles after each plan completes.</div>
          </div>
          <VSCodeCheckbox
            checked={advancedHistorySummaryEnabled}
            onChange={(e: any) => {
              const val = !!e.target.checked;
              setAdvancedHistorySummaryEnabled(val);
              vscodeService.postMessage({ command: 'setAdvancedHistorySummaryEnabled', payload: { enabled: val } });
            }}
          />
        </div>
      </div>
      {/* 기존 설정 섹션들 */}
      {/* LLM 설정 섹션 추가 */}
      <div className="settings-section" ref={llmSectionRef} id="llm-configuration">
        <h3>LLM Configuration</h3>
        <p>Configure your Large Language Model (LLM) provider and API settings.</p>

        <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
          <label htmlFor="profile-name" style={{ minWidth: '120px', marginRight: '10px' }}>Profile Name:</label>
          <VSCodeTextField
            id="profile-name"
            value={profileName}
            onInput={(e: any) => setProfileName(e.target.value)}
            placeholder="e.g., My Local Llama"
            style={{ flexGrow: 1 }}
          />
        </div>

        <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
          <label htmlFor="llm-provider" style={{ minWidth: '120px', marginRight: '10px' }}>LLM Provider:</label>
          <VSCodeDropdown
            id="llm-provider"
            value={llmSettings.llmProvider}
            onChange={(e: any) => handleLlmSettingChange('llmProvider', e.target.value)}
            style={{ flexGrow: 1 }}
          >
            <VSCodeOption value="openai">OpenAI</VSCodeOption>
            <VSCodeOption value="ollama">Ollama</VSCodeOption>
            <VSCodeOption value="anthropic">Anthropic</VSCodeOption>
            <VSCodeOption value="xai">xAI</VSCodeOption>
            <VSCodeOption value="google">Google</VSCodeOption>
            <VSCodeOption value="groq">Groq</VSCodeOption>
            <VSCodeOption value="openrouter">OpenRouter</VSCodeOption>
          </VSCodeDropdown>
        </div>

        <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', position: 'relative' }}>
          <label htmlFor="llm-model" style={{ minWidth: '120px', marginRight: '10px' }}>Model:</label>
          <div ref={modelComboRef} style={{ flexGrow: 1, position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
            <VSCodeButton
              appearance="secondary"
              onClick={() => { vscodeService.postMessage({ command: 'requestModels' }); startModelPolling(); }}
              title="Refresh models"
              aria-label="Refresh models"
            >
              <span className="codicon codicon-refresh" />
            </VSCodeButton>
            <VSCodeTextField
              id="llm-model"
              value={llmSettings.model}
              onInput={(e: any) => {
                handleLlmSettingChange('model', e.target.value);
                if (!showModelSuggestions && models.length > 0) setShowModelSuggestions(true);
              }}
              placeholder={models.length ? 'Type a model name or pick from the list' : 'Loading models from the endpoint...'}
              style={{ width: '100%' }}
              onFocus={() => { if (models.length > 0) setShowModelSuggestions(true); }}
            />
            <VSCodeButton appearance="secondary" onClick={() => setShowModelSuggestions(v => !v)} title="Show models" aria-label="Show models">
              <span className="codicon codicon-chevron-down" />
            </VSCodeButton>
            {models.length > 0 && showModelSuggestions && (
              <div className="suggestions-popup" style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0 }}>
                {(llmSettings.model ? models.filter(m => m.toLowerCase().includes((llmSettings.model || '').toLowerCase())) : models)
                  .slice(0, 50)
                  .map(m => (
                    <div key={m} className="suggestion-item" onClick={() => { handleLlmSettingChange('model', m); setShowModelSuggestions(false); }}>
                      <span className="suggestion-command">{m}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {llmSettings.llmProvider === 'openai' && (
          <ProviderSettings
            apiKey={llmSettings.openaiApiKeys}
            endpoint={llmSettings.openaiEndpoint}
            onApiKeyChange={(value) => handleLlmSettingChange('openaiApiKeys', value)}
            onEndpointChange={(value) => handleLlmSettingChange('openaiEndpoint', value)}
            apiKeyPlaceholder="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            endpointPlaceholder="https://api.openai.com/v1"
            apiKeyLabel="OpenAI API Keys (comma-separated):"
          />
        )}

        {llmSettings.llmProvider === 'ollama' && (
          <>
            <ProviderSettings
              apiKey={llmSettings.ollamaApiKey}
              endpoint={llmSettings.ollamaEndpoint}
              onApiKeyChange={(value) => handleLlmSettingChange('ollamaApiKey', value)}
              onEndpointChange={(value) => handleLlmSettingChange('ollamaEndpoint', value)}
              apiKeyPlaceholder="Optional Bearer token"
              endpointPlaceholder={llmSettings.ollamaIsCloud ? 'https://ollama.com' : 'http://localhost:11434'}
              apiKeyLabel="Ollama API Key:"
              apiKeyHelpTooltip="optional"
            />
            <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', justifyContent: 'flex-end' }}>
              <label htmlFor="ollama-is-cloud" style={{ marginRight: '5px' }}>Cloud Hosted?</label>
              <VSCodeCheckbox
                id="ollama-is-cloud"
                checked={llmSettings.ollamaIsCloud}
                onChange={(e: any) => handleLlmSettingChange('ollamaIsCloud', e.target.checked)}
              />
            </div>
          </>
        )}

        {llmSettings.llmProvider === 'anthropic' && (
          <ProviderSettings
            apiKey={llmSettings.anthropicApiKey}
            endpoint={llmSettings.anthropicEndpoint}
            onApiKeyChange={(value) => handleLlmSettingChange('anthropicApiKey', value)}
            onEndpointChange={(value) => handleLlmSettingChange('anthropicEndpoint', value)}
            apiKeyPlaceholder="sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            endpointPlaceholder="https://api.anthropic.com/v1"
            apiKeyLabel="Anthropic API Key:"
          />
        )}

        {llmSettings.llmProvider === 'xai' && (
          <ProviderSettings
            apiKey={llmSettings.xaiApiKey}
            endpoint={llmSettings.xaiEndpoint}
            onApiKeyChange={(value) => handleLlmSettingChange('xaiApiKey', value)}
            onEndpointChange={(value) => handleLlmSettingChange('xaiEndpoint', value)}
            apiKeyPlaceholder="sk-xai-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            endpointPlaceholder="https://api.xai.com/v1"
            apiKeyLabel="xAI API Key:"
          />
        )}

        {llmSettings.llmProvider === 'google' && (
          <ProviderSettings
            apiKey={llmSettings.googleApiKey}
            endpoint={llmSettings.googleEndpoint}
            onApiKeyChange={(value) => handleLlmSettingChange('googleApiKey', value)}
            onEndpointChange={(value) => handleLlmSettingChange('googleEndpoint', value)}
            apiKeyPlaceholder="AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            endpointPlaceholder="https://generativelanguage.googleapis.com/v1beta"
            apiKeyLabel="Google API Key:"
          />
        )}

        {llmSettings.llmProvider === 'groq' && (
          <ProviderSettings
            apiKey={llmSettings.groqApiKey}
            endpoint={llmSettings.groqEndpoint}
            onApiKeyChange={(value) => handleLlmSettingChange('groqApiKey', value)}
            onEndpointChange={(value) => handleLlmSettingChange('groqEndpoint', value)}
            apiKeyPlaceholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            endpointPlaceholder="https://api.groq.com/openai/v1"
            apiKeyLabel="Groq API Key:"
          />
        )}

        {llmSettings.llmProvider === 'openrouter' && (
          <ProviderSettings
            apiKey={llmSettings.openrouterApiKey}
            endpoint={llmSettings.openrouterEndpoint}
            onApiKeyChange={(value) => handleLlmSettingChange('openrouterApiKey', value)}
            onEndpointChange={(value) => handleLlmSettingChange('openrouterEndpoint', value)}
            apiKeyPlaceholder="sk-or-v2-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            endpointPlaceholder="https://openrouter.ai/api/v1"
            apiKeyLabel="OpenRouter API Key:"
          />
        )}

        <VSCodeButton onClick={handleSaveLlmSettings} style={{ marginTop: '10px' }}>Save LLM Settings</VSCodeButton>
      </div>

      <VSCodeDivider />

      <div className="settings-section">
        <h3>LLM Profiles</h3>
        <p>Manage multiple LLM endpoints and quickly switch between them.</p>
        {/* Inline edit form removed. Use LLM Configuration section for editing/creating profiles. */}

        <div className="profile-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {profiles.length === 0 ? (
            <div style={{ opacity: 0.8 }}>No profiles yet.</div>
          ) : profiles.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--vscode-panel-border)', padding: 8, borderRadius: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <strong>{p.name}{activeProfileId === p.id ? ' (Active)' : ''}</strong>
                <span style={{ opacity: 0.8, fontSize: 12 }}>{p.provider}</span>
                <span style={{ opacity: 0.8, fontSize: 12 }}>{p.model}</span>
                <span style={{ opacity: 0.8, fontSize: 12 }}>{p.endpoint}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <VSCodeButton onClick={() => startEditProfile(p)}>Edit</VSCodeButton>
                <VSCodeButton onClick={() => activateProfile(p.id)} disabled={activeProfileId === p.id}>Activate</VSCodeButton>
                <VSCodeButton appearance="secondary" onClick={() => removeProfile(p.id)}>Delete</VSCodeButton>
              </div>
            </div>
          ))}
        </div>

        <div className="settings-subsection" style={{ marginTop: '16px' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setShowAgentOverrides(v => !v)}
          >
            <h4 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              <span className={`codicon ${showAgentOverrides ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
              <span>Per-Agent LLM Overrides (Advanced)</span>
            </h4>
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              {showAgentOverrides ? 'Hide overrides' : 'Show overrides'}
            </span>
          </div>
          <p style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
            Configure custom models for specific agents. When "Use Default" is checked, the agent will use the active profile&apos;s model.
          </p>
          {showAgentOverrides && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <VSCodeTextField
                  value={profileName}
                  onInput={(e: any) => setProfileName(e.target.value)}
                  placeholder="Overrides profile name (e.g., Coding vs. Docs)"
                  style={{ flexGrow: 1, minWidth: 220 }}
                />
                <VSCodeButton appearance="primary" onClick={handleSaveLlmSettings}>
                  Save &amp; Activate Profile
                </VSCodeButton>
              </div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                Active profile: {activeProfileId ? (profiles.find(p => p.id === activeProfileId)?.name || activeProfileId) : 'None'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {mergedAgents.map(agent => {
                  const agentName = agent.card?.name || agent.path || 'UnknownAgent';
                  const override = agentOverridesDraft[agentName] || { useDefault: true, model: '', profileId: undefined };
                  const effectiveProfileId = override.profileId || activeProfileId || '';
                  const allModels: string[] = Array.from(new Set([
                    ...profiles.map(p => (p.model || '').trim()).filter(m => !!m),
                    ...(models || []).map(m => (m || '').trim()).filter(m => !!m),
                  ]));
                  return (
                    <div key={agentName} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{agentName}</div>
                        <div style={{ opacity: 0.7, fontSize: 11 }}>{agent.card?.description}</div>
                        <div style={{ marginTop: 2 }}>
                          <VSCodeCheckbox
                            checked={override.useDefault}
                            onChange={(e: any) => {
                              const checked = !!e.target.checked;
                              setAgentOverridesDraft(prev => {
                                const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                                return {
                                  ...prev,
                                  [agentName]: { ...prevEntry, useDefault: checked },
                                };
                              });
                            }}
                          >
                            Use Default
                          </VSCodeCheckbox>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 240 }}>
                        <div style={{ fontSize: 11, opacity: 0.7, alignSelf: 'stretch', textAlign: 'right' }}>Profile</div>
                        <VSCodeDropdown
                          style={{ width: '100%' }}
                          disabled={override.useDefault || profiles.length === 0}
                          value={effectiveProfileId}
                          onChange={(e: any) => {
                            const value = (e.target.value || '').toString();
                            setAgentOverridesDraft(prev => {
                              const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                              return {
                                ...prev,
                                [agentName]: { ...prevEntry, profileId: value || undefined },
                              };
                            });
                          }}
                        >
                          <VSCodeOption value="">
                            {activeProfileId
                              ? `Active Profile (${profiles.find(p => p.id === activeProfileId)?.name || activeProfileId})`
                              : 'Active Profile'}
                          </VSCodeOption>
                          {profiles.map(p => (
                            <VSCodeOption key={p.id} value={p.id}>{p.name}</VSCodeOption>
                          ))}
                        </VSCodeDropdown>
                        <div style={{ fontSize: 11, opacity: 0.7, alignSelf: 'stretch', textAlign: 'right' }}>Model</div>
                        {allModels.length > 0 ? (
                          <VSCodeDropdown
                            style={{ width: '100%' }}
                            disabled={override.useDefault}
                            value={override.model || ''}
                            onChange={(e: any) => {
                              const value = (e.target.value || '').toString();
                              setAgentOverridesDraft(prev => {
                                const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                                return {
                                  ...prev,
                                  [agentName]: { ...prevEntry, useDefault: false, model: value },
                                };
                              });
                            }}
                          >
                            <VSCodeOption value="">(Use profile model)</VSCodeOption>
                            {allModels.map(m => (
                              <VSCodeOption key={m} value={m}>{m}</VSCodeOption>
                            ))}
                          </VSCodeDropdown>
                        ) : (
                          <VSCodeTextField
                            style={{ width: '100%' }}
                            disabled={override.useDefault}
                            value={override.model || ''}
                            placeholder="Custom model name"
                            onInput={(e: any) => {
                              const value = (e.target.value || '').toString();
                              setAgentOverridesDraft(prev => {
                                const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                                return {
                                  ...prev,
                                  [agentName]: { ...prevEntry, useDefault: false, model: value },
                                };
                              });
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="settings-section">
        <h3>MCP Connectors</h3>
        <p>Manage your connections to Multi-Agent Communication Protocol (MCP) servers.</p>
        <VSCodeButton onClick={() => vscodeService.postMessage({ command: 'openFile', filePath: '.agent/mcp-servers.json' })}>Open mcp-servers.json</VSCodeButton>
      </div>

      <VSCodeDivider />

      <div className="settings-section">
        <h3>A2A Agents</h3>
        <p>Manage the Agent-to-Agent (A2A) agents available in this workspace.</p>
        <div className="agent-list">
          {agents.map(agent => (
            <div key={agent.card.name} className="agent-item">
              <div className="agent-info">
                <strong>{agent.card.name}</strong>
                <p>{agent.card.description}</p>
              </div>
              <VSCodeButton appearance="secondary" onClick={() => handleRemoveAgent(agent.card.name)}>
                Remove
              </VSCodeButton>
            </div>
          ))}
        </div>
        <VSCodeButton onClick={() => vscodeService.postMessage({ command: 'openFile', filePath: '.agent/a2a-servers.json' })}>Open a2a-servers.json</VSCodeButton>
      </div>

      <VSCodeDivider />

      <div className="settings-section">
        <h3>Prompt Settings</h3>
        <p>Configure the main prompt for the Orchestrator Agent.</p>
        <VSCodeButton onClick={() => vscodeService.postMessage({ command: 'openFile', filePath: '.agent/AGENT.md' })}>Open AGENT.md</VSCodeButton>
      </div>
    </div>
  );
};