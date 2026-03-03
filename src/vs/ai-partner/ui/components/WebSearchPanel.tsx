import React from 'react';
import { VSCodeButton, VSCodeDropdown, VSCodeOption, VSCodeTextField } from '@vscode/webview-ui-toolkit/react';

export const WebSearchPanel: React.FC<{
  state: any;
  setters: any;
  vscodeService: any;
}> = ({ state, setters, vscodeService }) => {
  const { webSearchProvider, webSearchApiKey, webSearchEndpoint } = state;

  return (
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
            const val = e.target.value;
            setters.setWebSearchProvider(val);
            const defaultEndpoints: Record<string, string> = {
              tavily: 'https://api.tavily.com', google: 'https://www.googleapis.com/customsearch/v1', brave: 'https://api.search.brave.com', custom: ''
            };
            setters.setWebSearchEndpoint(defaultEndpoints[val] || '');
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
          onChange={(e: any) => setters.setWebSearchApiKey(e.target.value)}
          type="password"
          style={{ width: '100%' }}
        />
      </div>

      {/* Custom Endpoint */}
      {webSearchProvider === 'custom' && (
        <div className="setting-item" style={{ marginBottom: '10px' }}>
          <label htmlFor="websearch-endpoint" style={{ display: 'block', marginBottom: '6px', fontWeight: 600 }}>
            Custom Endpoint URL
          </label>
          <VSCodeTextField
            id="websearch-endpoint"
            placeholder="https://api.example.com/v1"
            value={webSearchEndpoint}
            onChange={(e: any) => setters.setWebSearchEndpoint(e.target.value)}
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
  );
};
