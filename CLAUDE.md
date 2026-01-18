# Meet Transcript Bridge

Google Meet の音声をリアルタイムで文字起こし・要約・翻訳し、Slack に投稿する Chrome 拡張機能。

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
│   ├── content/            # Content Script (Google Meet ページ用)
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

## なぜこのツールを作るのか

Google Meet の標準字幕機能は認識精度が低く、実用に耐えない。
OpenAI Whisper を使うことで、より高精度な文字起こしを実現する。

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

## TODO

- [ ] Chrome Extension の基本構成（Manifest V3）
- [ ] `chrome.tabCapture` での音声キャプチャ実装
- [ ] Whisper API 連携
- [ ] バッファリング・文章完成判定ロジック
- [ ] GPT による翻訳・要約処理
- [ ] Slack Webhook 連携
- [ ] ポップアップ UI（設定画面）
- [ ] 話者分離の調査・実装（優先度: 中）
- [ ] エラーハンドリング・リトライ処理
- [ ] テスト
