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
let tabAudioElement: HTMLAudioElement | null = null;

/**
 * 音声キャプチャを開始
 */
async function startCapture(streamId: string): Promise<void> {
  try {
    console.log('[Offscreen] キャプチャ開始 streamId:', streamId);

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

    console.log('[Offscreen] タブ音声取得', {
      tracks: tabStream.getTracks().length,
      trackSettings: tabStream.getAudioTracks()[0]?.getSettings(),
    });

    // タブ音声を再生（ユーザーが聞けるように）
    tabAudioElement = new Audio();
    tabAudioElement.srcObject = tabStream;
    tabAudioElement.play();
    console.log('[Offscreen] タブ音声再生開始');

    // Mic Audio を取得（オプション）
    let micStream: MediaStream | null = null;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      console.log('[Offscreen] マイク音声取得');
    } catch (micError) {
      console.warn('[Offscreen] マイク取得失敗 - タブ音声のみで続行', micError);
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
      console.log('[Offscreen] チャンク生成', chunk.id, chunk.data.size, 'bytes');

      // Blob を ArrayBuffer に変換し、Base64 エンコード
      // 大きな配列はスプレッド演算子でスタックオーバーフローするため、チャンク処理
      const arrayBuffer = await chunk.data.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const slice = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, slice as unknown as number[]);
      }
      const base64 = btoa(binary);

      console.log('[Offscreen] Base64エンコード完了', base64.length, '文字');

      // Background に送信（Base64 文字列として）
      const message = {
        type: 'AUDIO_CHUNK',
        chunkId: chunk.id,
        data: base64,
        timestamp: chunk.timestamp,
        duration: chunk.duration,
      };

      chrome.runtime.sendMessage(message);
    });

    // 録音開始
    await audioMixer.start();

    // 状態を通知（マイク状態も含める）
    const statusMessage: CaptureStatusMessage = {
      type: 'CAPTURE_STATUS',
      isCapturing: true,
      hasMic: micStream !== null,
    };
    chrome.runtime.sendMessage(statusMessage);

    console.log('[Offscreen] キャプチャ開始完了', { hasMic: micStream !== null });
  } catch (error) {
    console.error('[Offscreen] キャプチャ開始失敗', error);

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
  console.log('[Offscreen] キャプチャ停止中');

  // タブ音声再生を停止
  if (tabAudioElement) {
    tabAudioElement.pause();
    tabAudioElement.srcObject = null;
    tabAudioElement = null;
  }

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

  console.log('[Offscreen] キャプチャ停止完了');
}

// メッセージリスナー
chrome.runtime.onMessage.addListener(
  (message: BackgroundToOffscreenMessage, _sender, _sendResponse) => {
    // この Offscreen Document 宛のメッセージかチェック
    if (!('target' in message) || message.target !== 'offscreen') {
      return;
    }

    console.log('[Offscreen] メッセージ受信', message.type);

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

console.log('[Offscreen] ドキュメント初期化完了');
