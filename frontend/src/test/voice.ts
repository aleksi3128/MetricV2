/**
 * Une reconnaissance et une synthèse vocales de théâtre, pour jsdom qui n'a ni l'une ni
 * l'autre. Le test dit ce qui a été « entendu » ; on lit ce qui a été « dit ».
 */

import { vi } from 'vitest';

export interface FakeVoice {
  /** Fait entendre une phrase, puis termine la dictée. */
  hear: (text: string) => void;
  spoken: string[];
}

export function installVoice(): FakeVoice {
  const live: {
    onresult: ((event: unknown) => void) | null;
    onend: (() => void) | null;
  }[] = [];
  class Recognition {
    lang = '';
    interimResults = false;
    continuous = false;
    onresult: ((event: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    start(): void {
      live.push(this);
    }
    stop(): void {
      this.onend?.();
    }
  }
  class Utterance {
    lang = '';
    voice: unknown = null;
    constructor(public text: string) {}
  }
  const spoken: string[] = [];
  vi.stubGlobal('webkitSpeechRecognition', Recognition);
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
  vi.stubGlobal('speechSynthesis', {
    cancel: () => undefined,
    getVoices: () => [],
    speak: (utterance: Utterance) => {
      spoken.push(utterance.text);
    },
  });
  return {
    spoken,
    hear: (text: string) => {
      const target = live.at(-1);
      if (target === undefined) throw new Error('aucune dictée en cours');
      target.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] });
      target.onend?.();
    },
  };
}
