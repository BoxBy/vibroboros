import React from 'react';
import { VSCodeCheckbox } from '@vscode/webview-ui-toolkit/react';

interface FeaturesPanelProps {
  streamingEnabled: boolean;
  advancedHistorySummaryEnabled: boolean;
  useVSCodeThinkingLang: boolean;
  useVSCodeUserLang: boolean;
  userLanguage: string;
  setStreamingEnabled: (val: boolean) => void;
  setAdvancedHistorySummaryEnabled: (val: boolean) => void;
  setUseVSCodeThinkingLang: (val: boolean) => void;
  setUseVSCodeUserLang: (val: boolean) => void;
  setUserLanguage: (val: string) => void;
  vscodeService: any;
}

export const FeaturesPanel: React.FC<FeaturesPanelProps> = ({
  streamingEnabled,
  advancedHistorySummaryEnabled,
  useVSCodeThinkingLang,
  useVSCodeUserLang,
  userLanguage,
  setStreamingEnabled,
  setAdvancedHistorySummaryEnabled,
  setUseVSCodeThinkingLang,
  setUseVSCodeUserLang,
  setUserLanguage,
  vscodeService
}) => {
  return (
    <div className="settings-section">
      <h3>Features</h3>
      
      <div className="setting-item" style={{ display: 'flex', alignItems: 'center', marginBottom: 8, justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 600 }}>Streaming Mode</div>
          <div style={{ opacity: 0.8, fontSize: 12 }}>Stream LLM responses as they arrive.</div>
        </div>
        <VSCodeCheckbox
          checked={streamingEnabled}
          onChange={() => {
            const val = !streamingEnabled;
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
          onChange={() => {
            const val = !advancedHistorySummaryEnabled;
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
              onChange={() => {
                  const checked = !useVSCodeThinkingLang;
                  setUseVSCodeThinkingLang(checked);
                  vscodeService.postMessage({ command: 'setUseVSCodeThinkingLang', payload: { use: checked } });
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
              onChange={() => {
                  const checked = !useVSCodeUserLang;
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
  );
};
