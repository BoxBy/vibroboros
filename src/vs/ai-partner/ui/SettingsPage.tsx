import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
// Force refresh: 2025-12-10 19:35
import { VSCodeButton, VSCodeDivider, VSCodeDropdown, VSCodeOption, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
import { vscodeService } from './services/vscode';
import { ProviderSettings } from './components/LLMProviderSettings';
import { validateApiKey, validateEndpoint, getDefaultEndpoint } from './utils/validation';



// Agent interface for internal Viper agents (from ConfigService.getInternalAgents())
interface InternalAgent {
  name: string;
  description: string;
}

// Legacy Agent interface for A2A agents
interface Agent {
  path: string;
  card: {
    name: string;
    description: string;
  };
}

import { VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react'; // 추가

// LLM 설정 인터페이스 - 단순화된 구조
interface LlmSettings {
  llmProvider: 'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter' | 'zai' | undefined;
  endpoint: string;  // 통합된 endpoint
  apiKey: string;    // 통합된 API key
  ollamaIsCloud: boolean;
  isCodingPlan: boolean;
  model: string;
  modelMaxContext?: number;
}

interface SettingsPageProps {
  models?: string[];
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ models: propModels = [] }) => {
  // 유효성 검사 상태
  const [validationState, setValidationState] = useState<{
    apiKeyValid: boolean;
    endpointValid: boolean;
  }>({
    apiKeyValid: true,
    endpointValid: true
  });
  const [agents, setAgents] = useState<InternalAgent[]>([]); // Changed to InternalAgent[]
  // LLM 설정 상태 추가
  const [llmSettings, setLlmSettings] = useState<LlmSettings>({
    llmProvider: undefined,
    endpoint: '',
    apiKey: '',
    ollamaIsCloud: false,
    isCodingPlan: false,
    model: '',
    modelMaxContext: 0,
  });
  const [models, setModels] = useState<Array<{ id: string; maxContext?: number }>>([]);
  console.log('[SettingsPage] Component rendering, models state:', models.length);
  // Profiles state
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; provider: string; endpoint: string; model: string; apiKey?: string; enabled?: boolean; isDefault?: boolean; agentOverrides?: { [agentName: string]: string } }>>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const [editingProfile, setEditingProfile] = useState<{ id?: string; name: string; provider: string; endpoint: string; model: string; apiKey: string; notes?: string; timeout?: number }>({ name: '', provider: 'openai', endpoint: '', model: '', apiKey: '' });
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const llmSectionRef = useRef<HTMLDivElement | null>(null);
  const perAgentSectionRef = useRef<HTMLDivElement | null>(null);
  const modelComboRef = useRef<HTMLDivElement | null>(null);
  const [showModelSuggestions, setShowModelSuggestions] = useState<boolean>(false);
  const modelPollTimerRef = useRef<any>(null);
  const modelPollDeadlineRef = useRef<number>(0);
  // Feature toggles
  const [streamingEnabled, setStreamingEnabled] = useState<boolean>(false);
  const [advancedHistorySummaryEnabled, setAdvancedHistorySummaryEnabled] = useState<boolean>(false);
  const [agentOverridesDraft, setAgentOverridesDraft] = useState<Record<string, { useDefault: boolean; model: string; endpoint?: string; profileId?: string; useExternal?: boolean; externalUrl?: string }>>({});
  const [showAgentOverrides, setShowAgentOverrides] = useState<boolean>(false);
  const [showLlmConfiguration, setShowLlmConfiguration] = useState<boolean>(false);

  // Group collapse/expand state
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    basicSettings: true,
    llmSettings: true,
    advancedLlmSettings: false,
    advancedSettings: false,
    webSearchSettings: false,
    serverConnections: false,
  });

  // Web Search Settings state
  const [webSearchProvider, setWebSearchProvider] = useState<'tavily' | 'google' | 'brave' | 'custom'>('tavily');
  const [webSearchApiKey, setWebSearchApiKey] = useState<string>('');
  const [webSearchEndpoint, setWebSearchEndpoint] = useState<string>('');

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };
  
  // New Settings
  const [summarizeTokenLimit, setSummarizeTokenLimit] = useState<number>(0.75);
  const [systemPromptTokenCount, setSystemPromptTokenCount] = useState<number | null>(null);

  const [thinkingLanguage, setThinkingLanguage] = useState<string>('English');
  const [userLanguage, setUserLanguage] = useState<string>('English');
  const [maxContextOverride, setMaxContextOverride] = useState<number | undefined>(undefined);
  const [useVSCodeThinkingLang, setUseVSCodeThinkingLang] = useState<boolean>(false);
  const [useVSCodeUserLang, setUseVSCodeUserLang] = useState<boolean>(false);

  // Advanced Global Settings
  const [globalRequestTimeout, setGlobalRequestTimeout] = useState<number>(60000);
  const [globalTemperature, setGlobalTemperature] = useState<number>(0.1);
  const [safetyBufferRatio, setSafetyBufferRatio] = useState<number>(0.9);
  const [globalReasoningEffort, setGlobalReasoningEffort] = useState<'low' | 'medium' | 'high'>('medium');

  // Advanced Security & Automation
  const [strictMode, setStrictMode] = useState<boolean>(false);
  const [reviewPolicy, setReviewPolicy] = useState<'always' | 'agent-decides' | 'never'>('agent-decides');
  const [terminalAutoExecution, setTerminalAutoExecution] = useState<boolean>(false);
  const [fileAccessPolicy, setFileAccessPolicy] = useState<'allow-all' | 'request-each' | 'read-only'>('request-each');

  // startModelPolling은 더 이상 필요 없음 (MainView가 models를 관리)
  const startModelPolling = useCallback((durationMs: number = 20000, intervalMs: number = 2000) => {
    // No-op: MainView handles model loading via availableModels prop
    console.log('[SettingsPage] startModelPolling called but disabled (MainView handles models)');
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      console.log('[SettingsPage] handleMessage received:', message.command);
      
      if (message.command === 'updateModels') {
        console.log('[SettingsPage] Processing updateModels directly:', Array.isArray(message.payload) ? message.payload.length : 0, 'models');
        // payload elements might be strings or objects. Ensure we store objects with id.
        const normalizedModels = (message.payload || []).map((m: any) => typeof m === 'string' ? { id: m } : m);
        setModels(normalizedModels);
        return;
      }

      if (message.command === 'agentListResponse' || message.command === 'agentsResponse' || message.command === 'updateAgentList') {
        const agents = message.payload || message.agents || [];
        setAgents(agents);
      } else if (message.command === 'llmSettingsResponse') { // LLM 설정 응답 처리
        const p = message.payload;
        if (p) {
          const provider = p.llmProvider;
          setLlmSettings({
            llmProvider: provider,
            endpoint: p.endpoint || (provider === 'openai' ? p.openaiEndpoint :
                       provider === 'ollama' ? p.ollamaEndpoint :
                       provider === 'anthropic' ? p.anthropicEndpoint :
                       provider === 'xai' ? p.xaiEndpoint :
                       provider === 'google' ? p.googleEndpoint :
                       provider === 'groq' ? p.groqEndpoint :
                       provider === 'openrouter' ? p.openrouterEndpoint :
                        provider === 'zai' ? p.zaiEndpoint : '') || '',
             apiKey: p.apiKey || (provider === 'openai' ? p.openaiApiKeys :
                      provider === 'ollama' ? p.ollamaApiKey :
                      provider === 'anthropic' ? p.anthropicApiKey :
                      provider === 'xai' ? p.xaiApiKey :
                      provider === 'google' ? p.googleApiKey :
                      provider === 'groq' ? p.groqApiKey :
                      provider === 'openrouter' ? p.openrouterApiKey :
                      provider === 'zai' ? p.zaiApiKey : '') || '',
            ollamaIsCloud: !!p.ollamaIsCloud,
            isCodingPlan: !!p.isCodingPlan,
            model: p.model || '',
            modelMaxContext: p.modelMaxContext
          });
        }
      } else if (message.command === 'featureToggles') {
        const p = message.payload || {};
        setStreamingEnabled(!!p.streamingEnabled);
        setAdvancedHistorySummaryEnabled(!!p.advancedHistorySummaryEnabled);
        if (typeof p.summarizeTokenLimit === 'number') setSummarizeTokenLimit(p.summarizeTokenLimit);
        if (typeof p.thinkingLanguage === 'string') setThinkingLanguage(p.thinkingLanguage);
        if (typeof p.userLanguage === 'string') setUserLanguage(p.userLanguage);
         if (p.maxContextOverride !== undefined) setMaxContextOverride(p.maxContextOverride);
        if (p.useVSCodeThinkingLang !== undefined) setUseVSCodeThinkingLang(p.useVSCodeThinkingLang);
        if (p.useVSCodeUserLang !== undefined) setUseVSCodeUserLang(p.useVSCodeUserLang);
        
        // Global LLM defaults
        if (typeof p.globalRequestTimeout === 'number') setGlobalRequestTimeout(p.globalRequestTimeout);
        if (typeof p.globalTemperature === 'number') setGlobalTemperature(p.globalTemperature);
        if (typeof p.safetyBufferRatio === 'number') setSafetyBufferRatio(p.safetyBufferRatio);
        if (p.globalReasoningEffort) setGlobalReasoningEffort(p.globalReasoningEffort);
      } else if (message.command === 'systemPromptTokenCount') {
        if (typeof message.payload === 'number') setSystemPromptTokenCount(message.payload);
      } else if (message.command === 'profilesResponse') {
        setProfiles(message.payload?.profiles || []);
        setActiveProfileId(typeof message.payload?.activeProfileId === 'string' ? message.payload.activeProfileId : null);
      } else if (message.command === 'activeProfileChanged') {
        console.log('[SettingsPage] activeProfileChanged received:', message.payload);
        setActiveProfileId(typeof message.payload === 'string' ? message.payload : null);
      } else if (message.command === 'profileSaved' || message.command === 'profileDeleted') {
        if (message.command === 'profileSaved') {
          setEditingProfileId(prev => {
             if (!prev && message.payload?.id) {
                 return message.payload.id;
             }
             return prev;
          });
        }
        vscodeService.postMessage({ command: 'requestProfiles' });
      } else if (message.command === 'configuredItemsUpdate') {
         setConfiguredItems(message.payload);
         // Update health status if provided
         if (message.payload?.healthStatus) {
           const { mcp, a2a } = message.payload.healthStatus;
           if (mcp) {
             setMcpHealthStatus(mcp);
           }
           if (a2a) {
             setA2aHealthStatus(a2a);
           }
         }
      } else if (message.command === 'modelMaxContextUpdated') {
         console.log('[SettingsPage] modelMaxContextUpdated received:', message.payload);
         setLlmSettings(prev => ({ ...prev, modelMaxContext: message.payload }));
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
    vscodeService.postMessage({ command: 'requestAgentList' });
    vscodeService.postMessage({ command: 'requestLlmSettings' });
    // requestModels는 MainView가 처리함 (propModels로 전달받음)
    vscodeService.postMessage({ command: 'requestProfiles' });
    vscodeService.postMessage({ command: 'requestFeatureToggles' });
    vscodeService.postMessage({ command: 'refreshConfiguredItems' }); // Request items on mount
    vscodeService.postMessage({ command: 'requestAgents' }); // Request internal agents for Per-Agent LLM Override
    vscodeService.postMessage({ command: 'requestSystemPromptTokenCount' }); // Measure actual system prompt token count

    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('click', onDocClick);
    };
  }, []);

  const [configuredItems, setConfiguredItems] = useState<{ mcp: string[]; a2a: string[]; prompts: { name: string; content: string }[] }>({ mcp: [], a2a: [], prompts: [] });
  const [mcpExpanded, setMcpExpanded] = useState(false);
  const [a2aExpanded, setA2aExpanded] = useState(false);
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({});

  // Inline input state for MCP and A2A
  const [mcpNameInput, setMcpNameInput] = useState('');
  const [mcpCommandInput, setMcpCommandInput] = useState('');
  const [mcpArgsInput, setMcpArgsInput] = useState('');
  const [a2aNameInput, setA2aNameInput] = useState('');
  const [a2aUrlInput, setA2aUrlInput] = useState('');
  const [a2aDescInput, setA2aDescInput] = useState('');
  // Health status for MCP and A2A servers
  const [mcpHealthStatus, setMcpHealthStatus] = useState<Record<string, { status: 'healthy' | 'unhealthy' | 'unknown'; message?: string; tools?: string[] }>>({});
  const [a2aHealthStatus, setA2aHealthStatus] = useState<Record<string, { status: 'healthy' | 'unhealthy' | 'unknown'; message?: string }>>({});
  const [expandedServerTools, setExpandedServerTools] = useState<Record<string, boolean>>({});
  
  // MCP Enable/Disable State
  const [mcpEnabledState, setMcpEnabledState] = useState<{
      servers: Record<string, boolean>;
      tools: Record<string, Record<string, boolean>>;
  }>({ servers: {}, tools: {} });

  // Initialize enabled state when health status updates
  useEffect(() => {
    setMcpEnabledState(prev => {
        const newServers = { ...prev.servers };
        const newTools = { ...prev.tools };
        
        configuredItems.mcp.forEach(server => {
            if (newServers[server] === undefined) {
                newServers[server] = true; // Default enabled
            }
            const tools = mcpHealthStatus[server]?.tools || [];
            if (!newTools[server]) {
                newTools[server] = {};
            }
            tools.forEach(tool => {
                if (newTools[server][tool] === undefined) {
                    newTools[server][tool] = true; // Default enabled
                }
            });
        });
        return { servers: newServers, tools: newTools };
    });
  }, [configuredItems.mcp, mcpHealthStatus]);

  const toggleServerEnabled = (server: string, current: boolean) => {
      const newState = !current;
      setMcpEnabledState(prev => ({
          ...prev,
          servers: { ...prev.servers, [server]: newState }
      }));
      // Also updates backend
      vscodeService.postMessage({ command: 'updateMcpServerState', payload: { server, enabled: newState } });
  };

  const toggleToolEnabled = (server: string, tool: string, current: boolean) => {
      const newState = !current;
      setMcpEnabledState(prev => ({
          ...prev,
          tools: {
              ...prev.tools,
              [server]: {
                  ...(prev.tools[server] || {}),
                  [tool]: newState
              }
          }
      }));
       // Also updates backend
       vscodeService.postMessage({ command: 'updateMcpToolState', payload: { server, tool, enabled: newState } });
  };

  const toggleServerTools = (serverId: string) => {
      setExpandedServerTools(prev => ({
          ...prev,
          [serverId]: !prev[serverId]
      }));
  };

  const togglePrompt = (agentName: string) => {
    setExpandedPrompts(prev => ({
      ...prev,
      [agentName]: !prev[agentName]
    }));
  };

  const handleRemoveAgent = (agentName: string) => {
    vscodeService.postMessage({ command: 'removeAgent', agentName });
  };

  // MCP/A2A 서버 추가 핸들러
  const handleAddMcpServer = () => {
    if (!mcpNameInput.trim() || !mcpCommandInput.trim() || !mcpArgsInput.trim()) {
      vscodeService.postMessage({
        command: 'showInformationMessage',
        payload: 'Please fill in all MCP server fields before adding.'
      });
      return;
    }
    vscodeService.postMessage({
      command: 'addMcpServer',
      payload: {
        name: mcpNameInput.trim(),
        command: mcpCommandInput.trim(),
        args: mcpArgsInput.trim()
      }
    });
    // 입력 필드 초기화
    setMcpNameInput('');
    setMcpCommandInput('');
    setMcpArgsInput('');
  };

  const handleAddA2aServer = () => {
    if (!a2aNameInput.trim() || !a2aUrlInput.trim()) {
      vscodeService.postMessage({
        command: 'showInformationMessage',
        payload: 'Please fill in all A2A server fields before adding.'
      });
      return;
    }
    vscodeService.postMessage({
      command: 'addA2aServer',
      payload: {
        name: a2aNameInput.trim(),
        url: a2aUrlInput.trim()
      }
    });
    // 입력 필드 초기화
    setA2aNameInput('');
    setA2aUrlInput('');
    setA2aDescInput('');
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

  // LLM 설정 컨테이너 끝

  // LLM 설정 변경 핸들러
  const handleLlmSettingChange = (key: keyof LlmSettings, value: any) => {
    setLlmSettings(prev => {
      const newState = { ...prev, [key]: value };

      // Provider 변경 시 기본 endpoint 설정
      if (key === 'llmProvider') {
        newState.endpoint = getDefaultEndpoint(value);
      }

      // Ollama Cloud 설정 변경 시
      if (key === 'ollamaIsCloud') {
        // 클라우드 모드일 때는 기본 엔드포인트를 빈 문자열로 두어 사용자가
        // 실제 클라우드 엔드포인트를 입력하도록 유도합니다. 로컬 모드로
        // 되돌릴 때는 기본 로컬 엔드포인트를 설정합니다.
        if (newState.llmProvider === 'ollama') {
          newState.endpoint = value ? '' : 'http://localhost:11434';
        }
      }

      // Z.ai Coding Plan 설정 변경 시
      if (key === 'isCodingPlan') {
        // Coding Plan 모드일 때는 coding endpoint, 아닐 때는 일반 endpoint
        if (newState.llmProvider === 'zai') {
          newState.endpoint = value ? 'https://api.z.ai/api/coding/paas/v4' : 'https://api.z.ai/api/paas/v4';
        }
      }

      // API Key 유효성 검사
      if (key === 'apiKey') {
        const provider = newState.llmProvider || 'openai';
        let isValid = validateApiKey(provider, value);
        // Ollama의 클라우드 모드인 경우에는 API 키가 반드시 필요합니다.
        if (provider === 'ollama' && newState.ollamaIsCloud) {
          isValid = !!(value && value.toString().trim().length > 0);
        }
        setValidationState(prev => ({ ...prev, apiKeyValid: !!isValid }));
      }

      // Endpoint 유효성 검사
      if (key === 'endpoint') {
        const isValid = validateEndpoint(value);
        setValidationState(prev => ({ ...prev, endpointValid: isValid }));
        // Endpoint 변경 시 모델 목록 즉시 갱신 시도 - use current input values
        vscodeService.postMessage({ command: 'requestModels', payload: { provider: newState.llmProvider, endpoint: newState.endpoint, apiKey: newState.apiKey } });
      }

      return newState;
    });
    // Provider 변경/클라우드 토글 시 모델 목록 요청 + 빠른 폴링 시작
    if (key === 'llmProvider' || key === 'ollamaIsCloud' || key === 'isCodingPlan') {
      const provider = key === 'llmProvider' ? value : llmSettings.llmProvider;
      let endpointForRequest = llmSettings.endpoint;
      const apiKeyForRequest = llmSettings.apiKey;
      if (key === 'llmProvider') {
        endpointForRequest = getDefaultEndpoint(value);
      } else if (key === 'ollamaIsCloud' && provider === 'ollama') {
        endpointForRequest = value ? '' : 'http://localhost:11434';
      } else if (key === 'isCodingPlan' && provider === 'zai') {
        endpointForRequest = value ? 'https://api.z.ai/api/coding/paas/v4' : 'https://api.z.ai/api/paas/v4';
      }
      vscodeService.postMessage({ command: 'requestModels', payload: { provider, endpoint: endpointForRequest, apiKey: apiKeyForRequest } });
      startModelPolling();
    }
    // Endpoint 변경 시도 시에도 빠른 폴링
    if (key === 'endpoint') {
      startModelPolling();
    }
  };

  // Unified Profile Save Handler (handles both base settings and agent overrides)
  const handleSaveProfileClick = () => {
    vscodeService.postMessage({ command: 'saveLlmSettings', payload: llmSettings });
    const name = (profileName && profileName.trim()) || 'Default Profile';
    const provider = llmSettings.llmProvider || 'openai';
    const model = llmSettings.model || '';
    const endpoint = llmSettings.endpoint || '';
    const apiKey = llmSettings.apiKey || '';

    // Build agent overrides array from draft
    const overridesArray = Object.entries(agentOverridesDraft || {}).map(([agentName, override]) => ({
      agentName,
      model: override.model,
      endpoint: override.endpoint,
      useDefault: !!override.useDefault,
      useExternal: !!override.useExternal,
      externalUrl: override.externalUrl,
      profileId: override.profileId,
    })).filter(o => !o.useDefault || (o.model && o.model.trim().length > 0) || (o.endpoint && o.endpoint.trim().length > 0) || o.useExternal || o.profileId);

    const profileBase: any = {
      name,
      provider,
      endpoint,
      model,
      enabled: true,
      agentOverrides: overridesArray.length > 0 ? overridesArray : undefined,
      ollamaIsCloud: llmSettings.ollamaIsCloud,
      isCodingPlan: llmSettings.isCodingPlan,
    };

    if (editingProfileId) {
      profileBase.id = editingProfileId;
    }

    const payload = {
      profile: profileBase,
      apiKey,
      activateAfterSave: false, 
    };

    console.log('[SettingsPage] handleSaveProfileClick saving:', { name, overridesCount: overridesArray.length });
    vscodeService.postMessage({ command: 'saveProfile', payload });
    vscodeService.postMessage({ command: 'requestProfiles' });
    vscodeService.postMessage({ command: 'requestModels', payload: { provider, endpoint, apiKey } });
  };

  // Profiles handlers (inside component)
  const startAddProfile = () => {
    // Reset all fields for creating a new profile
    setProfileName('');
    setIsEditing(true);
    setShowAgentOverrides(false);
    setShowLlmConfiguration(true); // Expand LLM Configuration for new profile
    setEditingProfileId(null);
    setAgentOverridesDraft({});

    // Reset llmSettings to default values (simplified structure)
    setLlmSettings({
      llmProvider: 'openai',
      endpoint: 'https://api.openai.com/v1',
      apiKey: '',
      ollamaIsCloud: false,
      isCodingPlan: false,
      model: '',
      modelMaxContext: 0,
    });
    setModels([]); // Clear models list

    if (llmSectionRef.current) {
      llmSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const startEditProfile = (p: any) => {
    console.log('[SettingsPage] startEditProfile called with:', p);

    // Check if this is a Per-Agent profile (has agentOverrides)
    const isPerAgentProfile = Array.isArray(p.agentOverrides) && p.agentOverrides.length > 0;

    // Prefill with selected profile values
    setProfileName(p.name || '');
    setEditingProfileId(p.id || null);
    setIsEditing(true);

    // Set agent overrides draft
    setAgentOverridesDraft(() => {
      const draft: Record<string, { useDefault: boolean; model: string; endpoint?: string; profileId?: string; useExternal?: boolean; externalUrl?: string }> = {};
      const overrides = Array.isArray(p.agentOverrides) ? p.agentOverrides : [];
      overrides.forEach((o: any) => {
        if (!o || typeof o.agentName !== 'string') {
          return;
        }
        draft[o.agentName] = {
          useDefault: !!o.useDefault,
          model: (o.model || ''),
          endpoint: (o.endpoint || ''),
          profileId: typeof o.profileId === 'string' && o.profileId.length > 0 ? o.profileId : undefined,
          useExternal: !!o.useExternal,
          externalUrl: (o.externalUrl || ''),
        };
      });
      return draft;
    });

    setLlmSettings(prev => {
      const profileApiKey = p.apiKey || '';
      const next = {
        ...prev,
        llmProvider: p.provider,
        model: p.model || '',
        endpoint: p.endpoint !== undefined ? p.endpoint : getDefaultEndpoint(p.provider),
        apiKey: profileApiKey,
        ollamaIsCloud: p.ollamaIsCloud ?? (p.provider === 'ollama' && (p.endpoint?.includes('ollama.com') || false)),
        isCodingPlan: p.isCodingPlan ?? (p.provider === 'zai' && (p.endpoint?.includes('/coding/') || false)),
      };
      console.log('[SettingsPage] startEditProfile setting llmSettings:', { provider: p.provider, endpoint: p.endpoint, model: p.model, hasApiKey: !!profileApiKey, isPerAgentProfile });
      return next;
    });

    // Expand appropriate section
    // Always show LLM Configuration so users can define base LLM Settings for override profiles
    setShowLlmConfiguration(true);
    
    if (isPerAgentProfile) {
      // Per-Agent profile: expand and scroll to Per-Agent LLM Overrides section
      setShowAgentOverrides(true);
      if (perAgentSectionRef.current) {
        perAgentSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      // Regular profile
      setShowAgentOverrides(false);
      if (llmSectionRef.current) {
        llmSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // Refresh models since we might be switching context/provider
    const profileApiKey = p.apiKey || '';
    vscodeService.postMessage({ command: 'requestModels', payload: { provider: p.provider, endpoint: p.endpoint, apiKey: profileApiKey } });
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

  // Merge system agents with dynamically loaded agents from backend
  // Use agents from ConfigService.getInternalAgents() instead of hardcoded list
  const mergedAgents = useMemo(() => {
    // Convert agents to the format expected by Per-Agent LLM Override section
    return agents.map(agent => ({
      card: {
        name: agent.name,
        description: agent.description
      },
      path: agent.name // Use name as path for consistency
    }));
  }, [agents]);

  return (
    <div className="settings-page-container">
      {/* ========== Basic Settings Group ========== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          userSelect: 'none',
          marginTop: '8px',
          marginBottom: '16px'
        }}
        onClick={() => toggleGroup('basicSettings')}
      >
        <span className={`codicon codicon-${expandedGroups.basicSettings ? 'chevron-down' : 'chevron-right'}`} />
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--vscode-foreground)', opacity: 0.8 }}>Basic Settings</h2>
      </div>
      {expandedGroups.basicSettings && (
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
        
        <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: 8, justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Thinking Language</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>
              {useVSCodeThinkingLang 
                ? 'Thinking process will match your VS Code display language.' 
                : 'Thinking process will be in English (Recommended for accuracy).'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
             <VSCodeCheckbox
                checked={useVSCodeThinkingLang}
                onChange={(e: any) => {
                    const checked = !!e.target.checked;
                    setUseVSCodeThinkingLang(checked);
                    vscodeService.postMessage({ command: 'setUseVSCodeThinkingLang', payload: { use: checked } });
                    // Also update Legacy setting for backward compatibility/logging if needed
                    vscodeService.postMessage({ command: 'setThinkingLanguage', payload: { lang: checked ? 'VSCode' : 'English' } });
                }}
             />
             <span style={{ fontSize: '12px' }}>Sync with VS Code</span>
          </div>
        </div>

        <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: 8, justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600 }}>Response Language</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>
              {useVSCodeUserLang 
                ? 'Response will match your VS Code display language.' 
                : `Response will be in ${userLanguage}.`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
             <VSCodeCheckbox
                checked={useVSCodeUserLang}
                onChange={(e: any) => {
                    const checked = !!e.target.checked;
                    setUseVSCodeUserLang(checked);
                    vscodeService.postMessage({ command: 'setUseVSCodeUserLang', payload: { use: checked } });
                    if (!checked) {
                        setUserLanguage('English');
                        vscodeService.postMessage({ command: 'setUserLanguage', payload: { lang: 'English' } });
                    }
                }}
             />
             <span style={{ fontSize: '12px' }}>Sync with VS Code</span>
          </div>
        </div>
      </div>
      )}

      <VSCodeDivider style={{ margin: '16px 0' }} />

      {/* ========== LLM Settings Group ========== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          userSelect: 'none',
          marginTop: '8px',
          marginBottom: '16px'
        }}
        onClick={() => toggleGroup('llmSettings')}
      >
        <span className={`codicon codicon-${expandedGroups.llmSettings ? 'chevron-down' : 'chevron-right'}`} />
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--vscode-foreground)', opacity: 0.8 }}>LLM Settings</h2>
      </div>
      {expandedGroups.llmSettings && (
      <>
      {/* LLM Profiles 섹션 (맨 위) */}
      <div className="settings-section">
        <h3 style={{ marginTop: 0 }}>LLM Profiles</h3>
        <p>Manage multiple LLM endpoints and quickly switch between them.</p>

        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '8px', marginBottom: '12px' }}>
          <VSCodeButton onClick={startAddProfile}>New Profile</VSCodeButton>
        </div>

        <div className="profile-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!profiles || profiles.length === 0 ? (
            <div style={{ opacity: 0.8 }}>No profiles yet.</div>
          ) : profiles.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid var(--vscode-panel-border)', padding: 8, borderRadius: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <strong>{p.name}{activeProfileId === p.id ? ' (Active)' : ''}{editingProfileId === p.id ? ' (Editing)' : ''}</strong>
                {Array.isArray(p.agentOverrides) && p.agentOverrides.length > 0 ? (
                    <span style={{ opacity: 0.8, fontSize: 12, color: 'var(--vscode-charts-blue)' }}>Per-Agent Override Profile ({p.agentOverrides.length} agents)</span>
                ) : (
                    <>
                        <span style={{ opacity: 0.8, fontSize: 12 }}>{p.provider}</span>
                        <span style={{ opacity: 0.8, fontSize: 12 }}>{p.model}</span>
                        <span style={{ opacity: 0.8, fontSize: 12 }}>{p.endpoint}</span>
                    </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <VSCodeButton onClick={() => startEditProfile(p)} disabled={editingProfileId === p.id}>Edit</VSCodeButton>
                <VSCodeButton onClick={() => activateProfile(p.id)} disabled={activeProfileId === p.id}>Activate</VSCodeButton>
                <VSCodeButton appearance="secondary" onClick={() => removeProfile(p.id)}>Delete</VSCodeButton>
              </div>
            </div>
          ))}
        </div>
      </div>

      <VSCodeDivider style={{ margin: '24px 0' }} />

      {/* LLM Configuration 섹션 */}
      <div className="settings-section" ref={llmSectionRef} id="llm-configuration">
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setShowLlmConfiguration(v => !v)}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <span className={`codicon ${showLlmConfiguration ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
            <span>LLM Configuration</span>
          </h3>
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            {showLlmConfiguration ? 'Hide' : 'Show'}
          </span>
        </div>
        <p style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
          Configure your Large Language Model (LLM) provider and API settings.
        </p>
        {showLlmConfiguration && (
        <>
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
            <VSCodeOption value="zai">Z.ai</VSCodeOption>
          </VSCodeDropdown>
        </div>

        <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', position: 'relative' }}>
          <label htmlFor="llm-model" style={{ minWidth: '120px', marginRight: '10px' }}>Model:</label>
          <div ref={modelComboRef} style={{ flexGrow: 1, position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
            <VSCodeButton
              appearance="secondary"
              onClick={() => {
                const provider = llmSettings.llmProvider;
                const endpoint = llmSettings.endpoint;
                const apiKey = llmSettings.apiKey;
                vscodeService.postMessage({ command: 'requestModels', payload: { provider, endpoint, apiKey, forceRefresh: true } });
                // Also fetch max context for current model if not set
                if (llmSettings.model && !llmSettings.modelMaxContext) {
                  vscodeService.postMessage({ command: 'selectModel', payload: { model: llmSettings.model, apiKey } });
                }
              }}
              title="Refresh models and fetch max context"
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
            {showModelSuggestions && (
              <div className="suggestions-popup" style={{ 
                position: 'absolute', 
                top: '100%', 
                left: 0, 
                right: 0, 
                zIndex: 1000, 
                background: 'var(--vscode-dropdown-background)', 
                border: '1px solid var(--vscode-dropdown-border)', 
                borderRadius: '4px', 
                maxHeight: '300px', 
                minHeight: '35px',
                height: 'fit-content',
                overflowY: 'auto', 
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)', 
                marginTop: '4px' 
              }}>
                {(() => {
                  if (models.length === 0) {
                    return (
                      <div style={{ padding: '8px 12px', opacity: 0.7, fontSize: '12px', color: 'var(--vscode-foreground)' }}>
                        No models found. Click Refresh to load.
                      </div>
                    );
                  }
                  
                  return models.map((m) => {
                    const modelId = m.id;
                    const maxContext = m.maxContext;
                    return (
                      <div
                        key={modelId}
                        className="suggestion-item"
                        onClick={() => {
                          handleLlmSettingChange('model', modelId);
                          setShowModelSuggestions(false);
                          // Send selectModel command to fetch model info (max context) - use current input values
                          vscodeService.postMessage({
                            command: 'selectModel',
                            payload: { model: modelId, apiKey: llmSettings.apiKey, endpoint: llmSettings.endpoint }
                          });
                        }}
                        style={{
                          padding: '6px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--vscode-dropdown-border)',
                          color: 'var(--vscode-foreground)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          background: 'transparent'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <span className="suggestion-command">{modelId}</span>
                        {maxContext && (
                          <span style={{ fontSize: '11px', opacity: 0.6, marginLeft: '8px' }}>
                            {maxContext >= 1000 ? `${Math.round(maxContext / 1000)}k` : maxContext} ctx
                          </span>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Max Context Window Setting */}
        <div className="setting-item" style={{ display: 'flex', flexDirection: 'column', marginBottom: '10px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ minWidth: '120px', fontSize: '13px' }}>Max Context:</label>
                <VSCodeTextField
                    value={maxContextOverride !== undefined ? String(maxContextOverride) : ''}
                    onInput={(e: any) => {
                        const val = parseInt(e.target.value);
                        const newVal = isNaN(val) ? undefined : val;
                        setMaxContextOverride(newVal);
                        vscodeService.postMessage({ command: 'setMaxContextOverride', payload: { limit: newVal } });
                    }}
                    placeholder={String(llmSettings.modelMaxContext || 8192)}
                    style={{ width: '120px' }}
                />
                <span style={{ fontSize: '12px', opacity: 0.7 }}>tokens</span>
             </div>
             {!maxContextOverride && (!llmSettings.modelMaxContext || llmSettings.modelMaxContext === 8192) && (
                <div style={{ color: 'var(--vscode-charts-yellow)', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '130px' }}>
                     <span className="codicon codicon-warning"></span>
                     <span>Default limit (8192). Enter manually above if model supports more.</span>
                </div>
            )}
            <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '2px', marginLeft: '130px' }}>
                Leave empty to use auto-detected limit.
            </div>
        </div>


        <div className="setting-item" style={{ display: 'flex', flexDirection: 'column', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', gap: '10px' }}>
             <label style={{ minWidth: '120px', flexShrink: 0 }}>Summarize %:</label>
             <input
               type="text"
               value={(summarizeTokenLimit * 100).toString()}
               onChange={(e: any) => {
                   let val = parseFloat(e.target.value);
                   if (!isNaN(val)) {
                       if (val > 100) val = 100;
                       if (val < 0) val = 0;
                       setSummarizeTokenLimit(val / 100);
                   }
               }}
               onBlur={(e: any) => {
                   let val = parseFloat(e.target.value);
                   if (!isNaN(val)) {
                       if (val > 100) val = 100;
                       if (val < 0) val = 0;
                       vscodeService.postMessage({ command: 'setSummarizeTokenLimit', payload: { limit: val / 100 } });
                   }
               }}
               placeholder="75"
               style={{ 
                   backgroundColor: 'var(--vscode-input-background)',
                   color: 'var(--vscode-input-foreground)',
                   border: '1px solid var(--vscode-input-border)',
                   borderRadius: '2px',
                   padding: '3px 5px',
                   width: '28px',
                   height: '24px',
                   fontFamily: 'var(--vscode-font-family)',
                   fontSize: 'var(--vscode-font-size)',
                   outline: 'none',
                   textAlign: 'right'
               }}
             />
             <span style={{ opacity: 0.8, fontSize: '12px', whiteSpace: 'nowrap' }}>% of context allocated.</span>
          </div>
          
            <div style={{ marginLeft: '130px', fontSize: '12px', opacity: 0.9, backgroundColor: 'var(--vscode-textBlockQuote-background)', padding: '8px', borderRadius: '4px' }}>
            {(() => {
                const maxCtx = maxContextOverride || llmSettings.modelMaxContext || 4096;
                const sysPromptEst = systemPromptTokenCount ?? 2000;
                const sysPromptLabel = systemPromptTokenCount !== null
                    ? systemPromptTokenCount.toLocaleString()
                    : '~2,000 (measuring...)';
                const usableCtx = Math.max(0, maxCtx - sysPromptEst);
                const historyLimit = Math.floor(usableCtx * summarizeTokenLimit);
                
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div><strong>Token Usage Estimate:</strong></div>
                        <div>Model Context: <strong>{maxCtx.toLocaleString()}</strong> tokens</div>
                        <div>System Prompt: <strong>{sysPromptLabel}</strong> tokens</div>
                        <div style={{ marginTop: '4px', borderTop: '1px solid var(--vscode-editor-foreground)', paddingTop: '2px' }}>
                            Available for Chat History: <strong style={{ color: 'var(--vscode-textLink-foreground)' }}>{historyLimit.toLocaleString()}</strong> tokens
                        </div>
                    </div>
                );
            })()}
          </div>
        </div>





        {llmSettings.llmProvider && (
          <ProviderSettings
            apiKey={llmSettings.apiKey}
            endpoint={llmSettings.endpoint}
            onApiKeyChange={(value) => handleLlmSettingChange('apiKey', value)}
            onEndpointChange={(value) => handleLlmSettingChange('endpoint', value)}
            apiKeyPlaceholder={
              llmSettings.llmProvider === 'openai' ? 'sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' :
              llmSettings.llmProvider === 'ollama' ? 'Optional Bearer token' :
              llmSettings.llmProvider === 'anthropic' ? 'sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' :
              llmSettings.llmProvider === 'xai' ? 'sk-xai-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' :
              llmSettings.llmProvider === 'google' ? 'AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' :
              llmSettings.llmProvider === 'groq' ? 'gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' :
              llmSettings.llmProvider === 'openrouter' ? 'sk-or-v2-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' :
              llmSettings.llmProvider === 'zai' ? 'your-zai-api-key' : ''
            }
            endpointPlaceholder={
              llmSettings.llmProvider === 'openai' ? 'https://api.openai.com/v1' :
              llmSettings.llmProvider === 'ollama' ? (llmSettings.ollamaIsCloud ? 'https://ollama.com' : 'http://localhost:11434') :
              llmSettings.llmProvider === 'anthropic' ? 'https://api.anthropic.com/v1' :
              llmSettings.llmProvider === 'xai' ? 'https://api.xai.com/v1' :
              llmSettings.llmProvider === 'google' ? 'https://generativelanguage.googleapis.com/v1beta' :
              llmSettings.llmProvider === 'groq' ? 'https://api.groq.com/openai/v1' :
              llmSettings.llmProvider === 'openrouter' ? 'https://openrouter.ai/api/v1' :
              llmSettings.llmProvider === 'zai' ? (llmSettings.isCodingPlan ? 'https://api.z.ai/api/coding/paas/v4' : 'https://api.z.ai/api/paas/v4') : ''
            }
            apiKeyLabel={`${llmSettings.llmProvider?.charAt(0).toUpperCase()}${llmSettings.llmProvider?.slice(1)} API Key:`}
            apiKeyHelpTooltip={llmSettings.llmProvider === 'ollama' ? 'optional' : undefined}
            extraFields={
              <>
                {llmSettings.llmProvider === 'ollama' && (
                  <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', justifyContent: 'space-between' }}>
                    <VSCodeButton onClick={handleSaveProfileClick}>Save Profile</VSCodeButton>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <label htmlFor="ollama-is-cloud" style={{ marginRight: '5px' }}>Cloud Hosted?</label>
                      <VSCodeCheckbox
                        id="ollama-is-cloud"
                        checked={llmSettings.ollamaIsCloud}
                        onChange={() => handleLlmSettingChange('ollamaIsCloud', !llmSettings.ollamaIsCloud)}
                      />
                    </div>
                  </div>
                )}
                {llmSettings.llmProvider === 'zai' && (
                  <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', justifyContent: 'space-between' }}>
                    <VSCodeButton onClick={handleSaveProfileClick}>Save Profile</VSCodeButton>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <label htmlFor="zai-is-coding-plan" style={{ marginRight: '5px' }}>Use Coding Plan API</label>
                      <VSCodeCheckbox
                        id="zai-is-coding-plan"
                        checked={llmSettings.isCodingPlan}
                        onChange={() => handleLlmSettingChange('isCodingPlan', !llmSettings.isCodingPlan)}
                      />
                    </div>
                  </div>
                )}
              </>
            }
          />
        )}

        {llmSettings.llmProvider !== 'ollama' && llmSettings.llmProvider !== 'zai' && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '16px' }}>
            <VSCodeButton onClick={handleSaveProfileClick}>Save Profile</VSCodeButton>
          </div>
        )}
        </>
        )}
      </div>

      <VSCodeDivider style={{ margin: '24px 0' }} />

      {/* Per-Agent LLM Overrides 섹션 (별도) */}
      <div className="settings-section" ref={perAgentSectionRef}>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setShowAgentOverrides(v => !v)}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <span className={`codicon ${showAgentOverrides ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
            <span>Per-Agent LLM Overrides</span>
          </h3>
          <span style={{ fontSize: 11, opacity: 0.7 }}>
            {showAgentOverrides ? 'Hide' : 'Show'}
          </span>
        </div>
        <p style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
          Create profiles with custom models for specific agents. When "Use Default" is checked, the agent will use the active profile&apos;s model.
        </p>
        {showAgentOverrides && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <VSCodeTextField
                value={profileName}
                onInput={(e: any) => setProfileName(e.target.value)}
                placeholder="Profile name (e.g., Coding vs. Docs)"
                style={{ flexGrow: 1, minWidth: 220 }}
              />
              <VSCodeButton appearance="primary" onClick={handleSaveProfileClick}>
                Save Profile
              </VSCodeButton>
            </div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              Active profile: {activeProfileId ? (profiles.find(p => p.id === activeProfileId)?.name || activeProfileId) : 'None'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mergedAgents.map(agent => {
                const agentName = agent.card?.name || agent.path || 'UnknownAgent';
                const override = agentOverridesDraft[agentName] || { useDefault: true, model: '', profileId: undefined, useExternal: false, externalUrl: '' };
                const effectiveProfileId = override.profileId || activeProfileId || '';
                const allModels: string[] = Array.from(new Set([
                  ...profiles.map(p => (p.model || '').trim()).filter(m => !!m),
                  ...(models || []).map((m) => (m.id || '').trim()).filter(m => !!m),
                ]));
                return (
                  <div key={agentName} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{agentName}</div>
                      <div style={{ opacity: 0.7, fontSize: 11 }}>{agent.card?.description}</div>
                      <div style={{ marginTop: 2 }}>
                        <VSCodeCheckbox
                          checked={override.useDefault}
                          disabled={override.useExternal}
                          onChange={() => {
                            setAgentOverridesDraft(prev => {
                              const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                              return {
                                ...prev,
                                [agentName]: { ...prevEntry, useDefault: !prevEntry.useDefault },
                              };
                            });
                          }}
                        >
                          Use Default
                        </VSCodeCheckbox>
                      </div>
                      <div style={{ marginTop: 2 }}>
                          <VSCodeCheckbox
                              checked={!!override.useExternal}
                              onChange={() => {
                                  setAgentOverridesDraft(prev => {
                                      const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                                      const newChecked = !prevEntry.useExternal;
                                      return {
                                          ...prev,
                                          [agentName]: { ...prevEntry, useExternal: newChecked, useDefault: newChecked ? false : prevEntry.useDefault },
                                      };
                                  });
                              }}
                          >
                              Override with External Agent
                          </VSCodeCheckbox>
                      </div>
                      {override.useExternal && (
                          <div style={{ marginTop: 4 }}>
                              <VSCodeTextField
                                  placeholder="Agent URL (e.g. http://localhost:8000/agent/foo/card)"
                                  value={override.externalUrl || ''}
                                  onInput={(e: any) => {
                                      const val = e.target.value;
                                      setAgentOverridesDraft(prev => {
                                          const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                                          return {
                                              ...prev,
                                              [agentName]: { ...prevEntry, externalUrl: val },
                                          };
                                      });
                                  }}
                                  style={{ width: '100%' }}
                              />
                          </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 240 }}>
                      <div style={{ fontSize: 11, opacity: 0.7, alignSelf: 'stretch', textAlign: 'right' }}>Profile</div>
                      <VSCodeDropdown
                        style={{ width: '100%' }}
                        disabled={override.useDefault || override.useExternal || !profiles || profiles.length === 0}
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
                          // Fetch models for this profile so the model dropdown gets populated
                          const p = profiles.find(p => p.id === value);
                          if (p) {
                              const apiKey = p.apiKey || ''; 
                              vscodeService.postMessage({ command: 'requestModels', payload: { provider: p.provider, endpoint: p.endpoint, apiKey } });
                          }
                        }}
                      >
                        <VSCodeOption value="">
                          {activeProfileId
                            ? `Active Profile (${(profiles || []).find(p => p.id === activeProfileId)?.name || activeProfileId})`
                            : 'Active Profile'}
                        </VSCodeOption>
                        {/* Only show regular profiles (not Per-Agent profiles with agentOverrides) */}
                        {(profiles || []).filter(p => !Array.isArray(p.agentOverrides) || p.agentOverrides.length === 0).map(p => (
                          <VSCodeOption key={p.id} value={p.id}>{p.name}</VSCodeOption>
                        ))}
                      </VSCodeDropdown>
                      <div style={{ fontSize: 11, opacity: 0.7, alignSelf: 'stretch', textAlign: 'right' }}>Model</div>
                      {allModels.length > 0 ? (
                        <VSCodeDropdown
                          style={{ width: '100%' }}
                          disabled={override.useDefault || override.useExternal}
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
                          disabled={override.useDefault || override.useExternal}
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
                      <div style={{ fontSize: 11, opacity: 0.7, alignSelf: 'stretch', textAlign: 'right' }}>Endpoint (Optional)</div>
                      <VSCodeTextField
                        style={{ width: '100%' }}
                        disabled={override.useDefault || override.useExternal}
                        value={override.endpoint || ''}
                        placeholder="Custom endpoint URL"
                        onInput={(e: any) => {
                          const value = (e.target.value || '').toString();
                          setAgentOverridesDraft(prev => {
                            const prevEntry = prev[agentName] || { useDefault: true, model: '', endpoint: '' };
                            return {
                              ...prev,
                              [agentName]: { ...prevEntry, useDefault: false, endpoint: value },
                            };
                          });
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      </>
      )}

      <VSCodeDivider style={{ margin: '16px 0' }} />

      {/* ========== Advanced Settings Group (Global context, reasoning, language) ========== */}
      <div
        style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            padding: '8px 0',
            marginBottom: '12px'
        }}
        onClick={() => toggleGroup('advancedSettings')}
      >
        <span className={`codicon codicon-${expandedGroups.advancedSettings ? 'chevron-down' : 'chevron-right'}`} />
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--vscode-foreground)' }}>Advanced Settings</h2>
      </div>

      {expandedGroups.advancedSettings && (
        <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
          
          {/* Section: LLM Performance & Safety */}
          <div className="settings-section">
            <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 600 }}>LLM Performance & Safety</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ minWidth: '160px', fontSize: '12px' }}>Global Timeout (ms):</label>
                <input
                  type="number"
                  value={globalRequestTimeout}
                  onChange={(e: any) => setGlobalRequestTimeout(parseInt(e.target.value) || 0)}
                  onBlur={(e: any) => vscodeService.postMessage({ command: 'setGlobalRequestTimeout', payload: { timeout: parseInt(e.target.value) || 60000 } })}
                  style={{ backgroundColor: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: '2px', padding: '3px 5px', width: '80px', fontFamily: 'var(--vscode-font-family)', fontSize: '12px' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ minWidth: '160px', fontSize: '12px' }}>Default Temperature:</label>
                <input
                  type="text"
                  value={globalTemperature.toString()}
                  onChange={(e: any) => { let val = parseFloat(e.target.value); if (!isNaN(val)) setGlobalTemperature(val); }}
                  onBlur={(e: any) => { let val = parseFloat(e.target.value); if (!isNaN(val)) { val = Math.max(0, Math.min(2, val)); vscodeService.postMessage({ command: 'setGlobalTemperature', payload: { temperature: val } }); } }}
                  style={{ backgroundColor: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: '2px', padding: '3px 5px', width: '60px', textAlign: 'right', fontSize: '12px' }}
                />
                <span style={{ fontSize: '11px', opacity: 0.7 }}>(0.0 - 2.0)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ minWidth: '160px', fontSize: '12px' }}>Safety Buffer Ratio:</label>
                <input
                  type="text"
                  value={safetyBufferRatio.toString()}
                  onChange={(e: any) => { let val = parseFloat(e.target.value); if (!isNaN(val)) setSafetyBufferRatio(val); }}
                  onBlur={(e: any) => { let val = parseFloat(e.target.value); if (!isNaN(val)) { val = Math.max(0.1, Math.min(1.0, val)); vscodeService.postMessage({ command: 'setSafetyBufferRatio', payload: { ratio: val } }); } }}
                  style={{ backgroundColor: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: '2px', padding: '3px 5px', width: '60px', textAlign: 'right', fontSize: '12px' }}
                />
                <span style={{ fontSize: '11px', opacity: 0.7 }}>Default 0.9</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ minWidth: '160px', fontSize: '12px' }}>Reasoning Effort:</label>
                <VSCodeDropdown
                  value={globalReasoningEffort}
                  onChange={(e: any) => { const effort = (e.target as HTMLSelectElement).value as 'low' | 'medium' | 'high'; setGlobalReasoningEffort(effort); vscodeService.postMessage({ command: 'setGlobalReasoningEffort', payload: { effort } }); }}
                  style={{ minWidth: '100px' }}
                >
                  <VSCodeOption value="low">Low</VSCodeOption>
                  <VSCodeOption value="medium">Medium</VSCodeOption>
                  <VSCodeOption value="high">High</VSCodeOption>
                </VSCodeDropdown>
              </div>
            </div>
          </div>

          {/* Section: Security & Automation */}
          <div className="settings-section" style={{ marginTop: '16px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 600 }}>Security</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              <VSCodeCheckbox
                checked={strictMode}
                onChange={(e: any) => {
                  const val = e.target.checked;
                  setStrictMode(val);
                  vscodeService.postMessage({ command: 'setStrictMode', payload: { enabled: val } });
                }}
              >
                Strict Mode
              </VSCodeCheckbox>
              <div style={{ fontSize: '11px', opacity: 0.7, paddingLeft: '24px', lineHeight: '1.4' }}>
                When enabled, enforces settings that prevent the agent from autonomously running targeted exploits and requires human review for all agent actions.
              </div>
            </div>

            <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 600 }}>Artifact</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ minWidth: '120px', fontSize: '12px' }}>Review Policy:</label>
                <VSCodeDropdown
                  value={reviewPolicy}
                  onChange={(e: any) => {
                    const val = (e.target as HTMLSelectElement).value as any;
                    setReviewPolicy(val);
                    vscodeService.postMessage({ command: 'setReviewPolicy', payload: { policy: val } });
                  }}
                  style={{ minWidth: '140px' }}
                >
                  <VSCodeOption value="always">Asks for Review</VSCodeOption>
                  <VSCodeOption value="agent-decides">Agent Decides</VSCodeOption>
                  <VSCodeOption value="never">Always Proceeds</VSCodeOption>
                </VSCodeDropdown>
              </div>
              <div style={{ fontSize: '11px', opacity: 0.7, lineHeight: '1.4' }}>
                Specifies Agent's behavior when asking for review on artifacts, which are documents it creates to enable a richer conversation experience.
              </div>
            </div>

            <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 600 }}>Terminal</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              <VSCodeCheckbox
                checked={terminalAutoExecution}
                disabled={strictMode}
                onChange={(e: any) => {
                  const val = e.target.checked;
                  setTerminalAutoExecution(val);
                  vscodeService.postMessage({ command: 'setTerminalAutoExecution', payload: { enabled: val } });
                }}
              >
                Terminal Command Auto Execution (Disabled in Strict Mode)
              </VSCodeCheckbox>
            </div>

            <h3 style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: 600 }}>File Access</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ minWidth: '120px', fontSize: '12px' }}>File Access Policy:</label>
                <VSCodeDropdown
                  value={fileAccessPolicy}
                  onChange={(e: any) => {
                    const val = (e.target as HTMLSelectElement).value as any;
                    setFileAccessPolicy(val);
                    vscodeService.postMessage({ command: 'setFileAccessPolicy', payload: { policy: val } });
                  }}
                  style={{ minWidth: '140px' }}
                >
                  <VSCodeOption value="request-each">Request Each Time</VSCodeOption>
                  <VSCodeOption value="allow-all">Allow All</VSCodeOption>
                  <VSCodeOption value="read-only">Read Only</VSCodeOption>
                </VSCodeDropdown>
              </div>
            </div>
          </div>

        </div>
      )}

      <VSCodeDivider style={{ margin: '24px 0' }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          padding: '8px 0',
          marginBottom: '16px'
        }}
        onClick={() => toggleGroup('webSearchSettings')}
      >
        <span className={`codicon codicon-${expandedGroups.webSearchSettings ? 'chevron-down' : 'chevron-right'}`} />
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--vscode-foreground)', opacity: 0.8 }}>Web Search Settings</h2>
      </div>
      {expandedGroups.webSearchSettings && (
      <div className="settings-section">
        <h3>Web Search Configuration</h3>
        <p>Configure your web search provider for AI-assisted research and information gathering.</p>

        {/* Provider Selection */}
        <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
          <label htmlFor="websearch-provider" style={{ minWidth: '140px', marginRight: '10px' }}>Provider:</label>
          <VSCodeDropdown
            id="websearch-provider"
            style={{ minWidth: '200px' }}
            value={webSearchProvider}
            onChange={(e: any) => {
              setWebSearchProvider((e.target as HTMLSelectElement).value as 'tavily' | 'google' | 'brave' | 'custom');
              // Update default endpoint based on provider
              const defaultEndpoints: Record<string, string> = {
                tavily: 'https://api.tavily.com',
                google: 'https://www.googleapis.com/customsearch/v1',
                brave: 'https://api.search.brave.com',
                custom: ''
              };
              setWebSearchEndpoint(defaultEndpoints[(e.target as HTMLSelectElement).value] || '');
            }}
          >
            <VSCodeOption value="tavily">Tavily (Recommended)</VSCodeOption>
            <VSCodeOption value="google">Google Custom Search</VSCodeOption>
            <VSCodeOption value="brave">Brave Search API</VSCodeOption>
            <VSCodeOption value="custom">Custom Endpoint</VSCodeOption>
          </VSCodeDropdown>
        </div>

        {/* API Key */}
        <div className="setting-item" style={{ marginBottom: '10px' }}>
          <label htmlFor="websearch-apikey" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
            API Key
            {webSearchProvider === 'tavily' && ' (Tavily)'}
            {webSearchProvider === 'google' && ' (Google)'}
            {webSearchProvider === 'brave' && ' (Brave)'}
          </label>
          <VSCodeTextField
            id="websearch-apikey"
            placeholder="Enter API key..."
            value={webSearchApiKey}
            onChange={(e: any) => setWebSearchApiKey((e.target as HTMLInputElement).value)}
            type="password"
            style={{ width: '100%' }}
          />
        </div>

        {/* Custom Endpoint (only for custom provider) */}
        {webSearchProvider === 'custom' && (
          <div className="setting-item" style={{ marginBottom: '10px' }}>
            <label htmlFor="websearch-endpoint" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
              Custom Endpoint URL
            </label>
            <VSCodeTextField
              id="websearch-endpoint"
              placeholder="https://api.example.com/v1"
              value={webSearchEndpoint}
              onChange={(e: any) => setWebSearchEndpoint((e.target as HTMLInputElement).value)}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* Save Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '16px' }}>
          <VSCodeButton onClick={() => {
            vscodeService.postMessage({
              command: 'saveWebSearchSettings',
              payload: { provider: webSearchProvider, apiKey: webSearchApiKey, endpoint: webSearchEndpoint }
            });
          }}>Save Web Search Settings</VSCodeButton>
        </div>
      </div>
      )}

      <VSCodeDivider style={{ margin: '24px 0' }} />

      {/* ========== Server Connections Group ========== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          userSelect: 'none',
          marginTop: '8px',
          marginBottom: '16px'
        }}
        onClick={() => toggleGroup('serverConnections')}
      >
        <span className={`codicon codicon-${expandedGroups.serverConnections ? 'chevron-down' : 'chevron-right'}`} />
        <h2 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--vscode-foreground)', opacity: 0.8 }}>Server Connections</h2>
      </div>
      {expandedGroups.serverConnections && (
      <>
      {/* MCP 섹션 */}
      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ marginTop: 0 }}>Model Context Protocol (MCP)</h3>
            <div style={{ display: 'flex', gap: '4px' }}>
                <VSCodeButton appearance="icon" onClick={() => vscodeService.postMessage({ command: 'refreshConfiguredItems', payload: { force: true } })} title="Refresh MCP configs">
                    <span className="codicon codicon-refresh"></span>
                </VSCodeButton>
            </div>
        </div>
        <p>Manage connections to Model Context Protocol settings via <code>.agent/mcp-servers.json</code>.</p>

        {/* Inline Add MCP Server Form */}
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <VSCodeTextField
            value={mcpNameInput}
            onInput={(e: any) => setMcpNameInput(e.target.value)}
            placeholder="MCP Server Name"
            style={{ width: '100%' }}
          />
          <VSCodeTextField
            value={mcpCommandInput}
            onInput={(e: any) => setMcpCommandInput(e.target.value)}
            placeholder="Command (e.g., npx @modelcontextprotocol/server-filesystem)"
            style={{ width: '100%' }}
          />
          <VSCodeTextField
            value={mcpArgsInput}
            onInput={(e: any) => setMcpArgsInput(e.target.value)}
            placeholder="Args (e.g., /path/to/directory)"
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <VSCodeButton appearance="primary" onClick={() => vscodeService.postMessage({ command: 'openFile', filePath: '.agent/mcp-servers.json' })} style={{ height: '28px', width: 'fit-content' }}>
              <span className="codicon codicon-json" style={{ marginRight: '6px' }}></span>
              Open mcp-servers.json
            </VSCodeButton>
            <VSCodeButton
              className="add-button"
              appearance="primary"
              onClick={handleAddMcpServer}
              style={{ height: '28px', width: 'fit-content' }}
            >
              <span className="codicon codicon-plus" style={{ marginRight: '4px' }}></span>
              Add MCP Server
            </VSCodeButton>
          </div>
        </div>

          {configuredItems.mcp.length > 0 ? (
            <div style={{ marginTop: '12px' }}>
               <div 
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: 0.9, userSelect: 'none' }}
                onClick={() => setMcpExpanded(!mcpExpanded)}
               >
                  <span className={`codicon codicon-${mcpExpanded ? 'chevron-down' : 'chevron-right'}`}></span>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>
                    Total: {configuredItems.mcp.length}, 
                    Active: {configuredItems.mcp.filter(s => mcpHealthStatus[s]?.status === 'healthy').length}, 
                    Inactive: {configuredItems.mcp.filter(s => mcpHealthStatus[s]?.status !== 'healthy').length}
                  </span>
               </div>
               
               {mcpExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '16px', marginTop: '8px', borderLeft: '2px solid var(--vscode-dropdown-border)' }}>
                      {configuredItems.mcp.map(server => {
                          const health = mcpHealthStatus[server] || { status: 'unknown' };
                          const iconClass = health.status === 'healthy' ? 'codicon-check' : 
                                            health.status === 'unhealthy' ? 'codicon-error' : 'codicon-question';
                          const iconColor = health.status === 'healthy' ? 'var(--vscode-testing-iconPassed)' : 
                                            health.status === 'unhealthy' ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-testing-iconSkipped)';
                          const statusText = health.status === 'healthy' ? 'Ready' : 
                                             health.status === 'unhealthy' ? 'Error' : 'Unknown';
                          const hasTools = health.status === 'healthy' && Array.isArray(health.tools);
                          
                          return (
                              <div key={server} style={{ display: 'flex', flexDirection: 'column' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', fontSize: '13px' }}>
                                    <div style={{ marginRight: '8px' }} onClick={(e) => e.stopPropagation()}>
                                        <VSCodeCheckbox 
                                            checked={mcpEnabledState.servers[server] !== false}
                                            onChange={() => toggleServerEnabled(server, mcpEnabledState.servers[server] !== false)} 
                                            title={mcpEnabledState.servers[server] !== false ? "Disable Server" : "Enable Server"}
                                        />
                                    </div>
                                    <span className={`codicon ${iconClass}`} style={{ fontSize: '12px', marginRight: '6px', color: iconColor }} title={health.message || statusText}></span>
                                    <span style={{ opacity: mcpEnabledState.servers[server] !== false ? 1 : 0.5 }}>{server}</span>
                                    <span style={{ fontSize: '11px', opacity: 0.6, marginLeft: '8px' }}>({statusText})</span>
                                    {health.message && health.status === 'unhealthy' && (
                                        <span style={{ fontSize: '11px', opacity: 0.8, marginLeft: '8px', color: 'var(--vscode-errorForeground)' }}>- {health.message}</span>
                                    )}
                                    {hasTools && (
                                        <div 
                                            onClick={() => toggleServerTools(server)}
                                            style={{ marginLeft: 'auto', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: 0.8, fontSize: '11px' }}
                                            title="View Tools"
                                        >
                                            <span style={{ marginRight: '4px' }}>{health.tools?.length} tools</span>
                                            <span className={`codicon codicon-${expandedServerTools[server] ? 'chevron-down' : 'chevron-right'}`}></span>
                                        </div>
                                    )}
                                </div>
                                {hasTools && expandedServerTools[server] && (
                                    <div style={{ margin: '4px 0 8px 46px', fontSize: '12px', opacity: 0.9, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {health.tools?.map(tool => (
                                            <div key={tool} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <VSCodeCheckbox 
                                                    checked={mcpEnabledState.tools[server]?.[tool] !== false}
                                                    onChange={() => toggleToolEnabled(server, tool, mcpEnabledState.tools[server]?.[tool] !== false)}
                                                    disabled={mcpEnabledState.servers[server] === false}
                                                />
                                                <span style={{ opacity: (mcpEnabledState.tools[server]?.[tool] !== false && mcpEnabledState.servers[server] !== false) ? 1 : 0.5 }}>
                                                    {tool}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                              </div>
                          );
                      })}
                  </div>
               )}
            </div>
          ) : (
            <div style={{ fontSize: '13px', opacity: 0.7, marginTop: '12px' }}>No MCP servers configured.</div>
          )}
        </div>

      {/* A2A 섹션 */}
      <div className="settings-section" style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ marginTop: 0 }}>Agents to Agents (A2A)</h3>
            <div style={{ display: 'flex', gap: '4px' }}>
                <VSCodeButton appearance="icon" onClick={() => vscodeService.postMessage({ command: 'refreshConfiguredItems', payload: { force: true } })} title="Refresh A2A configs">
                    <span className="codicon codicon-refresh"></span>
                </VSCodeButton>
            </div>
        </div>
        <p>Manage Agent-to-Agent (A2A) configurations via <code>.agent/a2a-servers.json</code>.</p>

        {/* Inline Add A2A Server Form */}
        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <VSCodeTextField
            value={a2aNameInput}
            onInput={(e: any) => setA2aNameInput(e.target.value)}
            placeholder="A2A Agent Name"
            style={{ width: '100%' }}
          />
          <VSCodeTextField
            value={a2aUrlInput}
            onInput={(e: any) => setA2aUrlInput(e.target.value)}
            placeholder="URL (e.g., http://localhost:8000/agent/foo/card)"
            style={{ width: '100%' }}
          />
          <VSCodeTextField
            value={a2aDescInput}
            onInput={(e: any) => setA2aDescInput(e.target.value)}
            placeholder="Description"
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <VSCodeButton appearance="primary" onClick={() => vscodeService.postMessage({ command: 'openFile', filePath: '.agent/a2a-servers.json' })} style={{ height: '28px', width: 'fit-content' }}>
              <span className="codicon codicon-json" style={{ marginRight: '6px' }}></span>
              Open a2a-servers.json
            </VSCodeButton>
            <VSCodeButton
              className="add-button"
              appearance="primary"
              onClick={handleAddA2aServer}
              style={{ height: '28px', width: 'fit-content' }}
            >
              <span className="codicon codicon-plus" style={{ marginRight: '4px' }}></span>
              Add A2A Server
            </VSCodeButton>
          </div>
        </div>

          {configuredItems.a2a.filter(a => a !== 'SecurityAnalysisAgent').length > 0 ? (
            <div style={{ marginTop: '12px' }}>
               <div 
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: 0.9, userSelect: 'none' }}
                onClick={() => setA2aExpanded(!a2aExpanded)}
               >
                  <span className={`codicon codicon-${a2aExpanded ? 'chevron-down' : 'chevron-right'}`}></span>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>
                    Total: {configuredItems.a2a.filter(a => a !== 'SecurityAnalysisAgent').length}, 
                    Connected: {configuredItems.a2a.filter(s => s !== 'SecurityAnalysisAgent' && a2aHealthStatus[s]?.status === 'healthy').length}, 
                    Disconnected: {configuredItems.a2a.filter(s => s !== 'SecurityAnalysisAgent' && a2aHealthStatus[s]?.status !== 'healthy').length}
                  </span>
               </div>
               
               {a2aExpanded && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '16px', marginTop: '8px', borderLeft: '2px solid var(--vscode-dropdown-border)' }}>
                      {configuredItems.a2a
                          .filter(agent => agent !== 'SecurityAnalysisAgent')
                          .map(agent => {
                          const health = a2aHealthStatus[agent] || { status: 'unknown' };
                          const iconClass = health.status === 'healthy' ? 'codicon-radio-tower' : 
                                            health.status === 'unhealthy' ? 'codicon-error' : 'codicon-question';
                          const iconColor = health.status === 'healthy' ? 'var(--vscode-testing-iconPassed)' : 
                                            health.status === 'unhealthy' ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-testing-iconSkipped)';
                          const statusText = health.status === 'healthy' ? 'Connected' : 
                                             health.status === 'unhealthy' ? 'Disconnected' : 'Unknown';
                          return (
                              <div key={agent} style={{ display: 'flex', alignItems: 'center', fontSize: '13px' }}>
                                  <span className={`codicon ${iconClass}`} style={{ fontSize: '12px', marginRight: '6px', color: iconColor }} title={health.message || statusText}></span>
                                  <span>{agent}</span>
                                  <span style={{ fontSize: '11px', opacity: 0.6, marginLeft: '8px' }}>({statusText})</span>
                                  {health.message && health.status === 'unhealthy' && (
                                      <span style={{ fontSize: '11px', opacity: 0.8, marginLeft: '8px', color: 'var(--vscode-errorForeground)' }}>- {health.message}</span>
                                  )}
                              </div>
                          );
                      })}
                  </div>
               )}
            </div>
          ) : (
             <div style={{ fontSize: '13px', opacity: 0.7, marginTop: '12px' }}>No Agent to Agent configured.</div>
          )}
        </div>

      {/* Prompt Settings 섹션 */}
      <div className="settings-section" style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ marginTop: 0 }}>Prompt Settings</h3>
            <div style={{ display: 'flex', gap: '4px' }}>
                <VSCodeButton appearance="icon" onClick={() => vscodeService.postMessage({ command: 'refreshConfiguredItems', payload: { force: true } })} title="Refresh Prompt configs">
                    <span className="codicon codicon-refresh"></span>
                </VSCodeButton>
            </div>
        </div>
        <p>Manage custom prompts via <code>.agent/AGENTS.md</code>.</p>
        
        <div style={{ marginTop: '12px' }}>
          <VSCodeButton appearance="primary" onClick={() => vscodeService.postMessage({ command: 'openFile', filePath: '.agent/AGENTS.md' })} style={{ height: '28px', width: 'fit-content', marginBottom: '12px' }}>
            <span className="codicon codicon-markdown" style={{ marginRight: '6px' }}></span>
            Open AGENTS.md
          </VSCodeButton>
          
          {configuredItems.prompts.length > 0 ? (
            <div>
               {configuredItems.prompts
                 .filter(agent => agent.name !== 'SecurityAnalysisAgent')
                 .map(agent => (
                 <div key={agent.name} style={{ marginBottom: '8px' }}>
                   <div 
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.9, cursor: 'pointer', userSelect: 'none' }}
                     onClick={() => togglePrompt(agent.name)}
                   >
                      <span className={`codicon codicon-${expandedPrompts[agent.name] ? 'chevron-down' : 'chevron-right'}`}></span>
                      <span style={{ fontSize: '13px', fontWeight: 600 }}>{agent.name}</span>
                   </div>
                   {expandedPrompts[agent.name] && (
                       <div style={{ marginTop: '8px', paddingLeft: '16px', borderLeft: '2px solid var(--vscode-dropdown-border)' }}>
                           <pre style={{ 
                               fontSize: '12px', 
                               whiteSpace: 'pre-wrap', 
                               backgroundColor: 'var(--vscode-editor-background)', 
                               padding: '8px',
                               borderRadius: '4px',
                               margin: 0,
                               fontFamily: 'var(--vscode-editor-font-family)'
                           }}>
                               {agent.content || '(No specific guidelines)'}
                           </pre>
                       </div>
                   )}
                 </div>
               ))}
            </div>
          ) : (
            <div style={{ fontSize: '13px', opacity: 0.7 }}>No prompt configurations found.</div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
};