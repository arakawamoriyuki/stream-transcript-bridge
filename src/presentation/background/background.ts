/**
 * Background Service Worker
 *
 * Popup からのメッセージを処理し、tabCapture API と Offscreen Document を管理する
 */

import type {
  PopupToBackgroundMessage,
  RecordingStatusResponse,
  GenericResponse,
  RecordingState,
  OffscreenToBackgroundMessage,
  AudioChunkMessage,
  CaptureStatusMessage,
} from '@/shared/types/messages';
import { WhisperClient } from '@/infrastructure/openai/WhisperClient';
import { GptClient } from '@/infrastructure/openai/GptClient';
import { SlackClient } from '@/infrastructure/slack/SlackClient';
import { TranscriptBufferManager } from '@/application/usecases/TranscriptBufferManager';

// クライアント（API キー設定後に初期化）
let whisperClient: WhisperClient | null = null;
let gptClient: GptClient | null = null;
let slackClient: SlackClient | null = null;

// バッファマネージャ
const bufferManager = new TranscriptBufferManager();

// 文章完成時のコールバックを設定
bufferManager.setOnSentenceComplete(async (sentence) => {
  console.log('Background: Sentence completed', {
    text: sentence.text,
    timestamp: sentence.timestamp,
  });

  // GPT で翻訳し、Slack に投稿
  await processAndPostToSlack(sentence.text);
});

/**
 * 文章を翻訳して Slack に投稿
 */
async function processAndPostToSlack(text: string): Promise<void> {
  try {
    // クライアントを初期化
    await initClients();

    if (!slackClient) {
      console.warn('Background: Slack client not available');
      return;
    }

    let translatedText: string | undefined;

    // GPT で翻訳（英語の場合のみ）
    if (gptClient && /^[a-zA-Z\s.,!?'"()-]+$/.test(text)) {
      try {
        const result = await gptClient.translate(text);
        translatedText = result.translatedText;
        console.log('Background: Translated', { original: text, translated: translatedText });
      } catch (error) {
        console.error('Background: Translation failed', error);
      }
    }

    // Slack に投稿
    await slackClient.postTranscript(text, translatedText);
    console.log('Background: Posted to Slack');
  } catch (error) {
    console.error('Background: Failed to post to Slack', error);
  }
}

/**
 * クライアントを初期化
 */
async function initClients(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['openaiApiKey', 'slackWebhookUrl']);

    if (result.openaiApiKey) {
      if (!whisperClient) {
        whisperClient = new WhisperClient(result.openaiApiKey);
      } else {
        whisperClient.setApiKey(result.openaiApiKey);
      }

      if (!gptClient) {
        gptClient = new GptClient(result.openaiApiKey);
      } else {
        gptClient.setApiKey(result.openaiApiKey);
      }
    }

    if (result.slackWebhookUrl) {
      if (!slackClient) {
        slackClient = new SlackClient(result.slackWebhookUrl);
      } else {
        slackClient.setWebhookUrl(result.slackWebhookUrl);
      }
    }
  } catch (error) {
    console.error('Background: Failed to init clients', error);
  }
}

// 録音状態
let recordingState: RecordingState = {
  isRecording: false,
};

// Offscreen Document が作成済みかどうか
let offscreenDocumentCreated = false;

/**
 * Offscreen Document を作成
 */
async function createOffscreenDocument(): Promise<void> {
  if (offscreenDocumentCreated) {
    return;
  }

  // 既存の Offscreen Document をチェック
  // Note: chrome.runtime.getContexts は Chrome 116+ で利用可能
  // @ts-expect-error - TypeScript の型定義がまだ追いついていない
  if (chrome.runtime.getContexts) {
    // @ts-expect-error - TypeScript の型定義がまだ追いついていない
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
      documentUrls: [chrome.runtime.getURL('offscreen.html')],
    });

    if (existingContexts.length > 0) {
      offscreenDocumentCreated = true;
      return;
    }
  }

  // Offscreen Document を作成
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Recording tab audio and microphone for transcription',
    });
    offscreenDocumentCreated = true;
    console.log('Background: Offscreen document created');
  } catch (error) {
    // 既に存在する場合はエラーになるので、その場合は成功とみなす
    if ((error as Error).message?.includes('single offscreen document')) {
      offscreenDocumentCreated = true;
      console.log('Background: Offscreen document already exists');
    } else {
      throw error;
    }
  }
}

/**
 * Offscreen Document を閉じる
 */
async function closeOffscreenDocument(): Promise<void> {
  if (!offscreenDocumentCreated) {
    return;
  }

  await chrome.offscreen.closeDocument();
  offscreenDocumentCreated = false;
  console.log('Background: Offscreen document closed');
}

/**
 * タブの MediaStream ID を Promise で取得
 */
function getMediaStreamIdAsync(options: chrome.tabCapture.GetMediaStreamOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId(options, (streamId) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(streamId);
      }
    });
  });
}

/**
 * 録音を開始
 */
async function startRecording(tabId: number): Promise<GenericResponse> {
  try {
    if (recordingState.isRecording) {
      return { success: false, error: 'Already recording' };
    }

    // タブの MediaStream ID を取得
    const streamId = await getMediaStreamIdAsync({
      targetTabId: tabId,
    });

    console.log('Background: Got stream ID', streamId);

    // バッファをクリア
    bufferManager.clear();

    // Offscreen Document を作成
    await createOffscreenDocument();

    // Offscreen に録音開始を通知
    await chrome.runtime.sendMessage({
      type: 'START_CAPTURE',
      target: 'offscreen',
      streamId,
    });

    // 状態を更新
    recordingState = {
      isRecording: true,
      tabId,
      startedAt: Date.now(),
    };

    console.log('Background: Recording started for tab', tabId);

    return { success: true };
  } catch (error) {
    console.error('Background: Failed to start recording', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 録音を停止
 */
async function stopRecording(): Promise<GenericResponse> {
  try {
    if (!recordingState.isRecording) {
      return { success: false, error: 'Not recording' };
    }

    // Offscreen に録音停止を通知
    await chrome.runtime.sendMessage({
      type: 'STOP_CAPTURE',
      target: 'offscreen',
    });

    // バッファをフラッシュ（未完成の文章も出力）
    bufferManager.flush();

    // 状態をリセット
    recordingState = {
      isRecording: false,
    };

    // Offscreen Document を閉じる
    await closeOffscreenDocument();

    console.log('Background: Recording stopped');

    return { success: true };
  } catch (error) {
    console.error('Background: Failed to stop recording', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * 録音状態を取得
 */
function getRecordingStatus(): RecordingStatusResponse {
  return {
    isRecording: recordingState.isRecording,
    tabId: recordingState.tabId,
    startedAt: recordingState.startedAt,
    hasMic: recordingState.hasMic,
  };
}

/**
 * AudioChunk を処理して Whisper API に送信
 */
async function handleAudioChunk(message: AudioChunkMessage): Promise<void> {
  console.log('Background: Received audio chunk', {
    id: message.chunkId,
    timestamp: message.timestamp,
    duration: message.duration,
    size: message.data.byteLength,
  });

  // クライアントを初期化
  await initClients();
  if (!whisperClient) {
    console.warn('Background: Skipping transcription - Whisper client not available');
    return;
  }

  try {
    // ArrayBuffer を Blob に変換
    const blob = new Blob([message.data], { type: 'audio/webm' });

    // Whisper API に送信
    const response = await whisperClient.transcribe({
      id: message.chunkId,
      data: blob,
      timestamp: message.timestamp,
      duration: message.duration,
    });

    console.log('Background: Transcription result', {
      chunkId: message.chunkId,
      text: response.text,
    });

    // バッファマネージャに渡して文章完成判定
    if (response.text) {
      bufferManager.processTranscript(response.text, message.timestamp);
    }
  } catch (error) {
    console.error('Background: Transcription failed', error);
  }
}

// メッセージリスナー
chrome.runtime.onMessage.addListener(
  (
    message: PopupToBackgroundMessage | OffscreenToBackgroundMessage,
    _sender,
    sendResponse
  ) => {
    console.log('Background: Received message', message.type);

    // Offscreen からのメッセージ
    if (message.type === 'AUDIO_CHUNK') {
      handleAudioChunk(message as AudioChunkMessage);
      return;
    }

    if (message.type === 'CAPTURE_ERROR') {
      console.error('Background: Capture error', (message as { error: string }).error);
      recordingState = { isRecording: false };
      return;
    }

    if (message.type === 'CAPTURE_STATUS') {
      const statusMsg = message as CaptureStatusMessage;
      console.log('Background: Capture status', {
        isCapturing: statusMsg.isCapturing,
        hasMic: statusMsg.hasMic,
      });
      // マイク状態を録音状態に保存
      if (statusMsg.hasMic !== undefined) {
        recordingState.hasMic = statusMsg.hasMic;
      }
      return;
    }

    // Popup からのメッセージ（非同期レスポンス）
    (async () => {
      switch (message.type) {
        case 'START_RECORDING': {
          const result = await startRecording(message.tabId);
          sendResponse(result);
          break;
        }
        case 'STOP_RECORDING': {
          const result = await stopRecording();
          sendResponse(result);
          break;
        }
        case 'GET_RECORDING_STATUS': {
          const status = getRecordingStatus();
          sendResponse(status);
          break;
        }
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    })();

    // 非同期レスポンスを返すため true を返す
    return true;
  }
);

console.log('Background: Service Worker initialized');
