import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from './App.vue';
import { useAppStore } from '@/stores/app';

describe('App.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();

    // Mock chrome.runtime.sendMessage for recording store
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      isRecording: false,
    });

    // Mock chrome.storage.onChanged.addListener
    if (!chrome.storage.onChanged) {
      // @ts-expect-error - mock setup
      chrome.storage.onChanged = { addListener: vi.fn() };
    }

    // Mock navigator.permissions.query
    Object.defineProperty(navigator, 'permissions', {
      value: {
        query: vi.fn().mockResolvedValue({ state: 'denied' }),
      },
      writable: true,
    });
  });

  it('タイトルが表示される', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia()],
      },
    });

    expect(wrapper.text()).toContain('Stream Transcript Bridge');
  });

  it('バージョン情報が表示される', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia()],
      },
    });

    expect(wrapper.text()).toContain('Version 0.1.0');
  });

  it('タブが表示される', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia()],
      },
    });

    expect(wrapper.text()).toContain('ホーム');
    expect(wrapper.text()).toContain('設定');
  });

  it('設定が未完了の場合、設定タブが最初に表示される', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    store.openaiApiKey = null;
    store.slackWebhookUrl = null;

    const wrapper = mount(App, {
      global: {
        plugins: [pinia],
      },
    });

    // onMounted が完了するまで待つ
    await new Promise((resolve) => setTimeout(resolve, 10));
    await wrapper.vm.$nextTick();

    // 設定フォームが表示されている
    expect(wrapper.find('input#openaiApiKey').exists()).toBe(true);
  });

  it('設定が完了している場合、ホームタブが最初に表示される', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    store.openaiApiKey = 'sk-test123';
    store.slackWebhookUrl = 'https://hooks.slack.com/services/test';

    const wrapper = mount(App, {
      global: {
        plugins: [pinia],
      },
    });

    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('設定完了');
  });

  it('設定未完了の警告が表示される', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    store.openaiApiKey = null;
    store.slackWebhookUrl = null;

    const wrapper = mount(App, {
      global: {
        plugins: [pinia],
      },
    });

    // ホームタブに切り替え
    const homeTab = wrapper.findAll('button').find(btn => btn.text() === 'ホーム');
    await homeTab?.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('設定が必要です');
  });

  it('Chrome API の状態が表示される', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    store.chromeApiAvailable = true;
    store.openaiApiKey = 'sk-test123';
    store.slackWebhookUrl = 'https://hooks.slack.com/services/test';

    const wrapper = mount(App, {
      global: {
        plugins: [pinia],
      },
    });

    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Chrome API');
    expect(wrapper.text()).toMatch(/Chrome API[\s\S]*?OK/);
  });

  it('タブを切り替えられる', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    store.openaiApiKey = 'sk-test123';
    store.slackWebhookUrl = 'https://hooks.slack.com/services/test';

    const wrapper = mount(App, {
      global: {
        plugins: [pinia],
      },
    });

    await wrapper.vm.$nextTick();

    // 最初はホームタブ
    expect(wrapper.text()).toContain('設定完了');

    // 設定タブに切り替え
    const settingsTab = wrapper.findAll('button').find(btn => btn.text() === '設定');
    await settingsTab?.trigger('click');
    await wrapper.vm.$nextTick();

    // 設定フォームが表示される
    expect(wrapper.find('input#openaiApiKey').exists()).toBe(true);
  });

  it('マウント時に Chrome API をチェックする', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    const checkChromeApiSpy = vi.spyOn(store, 'checkChromeApi');

    mount(App, {
      global: {
        plugins: [pinia],
      },
    });

    expect(checkChromeApiSpy).toHaveBeenCalled();
  });

  it('Chrome API が利用可能な場合、設定を読み込む', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    store.chromeApiAvailable = true;
    const loadSettingsSpy = vi.spyOn(store, 'loadSettings');

    mount(App, {
      global: {
        plugins: [pinia],
      },
    });

    // onMounted は非同期なので少し待つ
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadSettingsSpy).toHaveBeenCalled();
  });
});
