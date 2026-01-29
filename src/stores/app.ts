import { defineStore } from 'pinia';
import { ref } from 'vue';

// デフォルトの翻訳プロンプト
export const DEFAULT_TRANSLATION_PROMPT = `あなたは翻訳者です。与えられたテキストを以下の形式で出力してください：

🇺🇸 En: [英語訳]
🇯🇵 Ja: [日本語訳]

説明は不要です。翻訳結果のみを出力してください。`;

export const useAppStore = defineStore('app', () => {
  // State
  const version = ref('0.1.0');
  const chromeApiAvailable = ref(false);
  const openaiApiKey = ref<string | null>(null);
  const slackWebhookUrl = ref<string | null>(null);
  const translationPrompt = ref<string>(DEFAULT_TRANSLATION_PROMPT);

  // Actions
  function checkChromeApi() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chromeApiAvailable.value = true;
      return true;
    }
    chromeApiAvailable.value = false;
    return false;
  }

  async function loadSettings() {
    if (!chromeApiAvailable.value) {
      return;
    }

    try {
      const result = await chrome.storage.local.get(['openaiApiKey', 'slackWebhookUrl', 'translationPrompt']);
      openaiApiKey.value = result.openaiApiKey || null;
      slackWebhookUrl.value = result.slackWebhookUrl || null;
      translationPrompt.value = result.translationPrompt || DEFAULT_TRANSLATION_PROMPT;
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  async function saveSettings(settings: { openaiApiKey?: string; slackWebhookUrl?: string; translationPrompt?: string }) {
    if (!chromeApiAvailable.value) {
      throw new Error('Chrome API is not available');
    }

    try {
      await chrome.storage.local.set(settings);

      if (settings.openaiApiKey !== undefined) {
        openaiApiKey.value = settings.openaiApiKey;
      }
      if (settings.slackWebhookUrl !== undefined) {
        slackWebhookUrl.value = settings.slackWebhookUrl;
      }
      if (settings.translationPrompt !== undefined) {
        translationPrompt.value = settings.translationPrompt;
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  }

  function clearSettings() {
    openaiApiKey.value = null;
    slackWebhookUrl.value = null;
    translationPrompt.value = DEFAULT_TRANSLATION_PROMPT;
  }

  async function resetAllSettings() {
    if (!chromeApiAvailable.value) {
      throw new Error('Chrome API is not available');
    }

    try {
      await chrome.storage.local.clear();
      clearSettings();
    } catch (error) {
      console.error('Failed to reset settings:', error);
      throw error;
    }
  }

  return {
    // State
    version,
    chromeApiAvailable,
    openaiApiKey,
    slackWebhookUrl,
    translationPrompt,

    // Actions
    checkChromeApi,
    loadSettings,
    saveSettings,
    clearSettings,
    resetAllSettings,
  };
});
