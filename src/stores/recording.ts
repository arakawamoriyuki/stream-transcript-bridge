import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  RecordingStatusResponse,
  GenericResponse,
} from '@/shared/types/messages';

export const useRecordingStore = defineStore('recording', () => {
  // State
  const isRecording = ref(false);
  const tabId = ref<number | null>(null);
  const startedAt = ref<number | null>(null);
  const hasMic = ref<boolean | null>(null);
  const error = ref<string | null>(null);
  const isLoading = ref(false);

  // Computed
  const recordingDuration = computed(() => {
    if (!startedAt.value) return 0;
    return Math.floor((Date.now() - startedAt.value) / 1000);
  });

  // Actions
  async function fetchStatus(): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_RECORDING_STATUS',
      }) as RecordingStatusResponse;

      isRecording.value = response.isRecording;
      tabId.value = response.tabId ?? null;
      startedAt.value = response.startedAt ?? null;
      hasMic.value = response.hasMic ?? null;
      error.value = response.error ?? null;
    } catch (err) {
      console.error('Failed to fetch recording status:', err);
      error.value = err instanceof Error ? err.message : 'Unknown error';
    }
  }

  async function startRecording(): Promise<boolean> {
    if (isRecording.value || isLoading.value) {
      return false;
    }

    isLoading.value = true;
    error.value = null;

    try {
      // 現在アクティブなタブを取得
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        throw new Error('No active tab found');
      }

      const response = await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        tabId: tab.id,
      }) as GenericResponse;

      if (response.success) {
        isRecording.value = true;
        tabId.value = tab.id;
        startedAt.value = Date.now();
        hasMic.value = null; // マイク状態は後から更新される
        return true;
      } else {
        error.value = response.error ?? 'Failed to start recording';
        return false;
      }
    } catch (err) {
      console.error('Failed to start recording:', err);
      error.value = err instanceof Error ? err.message : 'Unknown error';
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  async function stopRecording(): Promise<boolean> {
    if (!isRecording.value || isLoading.value) {
      return false;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'STOP_RECORDING',
      }) as GenericResponse;

      if (response.success) {
        isRecording.value = false;
        tabId.value = null;
        startedAt.value = null;
        hasMic.value = null;
        return true;
      } else {
        error.value = response.error ?? 'Failed to stop recording';
        return false;
      }
    } catch (err) {
      console.error('Failed to stop recording:', err);
      error.value = err instanceof Error ? err.message : 'Unknown error';
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  function clearError(): void {
    error.value = null;
  }

  return {
    // State
    isRecording,
    tabId,
    startedAt,
    hasMic,
    error,
    isLoading,

    // Computed
    recordingDuration,

    // Actions
    fetchStatus,
    startRecording,
    stopRecording,
    clearError,
  };
});
