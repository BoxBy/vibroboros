import { isValidUrl } from './urlValidator';

export const validateApiKey = (provider: string, apiKey: string): boolean => {
  if (!apiKey) return false;

  const patterns: { [key: string]: RegExp } = {
    openai: /^sk-[a-zA-Z0-9]{48}$/,
    anthropic: /^sk-ant-api03-[a-zA-Z0-9]{48}$/,
    xai: /^sk-xai-[a-zA-Z0-9]{48}$/,
    google: /^AIza[a-zA-Z0-9_-]{35}$/,
    groq: /^gsk_[a-zA-Z0-9]{48}$/,
    openrouter: /^sk-or-v2-[a-zA-Z0-9]{48}$/,
    ollama: /.*/  // Ollama API key is optional, so any format is acceptable
  };

  return patterns[provider] ? patterns[provider].test(apiKey) : false;
};

export const validateEndpoint = (endpoint: string): boolean => {
  return isValidUrl(endpoint);
};

export const getDefaultEndpoint = (provider: string): string => {
  const defaults: { [key: string]: string } = {
    openai: 'https://api.openai.com/v1',
    ollama: 'http://localhost:11434',
    anthropic: 'https://api.anthropic.com/v1',
    xai: 'https://api.xai.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
    groq: 'https://api.groq.com/openai/v1',
    openrouter: 'https://openrouter.ai/api/v1'
  };

  return defaults[provider] || '';
};