import React from 'react';
import { VSCodeButton, VSCodeCheckbox, VSCodeDivider, VSCodeDropdown, VSCodeOption, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';
import { ProviderSettings } from './LLMProviderSettings';

export const LLMConfigPanel: React.FC<{
  state: any;
  setters: any;
  handlers: any;
  vscodeService: any;
}> = ({ state, setters, handlers, vscodeService }) => {
  const {
    profiles, activeProfileId, editingProfileId, profileName,
    showLlmConfiguration, llmSettings, models, showModelSuggestions,
    maxContextOverride, summarizeTokenLimit, validationState,
    llmSectionRef, modelComboRef
  } = state;

  React.useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (modelComboRef.current && !modelComboRef.current.contains(t)) {
        setters.setShowModelSuggestions(false);
      }
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [modelComboRef, setters]);

  return (
    <>
      <div className="settings-section" id="llm-configuration">
        <h3 style={{ marginTop: 0 }}>LLM Profiles</h3>
        <p>Manage multiple LLM endpoints and quickly switch between them.</p>

        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '8px', marginBottom: '12px' }}>
          <VSCodeButton onClick={handlers.startAddProfile}>New Profile</VSCodeButton>
        </div>

        <div className="profile-list" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!profiles || profiles.length === 0 ? (
            <div style={{ opacity: 0.8 }}>No profiles yet.</div>
          ) : profiles.map((p: any) => (
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
                <VSCodeButton onClick={() => handlers.startEditProfile(p)} disabled={editingProfileId === p.id}>Edit</VSCodeButton>
                <VSCodeButton onClick={() => handlers.activateProfile(p.id)} disabled={activeProfileId === p.id}>Activate</VSCodeButton>
                <VSCodeButton appearance="secondary" onClick={() => handlers.removeProfile(p.id)}>Delete</VSCodeButton>
              </div>
            </div>
          ))}
        </div>
      </div>

      <VSCodeDivider style={{ margin: '24px 0' }} />

      <div className="settings-section" ref={llmSectionRef} id="llm-configuration">
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setters.setShowLlmConfiguration((v: boolean) => !v)}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
            <span className={`codicon ${showLlmConfiguration ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
            <span>LLM Configuration</span>
          </h3>
          <span style={{ fontSize: 11, opacity: 0.7 }}>{showLlmConfiguration ? 'Hide' : 'Show'}</span>
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
            onInput={(e: any) => setters.setProfileName(e.target.value)}
            placeholder="e.g., My Local Llama"
            style={{ flexGrow: 1 }}
          />
        </div>

        <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
          <label htmlFor="llm-provider" style={{ minWidth: '120px', marginRight: '10px' }}>LLM Provider:</label>
          <VSCodeDropdown
            id="llm-provider"
            value={llmSettings.llmProvider}
            onChange={(e: any) => handlers.handleLlmSettingChange('llmProvider', e.target.value)}
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
                vscodeService.postMessage({ command: 'requestModels', payload: { provider: llmSettings.llmProvider, endpoint: llmSettings.endpoint, apiKey: llmSettings.apiKey, forceRefresh: true } });
                if (llmSettings.model && !llmSettings.modelMaxContext) {
                  vscodeService.postMessage({ command: 'selectModel', payload: { model: llmSettings.model, apiKey: llmSettings.apiKey } });
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
                handlers.handleLlmSettingChange('model', e.target.value);
                if (!showModelSuggestions && models.length > 0) setters.setShowModelSuggestions(true);
              }}
              placeholder={models.length ? 'Type a model name or pick from the list' : 'Loading models from the endpoint...'}
              style={{ width: '100%' }}
              onFocus={() => { if (models.length > 0) setters.setShowModelSuggestions(true); }}
            />
            <VSCodeButton appearance="secondary" onClick={() => setters.setShowModelSuggestions((v: boolean) => !v)} title="Show models" aria-label="Show models">
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
                marginTop: '4px',
                color: 'var(--vscode-foreground)',
                bottom: 'auto'
              }}>
                {models.length === 0 ? (
                  <div style={{ padding: '8px 12px', opacity: 0.7, fontSize: '12px' }}>No models found. Click Refresh to load.</div>
                ) : models.map((m: any) => (
                  <div
                    key={m.id}
                    className="suggestion-item"
                    onClick={() => {
                      handlers.handleLlmSettingChange('model', m.id);
                      setters.setShowModelSuggestions(false);
                      vscodeService.postMessage({ command: 'selectModel', payload: { model: m.id, apiKey: llmSettings.apiKey, endpoint: llmSettings.endpoint }});
                    }}
                    style={{ padding: '6px 12px', cursor: 'pointer', borderBottom: '1px solid var(--vscode-dropdown-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <span>{m.id}</span>
                    {m.maxContext && <span style={{ fontSize: '11px', opacity: 0.6, marginLeft: '8px' }}>{m.maxContext >= 1000 ? `${Math.round(m.maxContext / 1000)}k` : m.maxContext} ctx</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="setting-item" style={{ display: 'flex', flexDirection: 'column', marginBottom: '10px' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ minWidth: '120px', fontSize: '13px' }}>Max Context:</label>
                <VSCodeTextField
                    value={maxContextOverride !== undefined ? String(maxContextOverride) : ''}
                    onInput={(e: any) => {
                        const val = parseInt(e.target.value);
                        const newVal = isNaN(val) ? undefined : val;
                        setters.setMaxContextOverride(newVal);
                        vscodeService.postMessage({ command: 'setMaxContextOverride', payload: { limit: newVal } });
                    }}
                    placeholder={String(llmSettings.modelMaxContext || 8192)}
                    style={{ width: '120px' }}
                />
                <span style={{ fontSize: '12px', opacity: 0.7 }}>tokens</span>
             </div>
             {!maxContextOverride && (!llmSettings.modelMaxContext || llmSettings.modelMaxContext === 8192) && (
                <div style={{ color: 'var(--vscode-charts-yellow)', fontSize: '11px', marginTop: '4px', display: 'flex', gap: '4px', marginLeft: '130px' }}>
                     <span className="codicon codicon-warning"></span>
                     <span>Default limit (8192). Enter manually above if model supports more.</span>
                </div>
            )}
            <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '2px', marginLeft: '130px' }}>Leave empty to use auto-detected limit.</div>
        </div>

        <div className="setting-item" style={{ display: 'flex', flexDirection: 'column', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', gap: '10px' }}>
             <label style={{ minWidth: '120px', flexShrink: 0 }}>Summarize %:</label>
             <input
               type="text"
               value={(summarizeTokenLimit * 100).toString()}
               onChange={(e: any) => {
                   let val = parseFloat(e.target.value);
                   if (!isNaN(val)) setters.setSummarizeTokenLimit(Math.min(100, Math.max(0, val)) / 100);
               }}
               onBlur={(e: any) => {
                   let val = parseFloat(e.target.value);
                   if (!isNaN(val)) vscodeService.postMessage({ command: 'setSummarizeTokenLimit', payload: { limit: Math.min(100, Math.max(0, val)) / 100 } });
               }}
               placeholder="75"
               style={{ backgroundColor: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: '2px', padding: '3px 5px', width: '28px', height: '24px', fontFamily: 'var(--vscode-font-family)', fontSize: 'var(--vscode-font-size)', outline: 'none', textAlign: 'right' }}
             />
             <span style={{ opacity: 0.8, fontSize: '12px', whiteSpace: 'nowrap' }}>% of context allocated.</span>
          </div>
          
            <div style={{ marginLeft: '130px', fontSize: '12px', opacity: 0.9, backgroundColor: 'var(--vscode-textBlockQuote-background)', padding: '8px', borderRadius: '4px' }}>
            {(() => {
                const maxCtx = maxContextOverride || llmSettings.modelMaxContext || 4096;
                const sysPromptEst = 2000;
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

        {llmSettings.llmProvider && (
          <ProviderSettings
            apiKey={llmSettings.apiKey}
            endpoint={llmSettings.endpoint}
            validationState={validationState}
            onApiKeyChange={(v: string) => handlers.handleLlmSettingChange('apiKey', v)}
            onEndpointChange={(v: string) => handlers.handleLlmSettingChange('endpoint', v)}
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
                    <VSCodeButton onClick={handlers.handleSaveProfileClick}>Save Profile</VSCodeButton>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <label htmlFor="ollama-is-cloud" style={{ marginRight: '5px' }}>Cloud Hosted?</label>
                      <VSCodeCheckbox
                        id="ollama-is-cloud"
                        checked={llmSettings.ollamaIsCloud}
                        onChange={() => handlers.handleLlmSettingChange('ollamaIsCloud', !llmSettings.ollamaIsCloud)}
                      />
                    </div>
                  </div>
                )}
                {llmSettings.llmProvider === 'zai' && (
                  <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px', justifyContent: 'space-between' }}>
                    <VSCodeButton onClick={handlers.handleSaveProfileClick}>Save Profile</VSCodeButton>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <label htmlFor="zai-is-coding-plan" style={{ marginRight: '5px' }}>Use Coding Plan API</label>
                      <VSCodeCheckbox
                        id="zai-is-coding-plan"
                        checked={llmSettings.isCodingPlan}
                        onChange={() => handlers.handleLlmSettingChange('isCodingPlan', !llmSettings.isCodingPlan)}
                      />
                    </div>
                  </div>
                )}
              </>
            }
          />
        )}

        {llmSettings.llmProvider !== 'ollama' && llmSettings.llmProvider !== 'zai' && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '16px', gap: '8px' }}>
            <VSCodeButton onClick={handlers.handleSaveProfileClick}>Save Profile</VSCodeButton>
            {editingProfileId && (
              <VSCodeButton appearance="secondary" onClick={handlers.cancelEditProfile}>Cancel</VSCodeButton>
            )}
          </div>
        )}
        </>
        )}
      </div>
    </>
  );
};
