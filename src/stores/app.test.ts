import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAppStore } from './app';

describe('useAppStore', () => {
  beforeEach(() => {
    // 各テストの前に新しい Pinia インスタンスを作成
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('初期状態', () => {
    it('version が設定されている', () => {
      const store = useAppStore();
      expect(store.version).toBe('0.1.0');
    });

    it('chromeApiAvailable が false', () => {
      const store = useAppStore();
      expect(store.chromeApiAvailable).toBe(false);
    });

    it('API キーが null', () => {
      const store = useAppStore();
      expect(store.openaiApiKey).toBeNull();
      expect(store.slackWebhookUrl).toBeNull();
    });
  });

  describe('checkChromeApi', () => {
    it('Chrome API が利用可能な場合、true を返す', () => {
      const store = useAppStore();
      const result = store.checkChromeApi();

      expect(result).toBe(true);
      expect(store.chromeApiAvailable).toBe(true);
    });

    it('Chrome API が利用不可の場合、false を返す', () => {
      // Chrome API を一時的に undefined にする
      const originalChrome = global.chrome;
      // @ts-ignore
      global.chrome = undefined;

      const store = useAppStore();
      const result = store.checkChromeApi();

      expect(result).toBe(false);
      expect(store.chromeApiAvailable).toBe(false);

      // 元に戻す
      global.chrome = originalChrome;
    });
  });

  describe('loadSettings', () => {
    it('Chrome API が利用不可の場合、何もしない', async () => {
      const store = useAppStore();
      store.chromeApiAvailable = false;

      await store.loadSettings();

      expect(chrome.storage.local.get).not.toHaveBeenCalled();
    });

    it('設定を読み込んで state を更新する', async () => {
      const mockSettings = {
        openaiApiKey: 'test-api-key',
        slackWebhookUrl: 'https://hooks.slack.com/test',
      };

      (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockSettings);

      const store = useAppStore();
      store.chromeApiAvailable = true;

      await store.loadSettings();

      expect(chrome.storage.local.get).toHaveBeenCalledWith(['openaiApiKey', 'slackWebhookUrl', 'translationPrompt']);
      expect(store.openaiApiKey).toBe('test-api-key');
      expect(store.slackWebhookUrl).toBe('https://hooks.slack.com/test');
    });

    it('設定が存在しない場合、null のまま', async () => {
      (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const store = useAppStore();
      store.chromeApiAvailable = true;

      await store.loadSettings();

      expect(store.openaiApiKey).toBeNull();
      expect(store.slackWebhookUrl).toBeNull();
    });
  });

  describe('saveSettings', () => {
    it('Chrome API が利用不可の場合、エラーを投げる', async () => {
      const store = useAppStore();
      store.chromeApiAvailable = false;

      await expect(
        store.saveSettings({ openaiApiKey: 'test-key' })
      ).rejects.toThrow('Chrome API is not available');
    });

    it('設定を保存して state を更新する', async () => {
      (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const store = useAppStore();
      store.chromeApiAvailable = true;

      await store.saveSettings({
        openaiApiKey: 'new-api-key',
        slackWebhookUrl: 'https://hooks.slack.com/new',
      });

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        openaiApiKey: 'new-api-key',
        slackWebhookUrl: 'https://hooks.slack.com/new',
      });
      expect(store.openaiApiKey).toBe('new-api-key');
      expect(store.slackWebhookUrl).toBe('https://hooks.slack.com/new');
    });

    it('一部の設定のみ更新できる', async () => {
      (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const store = useAppStore();
      store.chromeApiAvailable = true;
      store.openaiApiKey = 'existing-key';

      await store.saveSettings({
        slackWebhookUrl: 'https://hooks.slack.com/new',
      });

      expect(store.openaiApiKey).toBe('existing-key');
      expect(store.slackWebhookUrl).toBe('https://hooks.slack.com/new');
    });
  });

  describe('clearSettings', () => {
    it('すべての設定をクリアする', () => {
      const store = useAppStore();
      store.openaiApiKey = 'test-key';
      store.slackWebhookUrl = 'https://hooks.slack.com/test';

      store.clearSettings();

      expect(store.openaiApiKey).toBeNull();
      expect(store.slackWebhookUrl).toBeNull();
    });
  });
});
