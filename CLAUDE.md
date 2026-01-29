# Stream Transcript Bridge

タブの音声（YouTube, Google Meet など）をリアルタイムで文字起こし・要約・翻訳し、Slack に投稿する Chrome 拡張機能。

## 技術スタック

- **言語**: TypeScript
- **拡張形式**: Chrome Extension (Manifest V3)
- **ビルド**: Vite
- **設計**: クリーンアーキテクチャ / DDD
- **音声認識**: OpenAI Whisper API
- **要約/翻訳**: OpenAI GPT API
- **通知**: Slack Incoming Webhook

## アーキテクチャ

```
        Chrome Extension                      External API
    ──────────────────────────────        ─────────────────

    ┌─────────────┬───────────────┐
    │  Tab Audio  │   Mic Audio   │
    │ (相手の声)   │  (自分の声)    │
    └──────┬──────┴───────┬───────┘
           │              │
           ▼              ▼
    ┌─────────────────────────────┐       ┌───────────────┐
    │        Audio Mixer          │──────▶│   Whisper     │
    │        (10秒チャンク)         │       │  (文字起こし)  │
    └─────────────────────────────┘       └───────────────┘
                                                 │
                ┌────────────────────────────────┘
                ▼
    ┌─────────────────────────────┐       ┌───────────────┐
    │          Buffer             │──────▶│     GPT       │
    │       (文章完成判定)          │       │  (翻訳/要約)   │
    └─────────────────────────────┘       └───────────────┘
                                                 │
                ┌────────────────────────────────┘
                ▼
    ┌─────────────────────────────┐       ┌───────────────┐
    │        Slack Client         │──────▶│    Slack      │
    │         (通知処理)           │       │   Webhook     │
    └─────────────────────────────┘       └───────────────┘
```

## 内部処理フロー

### 音声キャプチャとバッファリング

音声の取得は REST API（Whisper）を使用するため、一定間隔のチャンク単位で処理する:

1. **音声キャプチャ**: タブ音声（相手の声）とマイク音声（自分の声）を取得し、Web Audio API で mix。一定間隔（例: 10秒）のチャンクで処理
2. **Whisper 文字起こし**: 各チャンクを Whisper API に送信してテキスト化
3. **バッファリング**: チャンク境界で文章が途切れた場合、未完成の文をバッファに保持
4. **文章完成判定**: 次のチャンクと結合し、文章として成立したかを判定
5. **リアルタイム投稿**: 完成した文章は即座に GPT で翻訳・要約し、Slack に投稿

### なぜバッファリングが必要か

- 10秒チャンクの境界は会話のタイミングと一致しない
- 「今日の会議では...」の途中でチャンクが切れる可能性がある
- バッファに保持し、次のチャンクで文章が完成したら投稿することで自然な文章を維持

### 備考: WebSocket（Realtime API）について

OpenAI Realtime API を使えばストリーミング処理も可能だが、料金体系が異なる。
まずは REST API（Whisper）ベースのチャンク方式で実装する。

## ディレクトリ構成

クリーンアーキテクチャ / DDD を採用し、レイヤーごとに責務を分離:

```
src/
├── domain/                 # ドメイン層（ビジネスロジック、外部依存なし）
│   ├── entities/           # エンティティ（Transcript, Meeting など）
│   ├── repositories/       # リポジトリインターフェース（実装は infrastructure）
│   └── services/           # ドメインサービス（文章完成判定など）
│
├── application/            # アプリケーション層（ユースケース）
│   └── usecases/           # TranscribeAudio, PostToSlack など
│
├── infrastructure/         # インフラ層（外部サービス・技術詳細）
│   ├── openai/             # Whisper / GPT クライアント
│   ├── slack/              # Webhook クライアント
│   ├── audio/              # 音声キャプチャ処理
│   └── storage/            # chrome.storage ラッパー
│
├── presentation/           # プレゼンテーション層（UI・Chrome 拡張エントリーポイント）
│   ├── background/         # Service Worker
│   ├── content/            # Content Script (対象ページ用)
│   └── popup/              # 拡張機能ポップアップ UI
│
└── shared/                 # 共有ユーティリティ
    └── types/              # TypeScript 型定義
```

### レイヤー間の依存ルール

```
presentation → application → domain ← infrastructure
                    ↓
              infrastructure
```

- **domain**: 他のレイヤーに依存しない（純粋なビジネスロジック）
- **application**: domain を使用、infrastructure はインターフェース経由で注入
- **infrastructure**: domain のインターフェースを実装
- **presentation**: application のユースケースを呼び出す

## 開発コマンド

```bash
yarn install         # 依存関係インストール
yarn dev             # ビルド監視モード（popup/content scriptはHMR対応）
yarn build           # 本番ビルド
yarn test            # テスト実行
yarn lint            # ESLint 実行
yarn type-check      # TypeScript 型チェック
```

## API キーの管理

環境変数ではなく、**拡張機能の初回起動時にポップアップで入力**させる方式:

- `OPENAI_API_KEY`: OpenAI API キー
- `SLACK_WEBHOOK_URL`: Slack Incoming Webhook URL

入力された値は `chrome.storage.local` に保存し、以降は自動で読み込む。

## コーディング規約

- ESLint + Prettier を使用
- 関数・変数名は camelCase
- 型定義は明示的に記述
- コメントは日本語可

## コミット規約

- **1コミット1変更**: 1つのコミットには1つの論理的な変更のみ含める
- コミットメッセージに「and」「と」が入る場合は分割を検討する
- コミットメッセージは英語で、変更内容を簡潔に記述

## なぜこのツールを作るのか

YouTube や Google Meet などの標準字幕機能は認識精度が低かったり、対応言語が限られている。
OpenAI Whisper を使うことで、より高精度な文字起こしを実現し、GPT による翻訳・要約でリアルタイムに内容を把握できる。

## 課題・調査事項

### 話者分離（Speaker Diarization）

**現状の課題:**
- `chrome.tabCapture` で取得できるのはタブ全体のミックス音声
- 単一の音声ストリームからは「誰が話しているか」の情報は取れない
- Whisper API 単体では話者分離をサポートしていない

**検討中の選択肢:**

| 方法 | メリット | デメリット |
|------|----------|------------|
| 話者分離なしで進める | シンプル、コスト低 | 誰の発言か分からない |
| AssemblyAI | 話者分離対応、高精度 | 追加コスト、別API |
| Deepgram | 話者分離対応、リアルタイム向き | 追加コスト、別API |
| Google Cloud Speech-to-Text | Speaker Diarization オプションあり | 追加コスト、設定複雑 |
| pyannote.audio + Whisper | オープンソース | サーバーサイド処理が必要 |

**調査が必要:**
- 各サービスの精度比較
- コスト試算（会議時間あたり）
- リアルタイム性の確保

### 音声チャンクの最適な長さ

- 短すぎる（5秒以下）: 文脈が少なく認識精度が落ちる可能性
- 長すぎる（30秒以上）: リアルタイム性が損なわれる、API タイムアウトリスク
- **要検証**: 10秒が最適か？

### 文章完成判定のロジック

- 句読点ベース？（「。」「？」「！」で区切る）
- 無音検出ベース？
- GPT に判定させる？（コスト増）
- **要検証**: 日本語と英語で異なるロジックが必要か

## API 料金（2026年1月時点）

OpenAI API キー1つで Whisper（文字起こし）と GPT（翻訳・要約）の両方が利用可能。

### Whisper（文字起こし）

| モデル | 料金 | 備考 |
|--------|------|------|
| whisper-1 | $0.006/分 | 標準モデル |
| GPT-4o Transcribe | $0.006/分 | 話者分離対応版あり |
| GPT-4o Mini Transcribe | $0.003/分 | 低コスト版 |

### GPT（翻訳・要約）

| モデル | 入力 | 出力 |
|--------|------|------|
| GPT-4o mini | $0.15/100万トークン | $0.60/100万トークン |

### コスト試算例（1時間の会議）

| 項目 | 計算 | 料金 |
|------|------|------|
| Whisper（whisper-1） | 60分 × $0.006 | $0.36 |
| GPT（翻訳・要約 50回） | 約5万トークン | 〜$0.01 |
| **合計** | | **約 $0.37（約¥55）** |

### 新規ユーザー向け無料クレジット

- $5 の無料クレジット（クレカ不要）
- 約14時間分の文字起こしが可能
- 3ヶ月で期限切れ

参考: [OpenAI Pricing](https://openai.com/api/pricing/)

## 実装状況

### Phase 1: 基本セットアップ
- [x] Chrome Extension の基本構成（Manifest V3）
  - manifest.json
  - popup.html（エントリーポイント）
- [x] Vite ビルド環境の構築
  - Chrome Extension 用のカスタムビルド設定
  - manifest.json と HTML の自動配置
- [x] TypeScript 設定
  - strict モード有効化
  - Vue ファイルの型定義サポート

### Phase 1.5: モダンなフロントエンド環境
- [x] Vue 3 + Composition API の導入
- [x] Tailwind CSS の導入
- [x] Pinia による状態管理
  - `useAppStore`: アプリ設定管理用ストア
    - Chrome API 可用性チェック
    - 設定の読み込み・保存（OpenAI API キー、Slack Webhook URL）
- [x] VueUse の導入（便利な Vue hooks）
- [x] Vitest によるテスト環境
  - @testing-library/vue
  - happy-dom（高速な DOM シミュレーション）
  - Chrome API のモック
  - 20 個のテスト（すべて成功）

### Phase 2: クリーンアーキテクチャのディレクトリ構造
- [x] ディレクトリ構造の作成
  - `src/domain/entities/` - エンティティ（Transcript, Meeting）
  - `src/domain/repositories/` - リポジトリインターフェース（5つ）
  - `src/domain/services/` - ドメインサービス（TranscriptCompletionService）
  - `src/application/usecases/` - ユースケース（準備完了）
  - `src/infrastructure/` - 各種クライアント（準備完了）
  - `src/shared/types/` - 型定義
- [x] 基本的な型定義の追加
  - TranscriptSegment, Meeting, AudioChunk, WhisperResponse など
- [x] ドメインエンティティの実装
  - `Transcript`: 文字起こしエンティティ
  - `Meeting`: 会議エンティティ
- [x] リポジトリインターフェースの定義
  - `ITranscriptRepository`, `IAudioRepository`, `IWhisperRepository`
  - `IGptRepository`, `ISlackRepository`
- [x] ドメインサービスの実装
  - `TranscriptCompletionService`: 文章完成判定（日本語・英語対応）
- [x] 各レイヤーの README 追加
- [x] テスト追加（14 個 - 累計 34 個）

### Phase 3: 設定 UI
- [x] ポップアップ UI の拡張
  - タブ切り替え（ホーム / 設定）
  - 設定状態の表示（Chrome API, OpenAI API Key, Slack Webhook）
- [x] 設定フォームコンポーネントの作成
  - OpenAI API Key 入力（バリデーション付き）
  - Slack Webhook URL 入力（バリデーション付き）
  - 保存機能（ローディング状態、成功/エラーメッセージ）
- [x] 設定未完了時の自動リダイレクト
- [x] テスト追加（16 個 - 累計 42 個）

### Phase 4: Background Service Worker + Audio Capture
- [x] メッセージ型定義（`src/shared/types/messages.ts`）
  - Popup ↔ Background ↔ Offscreen 間の通信型
- [x] Background Service Worker（`src/presentation/background/background.ts`）
  - Popup からのメッセージ処理（録音開始/停止/状態取得）
  - `tabCapture.getMediaStreamId()` で音声ストリーム ID 取得
  - Offscreen Document の作成・管理
- [x] AudioMixer（`src/infrastructure/audio/AudioMixer.ts`）
  - Web Audio API による Tab Audio + Mic Audio のミキシング
  - MediaRecorder で 10秒チャンク分割
- [x] Offscreen Document（`src/presentation/offscreen/`）
  - `getUserMedia` でタブ音声キャプチャ
  - AudioMixer を使用してチャンク生成
  - Background に AudioChunk を送信
- [x] Recording Store（`src/stores/recording.ts`）
  - 録音状態管理（Pinia）
- [x] Popup UI 更新
  - 録音開始/停止ボタン
  - 録音状態・経過時間の表示
- [x] manifest.json 更新（offscreen permission, background 設定）
- [x] vite.config.ts 更新（複数エントリーポイント対応）
- [x] テスト維持（42 個すべて成功）

**既知の課題:**
- Offscreen Document からのマイク権限取得が失敗する場合がある
  - タブ音声のみでも動作は継続する
  - 対応策: Popup で先にマイク権限を取得する処理を追加する（必要になったら実装）

### Phase 5: 動作確認
- [ ] 拡張機能をChromeに読み込んで動作確認
- [ ] AudioChunk が正しく生成されることを確認

### Phase 6: Whisper 連携
- [x] Whisper API クライアント実装（`src/infrastructure/openai/WhisperClient.ts`）
- [x] Background で AudioChunk を受け取り Whisper に送信
- [ ] 音声 → テキスト変換の動作確認

### Phase 7: バッファリング
- [x] TranscriptBufferManager 実装（`src/application/usecases/`）
- [x] Background でバッファマネージャを統合
- [x] テスト追加（13 個 - 累計 55 個）

### Phase 8: GPT + Slack
- [x] GPT API クライアント実装（`src/infrastructure/openai/GptClient.ts`）
- [x] Slack Webhook クライアント実装（`src/infrastructure/slack/SlackClient.ts`）
- [x] Background で文章完成時に翻訳 → Slack 投稿を統合
- [ ] エンドツーエンドの動作確認

### その他
- [ ] マイク権限の事前取得（Popup から）- 検討した結果、録音中に状態表示する方式に変更
- [ ] 話者分離の調査・実装（優先度: 中）
- [ ] エラーハンドリング・リトライ処理
- [ ] E2E テスト（Playwright）
