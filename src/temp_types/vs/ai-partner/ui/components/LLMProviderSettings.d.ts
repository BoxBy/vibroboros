import React from 'react';
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
}
export declare const ProviderSettings: React.FC<ProviderSettingsProps>;
export {};
