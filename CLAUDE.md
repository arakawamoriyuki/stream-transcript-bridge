# Meet Transcript Bridge

Google Meet の音声をリアルタイムで文字起こし・要約・翻訳し、Slack に投稿する Chrome 拡張機能。

## 技術スタック

- **言語**: TypeScript
- **拡張形式**: Chrome Extension (Manifest V3)
- **ビルド**: Vite
- **音声認識**: OpenAI Whisper API
- **要約/翻訳**: OpenAI GPT API
- **通知**: Slack Incoming Webhook

## アーキテクチャ

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Google Meet    │────▶│   Chrome     │────▶│  OpenAI     │
│  (Tab Audio)    │     │   Extension  │     │  Whisper    │
│                 │  10秒チャンク       │     │             │
└─────────────────┘     └──────────────┘     └─────────────┘
                                                    │
                              ┌─────────────────────┘
                              ▼
                        ┌───────────┐
                        │  Buffer   │ ◀── 未完成の文を保持
                        └───────────┘
                              │
                              ▼ (文章が完成したタイミング)
┌─────────────────┐     ┌──────────────┐
│     Slack       │◀────│   GPT        │
│    Webhook      │     │  翻訳/要約    │
└─────────────────┘     └──────────────┘
```

## 内部処理フロー

### 音声キャプチャとバッファリング

音声の取得は REST API（Whisper）を使用するため、一定間隔のチャンク単位で処理する:

1. **音声キャプチャ**: Google Meet タブから音声を一定間隔（例: 10秒）で取得
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

```
src/
├── background/     # Service Worker
├── content/        # Content Script (Google Meet ページ用)
├── popup/          # 拡張機能ポップアップ UI
├── lib/            # 共通ライブラリ
│   ├── openai.ts   # OpenAI API クライアント
│   ├── slack.ts    # Slack Webhook クライアント
│   └── audio.ts    # 音声処理ユーティリティ
└── types/          # TypeScript 型定義
```

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
