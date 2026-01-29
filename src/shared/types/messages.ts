/**
 * Background Service Worker と Popup/Offscreen 間のメッセージ型定義
 */

// ===== Popup → Background =====

/** 録音開始リクエスト */
export interface StartRecordingMessage {
  type: 'START_RECORDING';
  tabId: number;
}

/** 録音停止リクエスト */
export interface StopRecordingMessage {
  type: 'STOP_RECORDING';
}

/** 録音状態取得リクエスト */
export interface GetRecordingStatusMessage {
  type: 'GET_RECORDING_STATUS';
}

/** Popup から Background へのメッセージ */
export type PopupToBackgroundMessage =
  | StartRecordingMessage
  | StopRecordingMessage
  | GetRecordingStatusMessage;

// ===== Background → Offscreen =====

/** 音声キャプチャ開始リクエスト */
export interface StartCaptureMessage {
  type: 'START_CAPTURE';
  target: 'offscreen';
  streamId: string;
}

/** 音声キャプチャ停止リクエスト */
export interface StopCaptureMessage {
  type: 'STOP_CAPTURE';
  target: 'offscreen';
}

/** Background から Offscreen へのメッセージ */
export type BackgroundToOffscreenMessage =
  | StartCaptureMessage
  | StopCaptureMessage;

// ===== Offscreen → Background =====

/** 音声チャンク生成通知 */
export interface AudioChunkMessage {
  type: 'AUDIO_CHUNK';
  chunkId: string;
  data: ArrayBuffer;
  timestamp: number;
  duration: number;
}

/** キャプチャエラー通知 */
export interface CaptureErrorMessage {
  type: 'CAPTURE_ERROR';
  error: string;
}

/** キャプチャ状態通知 */
export interface CaptureStatusMessage {
  type: 'CAPTURE_STATUS';
  isCapturing: boolean;
  hasMic?: boolean;
}

/** Offscreen から Background へのメッセージ */
export type OffscreenToBackgroundMessage =
  | AudioChunkMessage
  | CaptureErrorMessage
  | CaptureStatusMessage;

// ===== Background → Popup (レスポンス) =====

/** 録音状態レスポンス */
export interface RecordingStatusResponse {
  isRecording: boolean;
  tabId?: number;
  startedAt?: number;
  hasMic?: boolean;
  error?: string;
}

/** 汎用レスポンス */
export interface GenericResponse {
  success: boolean;
  error?: string;
}

// ===== 録音状態 =====

export interface RecordingState {
  isRecording: boolean;
  tabId?: number;
  startedAt?: number;
  hasMic?: boolean;
}
