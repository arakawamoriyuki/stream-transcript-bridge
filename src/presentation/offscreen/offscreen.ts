/**
 * Offscreen Document - 音声キャプチャ処理
 *
 * Background から受け取った streamId を使って getUserMedia で音声を取得し、
 * AudioMixer でミックス・チャンク分割して Background に送信する
 */

import { AudioMixer } from '@/infrastructure/audio/AudioMixer';
import type {
  BackgroundToOffscreenMessage,
  AudioChunkMessage,
  CaptureErrorMessage,
  CaptureStatusMessage,
} from '@/shared/types/messages';

let audioMixer: AudioMixer | null = null;

/**
 * 音声キャプチャを開始
 */
async function startCapture(streamId: string): Promise<void> {
  try {
    console.log('Offscreen: Starting capture with streamId', streamId);

    // Tab Audio を取得（streamId を使用）
    const tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // @ts-expect-error - Chrome Extension 固有の制約
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
        },
      },
      video: false,
    });

    console.log('Offscreen: Got tab stream');

    // Mic Audio を取得（オプション）
    let micStream: MediaStream | null = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      console.log('Offscreen: Got mic stream');
    } catch (micError) {
      console.warn('Offscreen: Could not get mic stream, continuing with tab audio only', micError);
    }

    // AudioMixer を作成
    audioMixer = new AudioMixer({
      chunkDuration: 10000, // 10秒
    });

    // Tab Audio を設定
    audioMixer.setTabStream(tabStream);

    // Mic Audio を設定（取得できた場合）
    if (micStream) {
      audioMixer.setMicStream(micStream);
    }

    // チャンク生成コールバックを設定
    audioMixer.setOnChunkCallback(async (chunk) => {
      console.log('Offscreen: Generated chunk', chunk.id, chunk.data.size, 'bytes');

      // Blob を ArrayBuffer に変換
      const arrayBuffer = await chunk.data.arrayBuffer();

      // Background に送信
      const message: AudioChunkMessage = {
        type: 'AUDIO_CHUNK',
        chunkId: chunk.id,
        data: arrayBuffer,
        timestamp: chunk.timestamp,
        duration: chunk.duration,
      };

      chrome.runtime.sendMessage(message);
    });

    // 録音開始
    audioMixer.start();

    // 状態を通知（マイク状態も含める）
    const statusMessage: CaptureStatusMessage = {
      type: 'CAPTURE_STATUS',
      isCapturing: true,
      hasMic: micStream !== null,
    };
    chrome.runtime.sendMessage(statusMessage);

    console.log('Offscreen: Capture started', { hasMic: micStream !== null });
  } catch (error) {
    console.error('Offscreen: Failed to start capture', error);

    const errorMessage: CaptureErrorMessage = {
      type: 'CAPTURE_ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    chrome.runtime.sendMessage(errorMessage);
  }
}

/**
 * 音声キャプチャを停止
 */
function stopCapture(): void {
  console.log('Offscreen: Stopping capture');

  if (audioMixer) {
    audioMixer.dispose();
    audioMixer = null;
  }

  // 状態を通知
  const statusMessage: CaptureStatusMessage = {
    type: 'CAPTURE_STATUS',
    isCapturing: false,
  };
  chrome.runtime.sendMessage(statusMessage);

  console.log('Offscreen: Capture stopped');
}

// メッセージリスナー
chrome.runtime.onMessage.addListener(
  (message: BackgroundToOffscreenMessage, _sender, _sendResponse) => {
    // この Offscreen Document 宛のメッセージかチェック
    if (!('target' in message) || message.target !== 'offscreen') {
      return;
    }

    console.log('Offscreen: Received message', message.type);

    switch (message.type) {
      case 'START_CAPTURE':
        startCapture(message.streamId);
        break;
      case 'STOP_CAPTURE':
        stopCapture();
        break;
    }
  }
);

console.log('Offscreen: Document initialized');
