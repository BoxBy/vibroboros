import { useState, useEffect, useMemo, useRef } from 'react';
import { vscodeService } from '../services/vscode';
import { validateApiKey, validateEndpoint, getDefaultEndpoint } from '../utils/validation';

export interface InternalAgent {
  name: string;
  description: string;
}

export interface Agent {
  path: string;
  card: { name: string; description: string; };
}

export interface LlmSettings {
  llmProvider: 'openai' | 'ollama' | 'anthropic' | 'xai' | 'google' | 'groq' | 'openrouter' | 'zai' | undefined;
  endpoint: string;
  apiKey: string;
  ollamaIsCloud: boolean;
  isCodingPlan: boolean;
  model: string;
  modelMaxContext?: number;
}

export function useViperSettings(propModels: any[] = []) {
  const [validationState, setValidationState] = useState({ apiKeyValid: true, endpointValid: true });
  const [agents, setAgents] = useState<InternalAgent[]>([]);
  const [llmSettings, setLlmSettings] = useState<LlmSettings>({
    llmProvider: undefined, endpoint: '', apiKey: '', ollamaIsCloud: false, isCodingPlan: false, model: '', modelMaxContext: 0
  });
  const [models, setModels] = useState<Array<{ id: string; maxContext?: number }>>(propModels);

  useEffect(() => {
    setModels(propModels);
  }, [propModels]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showModelSuggestions, setShowModelSuggestions] = useState<boolean>(false);
  
  // Refs for UI interactions
  const llmSectionRef = useRef<HTMLDivElement | null>(null);
  const perAgentSectionRef = useRef<HTMLDivElement | null>(null);
  const modelComboRef = useRef<HTMLDivElement | null>(null);
  
  const [streamingEnabled, setStreamingEnabled] = useState<boolean>(false);
  const [advancedHistorySummaryEnabled, setAdvancedHistorySummaryEnabled] = useState<boolean>(false);
  const [agentOverridesDraft, setAgentOverridesDraft] = useState<Record<string, any>>({});
  const [showAgentOverrides, setShowAgentOverrides] = useState<boolean>(false);
  const [showLlmConfiguration, setShowLlmConfiguration] = useState<boolean>(false);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    basicSettings: true, llmSettings: true, webSearchSettings: false, serverConnections: false
  });

  const [webSearchProvider, setWebSearchProvider] = useState<'tavily' | 'google' | 'brave' | 'custom'>('tavily');
  const [webSearchApiKey, setWebSearchApiKey] = useState<string>('');
  const [webSearchEndpoint, setWebSearchEndpoint] = useState<string>('');

  const [summarizeTokenLimit, setSummarizeTokenLimit] = useState<number>(0.75);
  const [thinkingLanguage, setThinkingLanguage] = useState<string>('English');
  const [userLanguage, setUserLanguage] = useState<string>('English');
  const [maxContextOverride, setMaxContextOverride] = useState<number | undefined>(undefined);
  const [useVSCodeThinkingLang, setUseVSCodeThinkingLang] = useState<boolean>(false);
  const [useVSCodeUserLang, setUseVSCodeUserLang] = useState<boolean>(false);
  
  const [configuredItems, setConfiguredItems] = useState<{ mcp: string[]; a2a: string[]; prompts: { name: string; content: string }[] }>({ mcp: [], a2a: [], prompts: [] });
  const [mcpHealthStatus, setMcpHealthStatus] = useState<Record<string, any>>({});
  const [a2aHealthStatus, setA2aHealthStatus] = useState<Record<string, any>>({});
  const [expandedServerTools, setExpandedServerTools] = useState<Record<string, boolean>>({});
  const [mcpEnabledState, setMcpEnabledState] = useState<{ servers: Record<string, boolean>; tools: Record<string, Record<string, boolean>> }>({ servers: {}, tools: {} });
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'agentListResponse' || message.command === 'agentsResponse' || message.command === 'updateAgentList') {
        setAgents(message.payload || message.agents || []);
      } else if (message.command === 'llmSettingsResponse') {
        const p = message.payload;
        if (p) {
          const provider = p.llmProvider;
          setLlmSettings({
            llmProvider: provider,
            endpoint: p.endpoint || (provider === 'openai' ? p.openaiEndpoint : provider === 'ollama' ? p.ollamaEndpoint : provider === 'anthropic' ? p.anthropicEndpoint : provider === 'xai' ? p.xaiEndpoint : provider === 'google' ? p.googleEndpoint : provider === 'groq' ? p.groqEndpoint : provider === 'openrouter' ? p.openrouterEndpoint : provider === 'zai' ? p.zaiEndpoint : '') || '',
            apiKey: p.apiKey || (provider === 'openai' ? p.openaiApiKeys : provider === 'ollama' ? p.ollamaApiKey : provider === 'anthropic' ? p.anthropicApiKey : provider === 'xai' ? p.xaiApiKey : provider === 'google' ? p.googleApiKey : provider === 'groq' ? p.groqApiKey : provider === 'openrouter' ? p.openrouterApiKey : provider === 'zai' ? p.zaiApiKey : '') || '',
            ollamaIsCloud: !!p.ollamaIsCloud, isCodingPlan: !!p.isCodingPlan, model: p.model || '', modelMaxContext: p.modelMaxContext
          });
        }
      } else if (message.command === 'featureToggles') {
        const p = message.payload || {};
        setStreamingEnabled(!!p.streamingEnabled);
        setAdvancedHistorySummaryEnabled(!!p.advancedHistorySummaryEnabled);
        if (typeof p.summarizeTokenLimit === 'number') { setSummarizeTokenLimit(p.summarizeTokenLimit); }
        if (typeof p.thinkingLanguage === 'string') { setThinkingLanguage(p.thinkingLanguage); }
        if (typeof p.userLanguage === 'string') { setUserLanguage(p.userLanguage); }
        if (p.maxContextOverride !== undefined) { setMaxContextOverride(p.maxContextOverride); }
        if (p.useVSCodeThinkingLang !== undefined) { setUseVSCodeThinkingLang(p.useVSCodeThinkingLang); }
        if (p.useVSCodeUserLang !== undefined) { setUseVSCodeUserLang(p.useVSCodeUserLang); }
      } else if (message.command === 'profilesResponse') {
        setProfiles(message.payload?.profiles || []);
        setActiveProfileId(typeof message.payload?.activeProfileId === 'string' ? message.payload.activeProfileId : null);
      } else if (message.command === 'activeProfileChanged') {
        setActiveProfileId(typeof message.payload === 'string' ? message.payload : null);
      } else if (message.command === 'profileSaved' || message.command === 'profileDeleted') {
        if (message.command === 'profileSaved') {
          setEditingProfileId(prev => (!prev && message.payload?.id) ? message.payload.id : prev);
        }
        vscodeService.postMessage({ command: 'requestProfiles' });
      } else if (message.command === 'configuredItemsUpdate') {
         setConfiguredItems(message.payload);
         if (message.payload?.healthStatus) {
           if (message.payload.healthStatus.mcp) { setMcpHealthStatus(message.payload.healthStatus.mcp); }
           if (message.payload.healthStatus.a2a) { setA2aHealthStatus(message.payload.healthStatus.a2a); }
         }
      } else if (message.command === 'modelMaxContextUpdated') {
         setLlmSettings(prev => ({ ...prev, modelMaxContext: message.payload }));
      }
    };

    window.addEventListener('message', handleMessage);
    vscodeService.postMessage({ command: 'requestAgentList' });
    vscodeService.postMessage({ command: 'requestLlmSettings' });
    vscodeService.postMessage({ command: 'requestProfiles' });
    vscodeService.postMessage({ command: 'requestFeatureToggles' });
    vscodeService.postMessage({ command: 'refreshConfiguredItems' });
    vscodeService.postMessage({ command: 'requestAgents' });

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    setMcpEnabledState(prev => {
        const newServers = { ...prev.servers };
        const newTools = { ...prev.tools };
        configuredItems.mcp.forEach(server => {
            if (newServers[server] === undefined) { newServers[server] = true; }
            const tools = mcpHealthStatus[server]?.tools || [];
            if (!newTools[server]) { newTools[server] = {}; }
            tools.forEach((tool: string) => {
                if (newTools[server][tool] === undefined) { newTools[server][tool] = true; }
            });
        });
        return { servers: newServers, tools: newTools };
    });
  }, [configuredItems.mcp, mcpHealthStatus]);

  const toggleGroup = (groupKey: string) => setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));

  const mergedAgents = useMemo(() => agents.map(agent => ({ card: { name: agent.name, description: agent.description }, path: agent.name })), [agents]);

  const handleLlmSettingChange = (key: keyof LlmSettings, value: any) => {
    setLlmSettings(prev => {
      const newState = { ...prev, [key]: value };
      if (key === 'llmProvider') { 
        newState.endpoint = getDefaultEndpoint(value); 
        // Request models for the new provider
        vscodeService.postMessage({ command: 'requestModels', payload: { provider: value, endpoint: newState.endpoint, apiKey: newState.apiKey } });
      }
      if (key === 'ollamaIsCloud' && newState.llmProvider === 'ollama') { 
        newState.endpoint = value ? '' : 'http://localhost:11434'; 
        vscodeService.postMessage({ command: 'requestModels', payload: { provider: 'ollama', endpoint: newState.endpoint, apiKey: newState.apiKey } });
      }
      if (key === 'isCodingPlan' && newState.llmProvider === 'zai') { newState.endpoint = value ? 'https://api.z.ai/api/coding/paas/v4' : 'https://api.z.ai/api/paas/v4'; }
      if (key === 'apiKey') {
        const provider = newState.llmProvider || 'openai';
        let isValid = validateApiKey(provider, value);
        if (provider === 'ollama' && newState.ollamaIsCloud) { isValid = !!(value && value.toString().trim().length > 0); }
        setValidationState(prev => ({ ...prev, apiKeyValid: !!isValid }));
      }
      if (key === 'endpoint') {
        setValidationState(prev => ({ ...prev, endpointValid: validateEndpoint(value) }));
        vscodeService.postMessage({ command: 'requestModels', payload: { provider: newState.llmProvider, endpoint: newState.endpoint, apiKey: newState.apiKey } });
      }
      return newState;
    });
    if (key === 'llmProvider' || key === 'ollamaIsCloud' || key === 'isCodingPlan') {
      const provider = key === 'llmProvider' ? value : llmSettings.llmProvider;
      let endpointForRequest = llmSettings.endpoint;
      if (key === 'llmProvider') { endpointForRequest = getDefaultEndpoint(value); }
      else if (key === 'ollamaIsCloud' && provider === 'ollama') { endpointForRequest = value ? '' : 'http://localhost:11434'; }
      else if (key === 'isCodingPlan' && provider === 'zai') { endpointForRequest = value ? 'https://api.z.ai/api/coding/paas/v4' : 'https://api.z.ai/api/paas/v4'; }
      vscodeService.postMessage({ command: 'requestModels', payload: { provider, endpoint: endpointForRequest, apiKey: llmSettings.apiKey } });
    }
  };

  const startAddProfile = () => {
    setProfileName('');
    setIsEditing(true);
    setShowAgentOverrides(false);
    setShowLlmConfiguration(true);
    setEditingProfileId(null);
    setAgentOverridesDraft({});
    setLlmSettings({ llmProvider: 'openai', endpoint: 'https://api.openai.com/v1', apiKey: '', ollamaIsCloud: false, isCodingPlan: false, model: '', modelMaxContext: 0 });
    setModels([]);
    
    // Request models for the default provider (openai)
    vscodeService.postMessage({ command: 'requestModels', payload: { provider: 'openai', endpoint: 'https://api.openai.com/v1', apiKey: '' } });
    
    setTimeout(() => {
        if (llmSectionRef.current) {
            llmSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);
    
    return true; 
  };

  const startEditProfile = (p: any) => {
    const isPerAgentProfile = Array.isArray(p.agentOverrides) && p.agentOverrides.length > 0;
    setProfileName(p.name || '');
    setEditingProfileId(p.id || null);
    setIsEditing(true);
    setAgentOverridesDraft(() => {
      const draft: Record<string, any> = {};
      const overrides = Array.isArray(p.agentOverrides) ? p.agentOverrides : [];
      overrides.forEach((o: any) => {
        if (!o || typeof o.agentName !== 'string') { return; }
        draft[o.agentName] = {
          useDefault: !!o.useDefault, model: o.model || '', endpoint: o.endpoint || '',
          profileId: typeof o.profileId === 'string' && o.profileId.length > 0 ? o.profileId : undefined,
          useExternal: !!o.useExternal, externalUrl: o.externalUrl || '',
        };
      });
      return draft;
    });
    setLlmSettings(prev => ({
      ...prev, llmProvider: p.provider, model: p.model || '',
      endpoint: p.endpoint !== undefined ? p.endpoint : getDefaultEndpoint(p.provider),
      apiKey: p.apiKey || '',
      ollamaIsCloud: p.ollamaIsCloud ?? (p.provider === 'ollama' && (p.endpoint?.includes('ollama.com') || false)),
      isCodingPlan: p.isCodingPlan ?? (p.provider === 'zai' && (p.endpoint?.includes('/coding/') || false)),
    }));
    setShowLlmConfiguration(true);
    setShowAgentOverrides(isPerAgentProfile);
    vscodeService.postMessage({ command: 'requestModels', payload: { provider: p.provider, endpoint: p.endpoint, apiKey: p.apiKey || '' } });
    
    // Scroll logic
    setTimeout(() => {
        if (isPerAgentProfile && perAgentSectionRef.current) {
            perAgentSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (llmSectionRef.current) {
            llmSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 100);

    return { isPerAgentProfile }; 
  };

  const cancelEditProfile = () => {
    setIsEditing(false);
    setEditingProfileId(null);
    setProfileName('');
    setAgentOverridesDraft({});
    setShowAgentOverrides(false);
    setShowLlmConfiguration(false);
  };

  const handleSaveProfileClick = () => {
    vscodeService.postMessage({ command: 'saveLlmSettings', payload: llmSettings });
    const name = (profileName && profileName.trim()) || 'Default Profile';
    const provider = llmSettings.llmProvider || 'openai';
    const model = llmSettings.model || '';
    const endpoint = llmSettings.endpoint || '';
    const apiKey = llmSettings.apiKey || '';

    const overridesArray = Object.entries(agentOverridesDraft || {}).map(([agentName, override]) => ({
      agentName, model: override.model, endpoint: override.endpoint, useDefault: !!override.useDefault,
      useExternal: !!override.useExternal, externalUrl: override.externalUrl, profileId: override.profileId,
    })).filter(o => !o.useDefault || (o.model && o.model.trim().length > 0) || (o.endpoint && o.endpoint.trim().length > 0) || o.useExternal || o.profileId);

    const profileBase: any = {
      name, provider, endpoint, model, enabled: true,
      agentOverrides: overridesArray.length > 0 ? overridesArray : undefined,
      ollamaIsCloud: llmSettings.ollamaIsCloud, isCodingPlan: llmSettings.isCodingPlan,
    };
    if (editingProfileId) { profileBase.id = editingProfileId; }

    vscodeService.postMessage({ command: 'saveProfile', payload: { profile: profileBase, apiKey, activateAfterSave: false } });
    vscodeService.postMessage({ command: 'requestProfiles' });
    vscodeService.postMessage({ command: 'requestModels', payload: { provider, endpoint, apiKey } });
  };

  return {
    state: {
      validationState, agents, llmSettings, models, profiles, activeProfileId, profileName, editingProfileId, isEditing,
      showModelSuggestions, streamingEnabled, advancedHistorySummaryEnabled, agentOverridesDraft, showAgentOverrides, showLlmConfiguration,
      expandedGroups, webSearchProvider, webSearchApiKey, webSearchEndpoint, summarizeTokenLimit, thinkingLanguage, userLanguage,
      maxContextOverride, useVSCodeThinkingLang, useVSCodeUserLang, configuredItems, mcpHealthStatus, a2aHealthStatus, expandedServerTools, mcpEnabledState, expandedPrompts,
      mergedAgents, 
      llmSectionRef, perAgentSectionRef, modelComboRef // exports refs
    },
    setters: {
      setLlmSettings, setShowModelSuggestions, setMaxContextOverride, setSummarizeTokenLimit, setWebSearchProvider, 
      setWebSearchEndpoint, setWebSearchApiKey, setShowAgentOverrides, setProfileName, setAgentOverridesDraft,
      setStreamingEnabled, setAdvancedHistorySummaryEnabled, setUseVSCodeThinkingLang, setUseVSCodeUserLang, setUserLanguage,
      setExpandedServerTools, setExpandedPrompts, setShowLlmConfiguration
    },
    handlers: {
      toggleGroup, startAddProfile, startEditProfile, handleSaveProfileClick, handleLlmSettingChange,
      cancelEditProfile,
      removeProfile: (id: string) => vscodeService.postMessage({ command: 'deleteProfile', payload: { id } }),
      activateProfile: (id: string) => vscodeService.postMessage({ command: 'setActiveProfile', payload: { id } }),
      toggleServerEnabled: (server: string, current: boolean) => {
        const newState = !current;
        setMcpEnabledState(prev => ({ ...prev, servers: { ...prev.servers, [server]: newState }}));
        vscodeService.postMessage({ command: 'updateMcpServerState', payload: { server, enabled: newState } });
      },
      toggleToolEnabled: (server: string, tool: string, current: boolean) => {
        const newState = !current;
        setMcpEnabledState(prev => ({
            ...prev, tools: { ...prev.tools, [server]: { ...(prev.tools[server] || {}), [tool]: newState } }
        }));
        vscodeService.postMessage({ command: 'updateMcpToolState', payload: { server, tool, enabled: newState } });
      },
      handleRemoveAgent: (agentName: string) => vscodeService.postMessage({ command: 'removeAgent', agentName }),
      handleAddMcpServer: (mcpNameInput: string, mcpCommandInput: string, mcpArgsInput: string) => {
        if (!mcpNameInput.trim() || !mcpCommandInput.trim() || !mcpArgsInput.trim()) {
          vscodeService.postMessage({ command: 'showInformationMessage', payload: 'Please fill in all MCP server fields before adding.' });
          return false;
        }
        vscodeService.postMessage({ command: 'addMcpServer', payload: { name: mcpNameInput.trim(), command: mcpCommandInput.trim(), args: mcpArgsInput.trim() }});
        return true;
      },
      handleAddA2aServer: (a2aNameInput: string, a2aUrlInput: string) => {
        if (!a2aNameInput.trim() || !a2aUrlInput.trim()) {
          vscodeService.postMessage({ command: 'showInformationMessage', payload: 'Please fill in all A2A server fields before adding.' });
          return false;
        }
        vscodeService.postMessage({ command: 'addA2aServer', payload: { name: a2aNameInput.trim(), url: a2aUrlInput.trim() }});
        return true;
      },
    }
  };
}
