import React from 'react';
import { VSCodeTextField } from '@vscode/webview-ui-toolkit/react';

interface ProviderSettingsProps {
  apiKey: string;
  endpoint: string;
  onApiKeyChange: (value: string) => void;
  onEndpointChange: (value: string) => void;
  apiKeyPlaceholder: string;
  endpointPlaceholder: string;
  apiKeyLabel?: string;
  endpointLabel?: string;
  apiKeyHelpTooltip?: string;
  provider?: string;
  validationState?: any;
  extraFields?: React.ReactNode;
}

export const ProviderSettings: React.FC<ProviderSettingsProps> = ({
  apiKey,
  endpoint,
  onApiKeyChange,
  onEndpointChange,
  apiKeyPlaceholder,
  endpointPlaceholder,
  apiKeyLabel = "API Key:",
  endpointLabel = "Endpoint:",
  apiKeyHelpTooltip,
  provider,
  validationState,
  extraFields,
}) => {
  return (
    <>
      <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
        <label htmlFor="api-key" style={{ minWidth: '120px', marginRight: '10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>{apiKeyLabel}</span>
          {apiKeyHelpTooltip ? (
            <span 
              className="codicon codicon-question"
              title={apiKeyHelpTooltip}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--vscode-icon-foreground)',
                fontSize: 14,
                lineHeight: 1,
                cursor: 'help'
              }}
            />
          ) : null}
        </label>
        <VSCodeTextField
          id="api-key"
          type="password"
          value={apiKey}
          onChange={(e: any) => onApiKeyChange(e.target.value)}
          placeholder={apiKeyPlaceholder}
          style={{ flexGrow: 1 }}
          title={apiKey ? 'API Key가 저장되어 있습니다' : undefined} />
      </div>
      <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
        <label htmlFor="endpoint" style={{ minWidth: '120px', marginRight: '10px' }}>{endpointLabel}</label>
        <VSCodeTextField
          id="endpoint"
          value={endpoint}
          onChange={(e: any) => onEndpointChange(e.target.value)}
          placeholder={endpointPlaceholder}
          style={{ flexGrow: 1, ...(endpoint ? {} : { color: 'var(--vscode-input-placeholderForeground)' }) }}
        />
      </div>
      {extraFields}
    </>
  );
};