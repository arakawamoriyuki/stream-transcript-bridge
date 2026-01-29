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
  console.log('[Background] 文章完成', {
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
      console.warn('[Background] Slack クライアント未設定');
      return;
    }

    let translatedText: string | undefined;

    // GPT で翻訳（英語の場合のみ）
    if (gptClient && /^[a-zA-Z\s.,!?'"()-]+$/.test(text)) {
      try {
        const result = await gptClient.translate(text);
        translatedText = result.translatedText;
        console.log('[Background] 翻訳完了', { original: text, translated: translatedText });
      } catch (error) {
        console.error('[Background] 翻訳失敗', error);
      }
    }

    // Slack に投稿
    await slackClient.postTranscript(text, translatedText);
    console.log('[Background] Slack 投稿完了');
  } catch (error) {
    console.error('[Background] Slack 投稿失敗', error);
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
    console.error('[Background] クライアント初期化失敗', error);
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
    console.log('[Background] Offscreen ドキュメント作成完了');
  } catch (error) {
    // 既に存在する場合はエラーになるので、その場合は成功とみなす
    if ((error as Error).message?.includes('single offscreen document')) {
      offscreenDocumentCreated = true;
      console.log('[Background] Offscreen ドキュメントは既に存在');
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
  console.log('[Background] Offscreen ドキュメント終了');
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

    console.log('[Background] ストリームID取得', streamId);

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

    console.log('[Background] 録音開始 タブID:', tabId);

    return { success: true };
  } catch (error) {
    console.error('[Background] 録音開始失敗', error);
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

    console.log('[Background] 録音停止');

    return { success: true };
  } catch (error) {
    console.error('[Background] 録音停止失敗', error);
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
async function handleAudioChunk(message: {
  chunkId: string;
  data: string; // Base64 encoded
  timestamp: number;
  duration: number;
}): Promise<void> {
  // Base64 から ArrayBuffer にデコード
  const binaryString = atob(message.data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  console.log('[Background] 音声チャンク受信', {
    id: message.chunkId,
    timestamp: message.timestamp,
    duration: message.duration,
    size: bytes.length,
  });

  // クライアントを初期化
  await initClients();
  if (!whisperClient) {
    console.warn('[Background] Whisper クライアント未設定 - 文字起こしスキップ');
    return;
  }

  try {
    // デコードした bytes を Blob に変換
    const blob = new Blob([bytes], { type: 'audio/webm' });

    // Whisper API に送信
    const response = await whisperClient.transcribe({
      id: message.chunkId,
      data: blob,
      timestamp: message.timestamp,
      duration: message.duration,
    });

    console.log('[Background] 文字起こし結果', {
      chunkId: message.chunkId,
      text: response.text,
    });

    // バッファマネージャに渡して文章完成判定
    if (response.text) {
      bufferManager.processTranscript(response.text, message.timestamp);
    }
  } catch (error) {
    console.error('[Background] 文字起こし失敗', error);
  }
}

// メッセージリスナー
chrome.runtime.onMessage.addListener(
  (
    message: PopupToBackgroundMessage | OffscreenToBackgroundMessage,
    _sender,
    sendResponse
  ) => {
    console.log('[Background] メッセージ受信', message.type);

    // Offscreen からのメッセージ
    if (message.type === 'AUDIO_CHUNK') {
      handleAudioChunk(message as AudioChunkMessage);
      return;
    }

    if (message.type === 'CAPTURE_ERROR') {
      console.error('[Background] キャプチャエラー', (message as { error: string }).error);
      recordingState = { isRecording: false };
      return;
    }

    if (message.type === 'CAPTURE_STATUS') {
      const statusMsg = message as CaptureStatusMessage;
      console.log('[Background] キャプチャ状態', {
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

console.log('[Background] Service Worker 初期化完了');
