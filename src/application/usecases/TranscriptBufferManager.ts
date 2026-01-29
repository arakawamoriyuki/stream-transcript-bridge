/**
 * 文字起こしバッファマネージャ
 *
 * Whisper からの文字起こし結果を受け取り、文章完成判定を行う。
 * 完成した文章はコールバックで通知し、未完成の文はバッファに保持する。
 */

import { TranscriptCompletionService } from '@/domain/services/TranscriptCompletionService';

export interface CompletedSentence {
  text: string;
  timestamp: number;
}

export type OnSentenceCompleteCallback = (sentence: CompletedSentence) => void;

export class TranscriptBufferManager {
  private buffer: string = '';
  private bufferTimestamp: number = 0;
  private onSentenceComplete: OnSentenceCompleteCallback | null = null;

  /**
   * 文章完成時のコールバックを設定
   */
  setOnSentenceComplete(callback: OnSentenceCompleteCallback): void {
    this.onSentenceComplete = callback;
  }

  /**
   * 新しい文字起こし結果を処理
   *
   * @param text - Whisper からの文字起こしテキスト
   * @param timestamp - チャンクのタイムスタンプ
   */
  processTranscript(text: string, timestamp: number): void {
    if (!text || text.trim().length === 0) {
      return;
    }

    // バッファと新しいテキストを結合
    const mergedText = TranscriptCompletionService.mergeTexts(this.buffer, text);

    // タイムスタンプを更新（バッファが空の場合のみ）
    if (this.buffer.length === 0) {
      this.bufferTimestamp = timestamp;
    }

    // 文章単位で分割
    const sentences = TranscriptCompletionService.splitIntoSentences(mergedText);

    if (sentences.length === 0) {
      this.buffer = '';
      return;
    }

    // 最後の文以外は完成した文章として通知
    for (let i = 0; i < sentences.length - 1; i++) {
      this.notifySentenceComplete(sentences[i]);
    }

    // 最後の文を処理
    const lastSentence = sentences[sentences.length - 1];

    if (TranscriptCompletionService.isComplete(lastSentence)) {
      // 完成している場合は通知してバッファをクリア
      this.notifySentenceComplete(lastSentence);
      this.buffer = '';
      this.bufferTimestamp = 0;
    } else {
      // 未完成の場合はバッファに保持
      this.buffer = lastSentence;
    }
  }

  /**
   * 完成した文章を通知
   */
  private notifySentenceComplete(text: string): void {
    if (this.onSentenceComplete && text.trim().length > 0) {
      this.onSentenceComplete({
        text: text.trim(),
        timestamp: this.bufferTimestamp,
      });
    }
  }

  /**
   * バッファを強制的にフラッシュ（録音終了時など）
   */
  flush(): void {
    if (this.buffer.trim().length > 0 && this.onSentenceComplete) {
      this.onSentenceComplete({
        text: this.buffer.trim(),
        timestamp: this.bufferTimestamp,
      });
    }
    this.buffer = '';
    this.bufferTimestamp = 0;
  }

  /**
   * バッファをクリア
   */
  clear(): void {
    this.buffer = '';
    this.bufferTimestamp = 0;
  }

  /**
   * 現在のバッファ内容を取得（デバッグ用）
   */
  getBufferContent(): string {
    return this.buffer;
  }
}
