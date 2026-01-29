/**
 * AudioMixer - Tab Audio と Mic Audio をミックスし、チャンク単位で分割する
 *
 * Web Audio API を使用して複数の音声ストリームをミックスし、
 * 指定した間隔（デフォルト10秒）でチャンクを生成する
 */

export interface AudioChunkData {
  id: string;
  data: Blob;
  timestamp: number;
  duration: number;
}

export type OnChunkCallback = (chunk: AudioChunkData) => void;

export interface AudioMixerOptions {
  chunkDuration?: number; // チャンクの長さ（ミリ秒）、デフォルト 10000ms
  mimeType?: string; // 音声フォーマット、デフォルト 'audio/webm;codecs=opus'
}

const DEFAULT_CHUNK_DURATION = 10000; // 10秒
const DEFAULT_MIME_TYPE = 'audio/webm;codecs=opus';

export class AudioMixer {
  private audioContext: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private tabSource: MediaStreamAudioSourceNode | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private tabStream: MediaStream | null = null;
  private micStream: MediaStream | null = null;
  private onChunk: OnChunkCallback | null = null;
  private chunkDuration: number;
  private mimeType: string;
  private chunkStartTime: number = 0;
  private isRecording: boolean = false;
  private chunkCounter: number = 0;

  constructor(options: AudioMixerOptions = {}) {
    this.chunkDuration = options.chunkDuration ?? DEFAULT_CHUNK_DURATION;
    this.mimeType = options.mimeType ?? DEFAULT_MIME_TYPE;
  }

  /**
   * タブ音声ストリームを設定
   */
  setTabStream(stream: MediaStream): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.destination = this.audioContext.createMediaStreamDestination();
    }

    // 既存のソースを切断
    if (this.tabSource) {
      this.tabSource.disconnect();
    }

    this.tabStream = stream;
    this.tabSource = this.audioContext.createMediaStreamSource(stream);
    this.tabSource.connect(this.destination!);
  }

  /**
   * マイク音声ストリームを設定
   */
  setMicStream(stream: MediaStream): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.destination = this.audioContext.createMediaStreamDestination();
    }

    // 既存のソースを切断
    if (this.micSource) {
      this.micSource.disconnect();
    }

    this.micStream = stream;
    this.micSource = this.audioContext.createMediaStreamSource(stream);
    this.micSource.connect(this.destination!);
  }

  /**
   * チャンク生成コールバックを設定
   */
  setOnChunkCallback(callback: OnChunkCallback): void {
    this.onChunk = callback;
  }

  /**
   * 録音を開始
   */
  async start(): Promise<void> {
    if (this.isRecording) {
      console.warn('AudioMixer: Already recording');
      return;
    }

    if (!this.destination || !this.audioContext) {
      throw new Error('AudioMixer: No audio source set. Call setTabStream or setMicStream first.');
    }

    // AudioContext が suspended の場合は resume する
    if (this.audioContext.state === 'suspended') {
      console.log('AudioMixer: Resuming AudioContext...');
      await this.audioContext.resume();
    }
    console.log('AudioMixer: AudioContext state:', this.audioContext.state);

    // MediaRecorder を作成
    const mixedStream = this.destination.stream;
    console.log('AudioMixer: Mixed stream tracks:', mixedStream.getTracks().length);

    // サポートされている MIME タイプを確認
    const mimeType = MediaRecorder.isTypeSupported(this.mimeType)
      ? this.mimeType
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(mixedStream, {
      mimeType,
      audioBitsPerSecond: 128000,
    });

    this.chunkCounter = 0;
    this.chunkStartTime = Date.now();

    this.mediaRecorder.ondataavailable = (event) => {
      console.log('AudioMixer: ondataavailable', { size: event.data.size });
      if (event.data.size > 0 && this.onChunk) {
        const chunk: AudioChunkData = {
          id: `chunk-${Date.now()}-${this.chunkCounter++}`,
          data: event.data,
          timestamp: this.chunkStartTime,
          duration: this.chunkDuration / 1000, // 秒に変換
        };
        this.onChunk(chunk);
        this.chunkStartTime = Date.now();
      }
    };

    this.mediaRecorder.onerror = (event) => {
      console.error('AudioMixer: MediaRecorder error', event);
    };

    this.mediaRecorder.onstart = () => {
      console.log('AudioMixer: MediaRecorder started');
    };

    this.mediaRecorder.onstop = () => {
      console.log('AudioMixer: MediaRecorder stopped');
    };

    // チャンク間隔で録音データを取得
    console.log('AudioMixer: Starting MediaRecorder with chunk duration:', this.chunkDuration);
    this.mediaRecorder.start(this.chunkDuration);
    this.isRecording = true;

    console.log('AudioMixer: Recording started, recorder state:', this.mediaRecorder.state);
  }

  /**
   * 録音を停止
   */
  stop(): void {
    if (!this.isRecording || !this.mediaRecorder) {
      console.warn('AudioMixer: Not recording');
      return;
    }

    this.mediaRecorder.stop();
    this.isRecording = false;

    console.log('AudioMixer: Recording stopped');
  }

  /**
   * リソースをクリーンアップ
   */
  dispose(): void {
    this.stop();

    // ソースを切断
    if (this.tabSource) {
      this.tabSource.disconnect();
      this.tabSource = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }

    // ストリームを停止
    if (this.tabStream) {
      this.tabStream.getTracks().forEach((track) => track.stop());
      this.tabStream = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    // AudioContext を閉じる
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.destination = null;
    this.mediaRecorder = null;
    this.onChunk = null;

    console.log('AudioMixer: Disposed');
  }

  /**
   * 録音中かどうか
   */
  getIsRecording(): boolean {
    return this.isRecording;
  }
}
