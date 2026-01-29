/**
 * Whisper API クライアント
 *
 * OpenAI Whisper API を使用して音声をテキストに変換する
 */

import type { IWhisperRepository } from '@/domain/repositories/IWhisperRepository';
import type { AudioChunk, WhisperResponse } from '@/shared/types';

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-1';

export class WhisperClient implements IWhisperRepository {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * API キーを更新
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * 音声チャンクを文字起こし
   */
  async transcribe(audioChunk: AudioChunk): Promise<WhisperResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is not set');
    }

    // FormData を作成
    const formData = new FormData();

    // Blob を File に変換（Whisper API は拡張子が必要）
    // 明示的に audio/webm を指定
    const file = new File([audioChunk.data], 'audio.webm', {
      type: 'audio/webm',
    });

    console.log('[Whisper] ファイル送信', {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    formData.append('file', file);
    formData.append('model', WHISPER_MODEL);
    // language を指定しないと自動検出（原文の言語で出力）
    formData.append('response_format', 'json');

    // API リクエスト
    const response = await fetch(WHISPER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    return {
      text: result.text || '',
    };
  }
}
