import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import SettingsForm from './SettingsForm.vue';
import { useAppStore, DEFAULT_TRANSLATION_PROMPT } from '@/stores/app';

describe('SettingsForm.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('フォームが表示される', () => {
    const wrapper = mount(SettingsForm, {
      global: {
        plugins: [createPinia()],
      },
    });

    expect(wrapper.find('input#openaiApiKey').exists()).toBe(true);
    expect(wrapper.find('input#slackWebhookUrl').exists()).toBe(true);
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true);
  });

  it('既存の設定が読み込まれる', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    store.openaiApiKey = 'sk-test123';
    store.slackWebhookUrl = 'https://hooks.slack.com/services/test';

    const wrapper = mount(SettingsForm, {
      global: {
        plugins: [pinia],
      },
    });

    await wrapper.vm.$nextTick();

    const apiKeyInput = wrapper.find('input#openaiApiKey').element as HTMLInputElement;
    const webhookInput = wrapper.find('input#slackWebhookUrl').element as HTMLInputElement;

    expect(apiKeyInput.value).toBe('sk-test123');
    expect(webhookInput.value).toBe('https://hooks.slack.com/services/test');
  });

  it('バリデーションエラーが表示される（空の入力）', async () => {
    const wrapper = mount(SettingsForm, {
      global: {
        plugins: [createPinia()],
      },
    });

    await wrapper.find('form').trigger('submit.prevent');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('API キーを入力してください');
    expect(wrapper.text()).toContain('Webhook URL を入力してください');
  });

  it('バリデーションエラーが表示される（不正な形式）', async () => {
    const wrapper = mount(SettingsForm, {
      global: {
        plugins: [createPinia()],
      },
    });

    await wrapper.find('input#openaiApiKey').setValue('invalid-key');
    await wrapper.find('input#slackWebhookUrl').setValue('https://invalid-url.com');
    await wrapper.find('form').trigger('submit.prevent');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('sk- で始まる必要があります');
    expect(wrapper.text()).toContain('正しい Slack Webhook URL を入力してください');
  });

  it('正しい入力で保存が成功する', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    store.chromeApiAvailable = true;
    vi.spyOn(store, 'saveSettings').mockResolvedValue();

    const wrapper = mount(SettingsForm, {
      global: {
        plugins: [pinia],
      },
    });

    await wrapper.find('input#openaiApiKey').setValue('sk-test123');
    await wrapper.find('input#slackWebhookUrl').setValue('https://hooks.slack.com/services/test');
    await wrapper.find('form').trigger('submit.prevent');
    await wrapper.vm.$nextTick();

    expect(store.saveSettings).toHaveBeenCalledWith({
      openaiApiKey: 'sk-test123',
      slackWebhookUrl: 'https://hooks.slack.com/services/test',
      translationPrompt: DEFAULT_TRANSLATION_PROMPT,
    });

    // 成功メッセージの確認
    await new Promise(resolve => setTimeout(resolve, 0));
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('設定を保存しました');
  });

  it('保存中はボタンが無効化される', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useAppStore();
    store.chromeApiAvailable = true;

    // saveSettings を遅延させる
    vi.spyOn(store, 'saveSettings').mockImplementation(() => {
      return new Promise(resolve => setTimeout(resolve, 100));
    });

    const wrapper = mount(SettingsForm, {
      global: {
        plugins: [pinia],
      },
    });

    await wrapper.find('input#openaiApiKey').setValue('sk-test123');
    await wrapper.find('input#slackWebhookUrl').setValue('https://hooks.slack.com/services/test');

    const submitButton = wrapper.find('button[type="submit"]');
    await wrapper.find('form').trigger('submit.prevent');
    await wrapper.vm.$nextTick();

    expect(submitButton.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('保存中...');
  });
});
