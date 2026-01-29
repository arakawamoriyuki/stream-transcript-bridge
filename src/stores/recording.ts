import { defineStore } from 'pinia';
import { ref, onUnmounted } from 'vue';
import type {
  RecordingStatusResponse,
  GenericResponse,
} from '@/shared/types/messages';

export interface TranscriptLog {
  id: string;
  text: string;
  type: 'posted' | 'buffer';
  timestamp: number;
}

export const useRecordingStore = defineStore('recording', () => {
  // State
  const isRecording = ref(false);
  const tabId = ref<number | null>(null);
  const startedAt = ref<number | null>(null);
  const hasMic = ref<boolean | null>(null);
  const error = ref<string | null>(null);
  const isLoading = ref(false);
  const recordingDuration = ref(0);
  const logs = ref<TranscriptLog[]>([]);
  let durationTimer: ReturnType<typeof setInterval> | null = null;

  // タイマーを開始
  function startDurationTimer(): void {
    stopDurationTimer();
    recordingDuration.value = 0;
    durationTimer = setInterval(() => {
      if (startedAt.value) {
        recordingDuration.value = Math.floor((Date.now() - startedAt.value) / 1000);
      }
    }, 1000);
  }

  // タイマーを停止
  function stopDurationTimer(): void {
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = null;
    }
    recordingDuration.value = 0;
  }

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

      // 録音中ならタイマーを開始
      if (response.isRecording && response.startedAt) {
        startDurationTimer();
      } else {
        stopDurationTimer();
      }
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
      // マイク権限を事前に取得（Offscreen で使えるようにするため）
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // 取得したストリームは即座に停止（権限だけ欲しい）
        stream.getTracks().forEach(track => track.stop());
        console.log('[Recording] マイク権限取得成功');
      } catch (micError) {
        console.warn('[Recording] マイク権限取得失敗（タブ音声のみで続行）', micError);
      }

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
        startDurationTimer();
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
        stopDurationTimer();
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

  function addLog(text: string, type: 'posted' | 'buffer'): void {
    logs.value.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      type,
      timestamp: Date.now(),
    });
    // 最大50件に制限
    if (logs.value.length > 50) {
      logs.value = logs.value.slice(0, 50);
    }
  }

  function clearLogs(): void {
    logs.value = [];
  }

  // storage の変更を監視してログを更新
  function setupLogListener(): void {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.transcriptLogs) {
          const newLogs = changes.transcriptLogs.newValue || [];
          logs.value = newLogs;
        }
      });
      // 初期読み込み
      chrome.storage.local.get(['transcriptLogs'], (result) => {
        if (result.transcriptLogs) {
          logs.value = result.transcriptLogs;
        }
      });
    }
  }

  return {
    // State
    isRecording,
    tabId,
    startedAt,
    hasMic,
    error,
    isLoading,
    logs,

    // Computed
    recordingDuration,

    // Actions
    fetchStatus,
    startRecording,
    stopRecording,
    clearError,
    addLog,
    clearLogs,
    setupLogListener,
  };
});
