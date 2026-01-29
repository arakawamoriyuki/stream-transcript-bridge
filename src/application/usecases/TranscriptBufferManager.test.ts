import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranscriptBufferManager, CompletedSentence } from './TranscriptBufferManager';

describe('TranscriptBufferManager', () => {
  let manager: TranscriptBufferManager;
  let completedSentences: CompletedSentence[];

  beforeEach(() => {
    manager = new TranscriptBufferManager();
    completedSentences = [];
    manager.setOnSentenceComplete((sentence) => {
      completedSentences.push(sentence);
    });
  });

  describe('processTranscript', () => {
    it('should notify when a complete Japanese sentence is received', () => {
      manager.processTranscript('こんにちは。', 1000);

      expect(completedSentences).toHaveLength(1);
      expect(completedSentences[0].text).toBe('こんにちは。');
      expect(completedSentences[0].timestamp).toBe(1000);
    });

    it('should notify when a complete English sentence is received', () => {
      manager.processTranscript('Hello world.', 1000);

      expect(completedSentences).toHaveLength(1);
      expect(completedSentences[0].text).toBe('Hello world.');
    });

    it('should buffer incomplete sentences', () => {
      manager.processTranscript('今日は天気が', 1000);

      expect(completedSentences).toHaveLength(0);
      expect(manager.getBufferContent()).toBe('今日は天気が');
    });

    it('should complete sentence when next chunk arrives', () => {
      manager.processTranscript('今日は天気が', 1000);
      manager.processTranscript('良いですね。', 2000);

      expect(completedSentences).toHaveLength(1);
      expect(completedSentences[0].text).toBe('今日は天気が良いですね。');
      expect(completedSentences[0].timestamp).toBe(1000); // 最初のタイムスタンプを保持
    });

    it('should handle multiple sentences in one chunk', () => {
      manager.processTranscript('おはよう。今日は。', 1000);

      expect(completedSentences).toHaveLength(2);
      expect(completedSentences[0].text).toBe('おはよう。');
      expect(completedSentences[1].text).toBe('今日は。');
    });

    it('should handle mixed complete and incomplete sentences', () => {
      manager.processTranscript('おはよう。今日は', 1000);

      expect(completedSentences).toHaveLength(1);
      expect(completedSentences[0].text).toBe('おはよう。');
      expect(manager.getBufferContent()).toBe('今日は');
    });

    it('should ignore empty text', () => {
      manager.processTranscript('', 1000);
      manager.processTranscript('   ', 2000);

      expect(completedSentences).toHaveLength(0);
      expect(manager.getBufferContent()).toBe('');
    });

    it('should handle question marks', () => {
      manager.processTranscript('元気ですか？', 1000);

      expect(completedSentences).toHaveLength(1);
      expect(completedSentences[0].text).toBe('元気ですか？');
    });

    it('should handle exclamation marks', () => {
      manager.processTranscript('すごい！', 1000);

      expect(completedSentences).toHaveLength(1);
      expect(completedSentences[0].text).toBe('すごい！');
    });
  });

  describe('flush', () => {
    it('should output buffered content on flush', () => {
      manager.processTranscript('途中の文', 1000);
      manager.flush();

      expect(completedSentences).toHaveLength(1);
      expect(completedSentences[0].text).toBe('途中の文');
    });

    it('should clear buffer after flush', () => {
      manager.processTranscript('途中の文', 1000);
      manager.flush();

      expect(manager.getBufferContent()).toBe('');
    });

    it('should do nothing if buffer is empty', () => {
      manager.flush();

      expect(completedSentences).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should clear buffer without notification', () => {
      manager.processTranscript('途中の文', 1000);
      manager.clear();

      expect(completedSentences).toHaveLength(0);
      expect(manager.getBufferContent()).toBe('');
    });
  });
});
