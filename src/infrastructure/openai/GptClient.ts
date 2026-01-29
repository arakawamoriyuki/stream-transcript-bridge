/**
 * GPT API クライアント
 *
 * OpenAI GPT API を使用してテキストの翻訳・要約を行う
 */

import type { GptResponse } from '@/shared/types';

const GPT_API_URL = 'https://api.openai.com/v1/chat/completions';
const GPT_MODEL = 'gpt-4o-mini';

export interface TranslateOptions {
  targetLanguage?: string;
  customPrompt?: string;
}

export interface SummarizeOptions {
  maxLength?: number;
}

export class GptClient {
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
   * テキストを翻訳
   */
  async translate(text: string, options: TranslateOptions = {}): Promise<GptResponse> {
    const targetLanguage = options.targetLanguage || '日本語';

    // カスタムプロンプトがあればそれを使用
    const systemPrompt = options.customPrompt
      ? options.customPrompt
      : `あなたは翻訳者です。与えられたテキストを${targetLanguage}に翻訳してください。翻訳結果のみを出力し、説明は不要です。`;

    const response = await this.callGpt([
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: text,
      },
    ]);

    return {
      translatedText: response,
    };
  }

  /**
   * テキストを要約
   */
  async summarize(text: string, options: SummarizeOptions = {}): Promise<GptResponse> {
    const maxLength = options.maxLength || 100;

    const response = await this.callGpt([
      {
        role: 'system',
        content: `あなたは要約者です。与えられたテキストを${maxLength}文字以内で簡潔に要約してください。要約結果のみを出力し、説明は不要です。`,
      },
      {
        role: 'user',
        content: text,
      },
    ]);

    return {
      summary: response,
    };
  }

  /**
   * テキストを翻訳して要約
   */
  async translateAndSummarize(
    text: string,
    translateOptions: TranslateOptions = {},
    summarizeOptions: SummarizeOptions = {}
  ): Promise<GptResponse> {
    const targetLanguage = translateOptions.targetLanguage || '日本語';
    const maxLength = summarizeOptions.maxLength || 100;

    const response = await this.callGpt([
      {
        role: 'system',
        content: `あなたは翻訳・要約者です。与えられたテキストを${targetLanguage}に翻訳し、${maxLength}文字以内で簡潔に要約してください。結果のみを出力し、説明は不要です。`,
      },
      {
        role: 'user',
        content: text,
      },
    ]);

    return {
      translatedText: response,
      summary: response,
    };
  }

  /**
   * GPT API を呼び出し
   */
  private async callGpt(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is not set');
    }

    const response = await fetch(GPT_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: GPT_MODEL,
        messages,
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GPT API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content || '';
  }
}
