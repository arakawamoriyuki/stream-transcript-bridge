/**
 * Slack Webhook クライアント
 *
 * Slack Incoming Webhook を使用してメッセージを投稿する
 */


export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  [key: string]: unknown;
}

export class SlackClient {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  /**
   * Webhook URL を更新
   */
  setWebhookUrl(webhookUrl: string): void {
    this.webhookUrl = webhookUrl;
  }

  /**
   * シンプルなテキストメッセージを投稿
   */
  async postMessage(text: string): Promise<void> {
    await this.post({ text });
  }

  /**
   * 文字起こし結果を投稿
   */
  async postTranscript(original: string, translated?: string): Promise<void> {
    const blocks: SlackBlock[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Original:*\n${original}`,
        },
      },
    ];

    if (translated) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Translated:*\n${translated}`,
        },
      });
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_${new Date().toLocaleString('ja-JP')}_`,
        },
      ],
    });

    await this.post({
      text: original,
      blocks,
    });
  }

  /**
   * Webhook に POST
   */
  private async post(message: SlackMessage): Promise<void> {
    if (!this.webhookUrl) {
      throw new Error('Slack Webhook URL is not set');
    }

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Slack Webhook error: ${response.status} - ${errorText}`);
    }
  }
}
