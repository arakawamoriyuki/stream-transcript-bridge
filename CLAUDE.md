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
└─────────────────┘     └──────────────┘     └─────────────┘
                                                    │
                                                    ▼
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│     Slack       │◀────│   GPT        │◀────│  Transcript │
│    Webhook      │     │  翻訳/要約    │     │    Text     │
└─────────────────┘     └──────────────┘     └─────────────┘
```

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
