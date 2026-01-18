# meet-transcript-bridge

[English](./README.md) | [日本語](./README.ja.md)

A Chrome Extension that transcribes Google Meet audio in real-time and posts to Slack.

## Overview

This Chrome extension captures audio from Google Meet meetings and provides:

- **Real-time transcription**: Speech recognition via OpenAI Whisper API
- **AI-powered translation/summarization**: Processing via GPT
- **Slack integration**: Share meeting content to Slack in real-time

## Processing Flow

1. **Audio Capture**: Capture audio from Google Meet tab in chunks (e.g., every 10 seconds)
2. **Transcription**: Send each chunk to OpenAI Whisper API for text conversion
3. **Buffering**: Hold incomplete sentences in buffer when chunk boundaries cut mid-sentence
4. **Post on Completion**: Post to Slack in real-time when a complete sentence is formed
5. **Translation/Summarization (optional)**: Process with GPT before posting

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  Google Meet    │────▶│   Chrome     │────▶│  OpenAI     │
│  (Tab Audio)    │     │   Extension  │     │  Whisper    │
│                 │  10sec chunks      │     │             │
└─────────────────┘     └──────────────┘     └─────────────┘
                                                    │
                              ┌─────────────────────┘
                              ▼
                        ┌───────────┐
                        │  Buffer   │ ◀── Holds incomplete sentences
                        └───────────┘
                              │
                              ▼ (when sentence is complete)
┌─────────────────┐     ┌──────────────┐
│     Slack       │◀────│   GPT        │
│    Webhook      │     │  Translate/  │
│                 │     │  Summarize   │
└─────────────────┘     └──────────────┘
```

## Installation

1. Clone this repository
2. Run `yarn install` to install dependencies
3. Run `yarn build` to build the extension
4. Open Chrome and navigate to `chrome://extensions/`
5. Enable "Developer mode"
6. Click "Load unpacked" and select the `dist` folder

## Configuration

On first launch, the extension popup will prompt you to enter:

- **OpenAI API Key**: For Whisper / GPT APIs
- **Slack Webhook URL**: For posting to Slack

These credentials are stored in `chrome.storage.local`.

## Development

See [CLAUDE.md](./CLAUDE.md) for detailed development instructions.
