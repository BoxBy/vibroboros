import React from 'react';
import { VSCodeButton, VSCodeCheckbox, VSCodeDropdown, VSCodeOption, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';

export const AgentOverridesPanel: React.FC<{
  state: any;
  setters: any;
  handlers: any;
  vscodeService: any;
}> = ({ state, setters, handlers, vscodeService }) => {
  const {
    showAgentOverrides, profileName, activeProfileId, profiles,
    mergedAgents, agentOverridesDraft, models, perAgentSectionRef
  } = state;

  return (
    <div className="settings-section" ref={perAgentSectionRef}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setters.setShowAgentOverrides((v: boolean) => !v)}
      >
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
          <span className={`codicon ${showAgentOverrides ? 'codicon-chevron-down' : 'codicon-chevron-right'}`} />
          <span>Per-Agent LLM Overrides</span>
        </h3>
        <span style={{ fontSize: 11, opacity: 0.7 }}>{showAgentOverrides ? 'Hide' : 'Show'}</span>
      </div>
      <p style={{ opacity: 0.8, fontSize: 12, marginTop: 4 }}>
        Create profiles with custom models for specific agents. When "Use Default" is checked, the agent will use the active profile's model.
      </p>

      {showAgentOverrides && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <VSCodeTextField
              value={profileName}
              onInput={(e: any) => setters.setProfileName(e.target.value)}
              placeholder="Profile name (e.g., Coding vs. Docs)"
              style={{ flexGrow: 1, minWidth: 220 }}
            />
            <VSCodeButton appearance="primary" onClick={handlers.handleSaveProfileClick}>
              Save Profile
            </VSCodeButton>
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            Active profile: {activeProfileId ? (profiles.find((p: any) => p.id === activeProfileId)?.name || activeProfileId) : 'None'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {mergedAgents.map((agent: any) => {
              const agentName = agent.card?.name || agent.path || 'UnknownAgent';
              const override = agentOverridesDraft[agentName] || { useDefault: true, model: '', profileId: undefined, useExternal: false, externalUrl: '' };
              const effectiveProfileId = override.profileId || activeProfileId || '';
              const allModels: string[] = Array.from(new Set([
                ...profiles.map((p: any) => (p.model || '').trim()).filter((m: string) => !!m),
                ...(models || []).map((m: any) => (m.id || '').trim()).filter((m: string) => !!m),
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
                          setters.setAgentOverridesDraft((prev: any) => {
                            const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                            return { ...prev, [agentName]: { ...prevEntry, useDefault: !prevEntry.useDefault } };
                          });
                        }}
                      >Use Default</VSCodeCheckbox>
                    </div>
                    <div style={{ marginTop: 2 }}>
                        <VSCodeCheckbox
                            checked={!!override.useExternal}
                            onChange={() => {
                                setters.setAgentOverridesDraft((prev: any) => {
                                    const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                                    const newChecked = !prevEntry.useExternal;
                                    return { ...prev, [agentName]: { ...prevEntry, useExternal: newChecked, useDefault: newChecked ? false : prevEntry.useDefault } };
                                });
                            }}
                        >Override with External Agent</VSCodeCheckbox>
                    </div>
                    {override.useExternal && (
                        <div style={{ marginTop: 4 }}>
                            <VSCodeTextField
                                placeholder="Agent URL (e.g. http://localhost:8000/agent/foo/card)"
                                value={override.externalUrl || ''}
                                onInput={(e: any) => {
                                    const val = e.target.value;
                                    setters.setAgentOverridesDraft((prev: any) => {
                                        const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                                        return { ...prev, [agentName]: { ...prevEntry, externalUrl: val } };
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
                        setters.setAgentOverridesDraft((prev: any) => {
                          const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                          return { ...prev, [agentName]: { ...prevEntry, profileId: value || undefined } };
                        });
                        const p = profiles.find((p: any) => p.id === value);
                        if (p) vscodeService.postMessage({ command: 'requestModels', payload: { provider: p.provider, endpoint: p.endpoint, apiKey: p.apiKey || '' } });
                      }}
                    >
                      <VSCodeOption value="">
                        {activeProfileId ? `Active Profile (${(profiles || []).find((p: any) => p.id === activeProfileId)?.name || activeProfileId})` : 'Active Profile'}
                      </VSCodeOption>
                      {(profiles || []).filter((p: any) => !Array.isArray(p.agentOverrides) || p.agentOverrides.length === 0).map((p: any) => (
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
                          setters.setAgentOverridesDraft((prev: any) => {
                            const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                            return { ...prev, [agentName]: { ...prevEntry, useDefault: false, model: value } };
                          });
                        }}
                      >
                        <VSCodeOption value="">(Use profile model)</VSCodeOption>
                        {allModels.map(m => <VSCodeOption key={m} value={m}>{m}</VSCodeOption>)}
                      </VSCodeDropdown>
                    ) : (
                      <VSCodeTextField
                        style={{ width: '100%' }}
                        disabled={override.useDefault || override.useExternal}
                        value={override.model || ''}
                        placeholder="Custom model name"
                        onInput={(e: any) => {
                          const value = (e.target.value || '').toString();
                          setters.setAgentOverridesDraft((prev: any) => {
                            const prevEntry = prev[agentName] || { useDefault: true, model: '', profileId: undefined };
                            return { ...prev, [agentName]: { ...prevEntry, useDefault: false, model: value } };
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
                        setters.setAgentOverridesDraft((prev: any) => {
                          const prevEntry = prev[agentName] || { useDefault: true, model: '', endpoint: '' };
                          return { ...prev, [agentName]: { ...prevEntry, useDefault: false, endpoint: value } };
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
  );
};
