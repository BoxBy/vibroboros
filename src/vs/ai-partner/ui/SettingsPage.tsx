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
  const [models, setModels] = useState<string[]>(propModels || []);
  console.log('[SettingsPage] Component rendering, models state:', models.length);
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
  const [agentOverridesDraft, setAgentOverridesDraft] = useState<Record<string, { useDefault: boolean; model: string; profileId?: string; useExternal?: boolean; externalUrl?: string }>>({});
  const [showAgentOverrides, setShowAgentOverrides] = useState<boolean>(false);
  
  // New Settings
  const [summarizeTokenLimit, setSummarizeTokenLimit] = useState<number>(0.75);

  const [thinkingLanguage, setThinkingLanguage] = useState<string>('English');
  const [userLanguage, setUserLanguage] = useState<string>('English');
  const [maxContextOverride, setMaxContextOverride] = useState<number | undefined>(undefined);
  const [useVSCodeThinkingLang, setUseVSCodeThinkingLang] = useState<boolean>(false);
  const [useVSCodeUserLang, setUseVSCodeUserLang] = useState<boolean>(false);

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
        setModels(message.payload || []);
        return;
      }
      
      if (message.command === 'updateAgentList') {
        setAgents(message.agents);
      } else if (message.command === 'llmSettingsResponse') { // LLM 설정 응답 처리
        setLlmSettings(message.payload);
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
      } else if (message.command === 'profilesResponse') {
        setProfiles(message.payload?.profiles || []);
        setActiveProfileId(typeof message.payload?.activeProfileId === 'string' ? message.payload.activeProfileId : null);
      } else if (message.command === 'activeProfileChanged') {
        setActiveProfileId(typeof message.payload === 'string' ? message.payload : null);
      } else if (message.command === 'profileSaved' || message.command === 'profileDeleted') {
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

    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('click', onDocClick);
    };
  }, []);

  const [configuredItems, setConfiguredItems] = useState<{ mcp: string[]; a2a: string[]; prompts: { name: string; content: string }[] }>({ mcp: [], a2a: [], prompts: [] });
  const [mcpExpanded, setMcpExpanded] = useState(false);
  const [a2aExpanded, setA2aExpanded] = useState(false);
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({});
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
// ...
          {configuredItems.prompts.length > 0 ? (
            <div>
               {configuredItems.prompts.map(agent => (
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
                               margin: 0
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
      useExternal: !!override.useExternal,
      externalUrl: override.externalUrl,
      profileId: override.profileId,
    })).filter(o => !o.useDefault || (o.model && o.model.trim().length > 0) || o.useExternal);
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
      const draft: Record<string, { useDefault: boolean; model: string; profileId?: string; useExternal?: boolean; externalUrl?: string }> = {};
      const overrides = Array.isArray(p.agentOverrides) ? p.agentOverrides : [];
      overrides.forEach((o: any) => {
        if (!o || typeof o.agentName !== 'string') {
          return;
        }
        draft[o.agentName] = {
          useDefault: !!o.useDefault,
          model: (o.model || ''),
          profileId: typeof o.profileId === 'string' && o.profileId.length > 0 ? o.profileId : undefined,
          useExternal: !!o.useExternal,
          externalUrl: (o.externalUrl || ''),
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
    // Refresh models since we might be switching context/provider
    vscodeService.postMessage({ command: 'requestModels' });
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

      <VSCodeDivider style={{ margin: '16px 0' }} />

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
              onClick={() => { 
                vscodeService.postMessage({ command: 'requestModels' });
              }}
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
                  
                  return models.map((m: string) => (
                    <div 
                      key={m} 
                      className="suggestion-item" 
                      onClick={() => { handleLlmSettingChange('model', m); setShowModelSuggestions(false); }} 
                      style={{ 
                        padding: '6px 12px', 
                        cursor: 'pointer', 
                        borderBottom: '1px solid var(--vscode-dropdown-border)', 
                        color: 'var(--vscode-foreground)', 
                        display: 'block',
                        background: 'transparent'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <span className="suggestion-command">{m}</span>
                    </div>
                  ));
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
                    value={!maxContextOverride ? '' : String(maxContextOverride)}
                    onInput={(e: any) => {
                        const val = parseInt(e.target.value);
                        const newVal = (isNaN(val) || val === 0) ? undefined : val;
                        setMaxContextOverride(newVal);
                        vscodeService.postMessage({ command: 'setMaxContextOverride', payload: { limit: newVal } });
                    }}
                    placeholder={String(llmSettings.modelMaxContext || 4096)}
                    style={{ width: '120px' }}
                />
                <span style={{ fontSize: '12px', opacity: 0.7 }}>tokens</span>
             </div>
             {!maxContextOverride && (!llmSettings.modelMaxContext || llmSettings.modelMaxContext === 4096) && (
                <div style={{ color: 'var(--vscode-charts-yellow)', fontSize: '11px', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '130px' }}>
                     <span className="codicon codicon-warning"></span>
                     <span>Default limit (4096). Enter manually above if model supports more.</span>
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
                const sysPromptEst = 2000; // Estimated system prompt size
                const usableCtx = Math.max(0, maxCtx - sysPromptEst);
                const historyLimit = Math.floor(usableCtx * summarizeTokenLimit);
                
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div><strong>Token Usage Estimate:</strong></div>
                        <div>Model Context: <strong>{maxCtx.toLocaleString()}</strong> tokens</div>
                        <div>System Prompt (Est.): <strong>~{sysPromptEst.toLocaleString()}</strong> tokens</div>
                        <div style={{ marginTop: '4px', borderTop: '1px solid var(--vscode-editor-foreground)', paddingTop: '2px' }}>
                            Available for Chat History: <strong style={{ color: 'var(--vscode-textLink-foreground)' }}>{historyLimit.toLocaleString()}</strong> tokens
                        </div>
                    </div>
                );
            })()}
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
            <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', justifyContent: 'space-between' }}>
              <VSCodeButton onClick={handleSaveLlmSettings}>Save LLM Settings</VSCodeButton>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <label htmlFor="ollama-is-cloud" style={{ marginRight: '5px' }}>Cloud Hosted?</label>
                <VSCodeCheckbox
                  id="ollama-is-cloud"
                  checked={llmSettings.ollamaIsCloud}
                  onChange={(e: any) => handleLlmSettingChange('ollamaIsCloud', e.target.checked)}
                />
              </div>
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



        {llmSettings.llmProvider !== 'ollama' && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '16px' }}>
            <VSCodeButton onClick={handleSaveLlmSettings}>Save LLM Settings</VSCodeButton>
          </div>
        )}
      </div>

      <VSCodeDivider style={{ margin: '24px 0' }} />

      <div className="settings-section">
        <h3 style={{ marginTop: 0 }}>LLM Profiles</h3>
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
                  const override = agentOverridesDraft[agentName] || { useDefault: true, model: '', profileId: undefined, useExternal: false, externalUrl: '' };
                  const effectiveProfileId = override.profileId || activeProfileId || '';
                  const allModels: string[] = Array.from(new Set([
                    ...profiles.map(p => (p.model || '').trim()).filter(m => !!m),
                    ...(models || []).map((m: string) => (m || '').trim()).filter(m => !!m),
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
                        <div style={{ marginTop: 2 }}>
                            <VSCodeCheckbox
                                checked={!!override.useExternal}
                                onChange={(e: any) => {
                                    const checked = !!e.target.checked;
                                    setAgentOverridesDraft(prev => {
                                        const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                                        return {
                                            ...prev,
                                            [agentName]: { ...prevEntry, useExternal: checked, useDefault: checked ? false : prevEntry.useDefault },
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
                          disabled={override.useDefault || override.useExternal || profiles.length === 0}
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
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <VSCodeDivider style={{ margin: '24px 0' }} />

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
        
        <div style={{ marginTop: '12px' }}>
          <VSCodeButton appearance="primary" onClick={() => vscodeService.postMessage({ command: 'openFile', filePath: '.agent/mcp-servers.json' })} style={{ height: '28px', whiteSpace: 'nowrap', marginBottom: '12px' }}>
            <span className="codicon codicon-json" style={{ marginRight: '6px' }}></span>
            Open mcp-servers.json
          </VSCodeButton>

          {configuredItems.mcp.length > 0 ? (
            <div>
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
            <div style={{ fontSize: '13px', opacity: 0.7 }}>No MCP servers configured.</div>
          )}
        </div>
      </div>

      <VSCodeDivider style={{ margin: '24px 0' }} />



      <div className="settings-section">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ marginTop: 0 }}>Agents to Agents (A2A)</h3>
            <div style={{ display: 'flex', gap: '4px' }}>
                <VSCodeButton appearance="icon" onClick={() => vscodeService.postMessage({ command: 'refreshConfiguredItems', payload: { force: true } })} title="Refresh A2A configs">
                    <span className="codicon codicon-refresh"></span>
                </VSCodeButton>
            </div>
        </div>
        <p>Manage Agent-to-Agent (A2A) configurations via <code>.agent/a2a-servers.json</code>.</p>
        
        <div style={{ marginTop: '12px' }}>
          <VSCodeButton appearance="primary" onClick={() => vscodeService.postMessage({ command: 'openFile', filePath: '.agent/a2a-servers.json' })} style={{ height: '28px', whiteSpace: 'nowrap', marginBottom: '12px' }}>
            <span className="codicon codicon-json" style={{ marginRight: '6px' }}></span>
            Open a2a-servers.json
          </VSCodeButton>

          {configuredItems.a2a.filter(a => a !== 'SecurityAnalysisAgent').length > 0 ? (
            <div>
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
             <div style={{ fontSize: '13px', opacity: 0.7 }}>No Agent to Agent configured.</div>
          )}
        </div>
      </div>

      <VSCodeDivider style={{ margin: '16px 0' }} />

      <div className="settings-section">
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
          <VSCodeButton appearance="primary" onClick={() => vscodeService.postMessage({ command: 'openFile', filePath: '.agent/AGENTS.md' })} style={{ height: '28px', whiteSpace: 'nowrap', marginBottom: '12px' }}>
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
    </div>
  );
};