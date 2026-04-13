import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'unsupported';

export type VoiceCommandHandlers = {
  onScan?: () => void;
  onNote?: (text: string) => void;
  onNavigate?: (tab: 'scan' | 'history' | 'notes' | 'settings') => void;
  onBatchToggle?: () => void;
  onBatchSave?: () => void;
};

// ─── Minimal typings for Web Speech API ───────────────────────────────────────

interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: ISpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}

interface ISpeechRecognitionEvent {
  results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } };
}

function getSpeechRecognitionCtor(): (new () => ISpeechRecognition) | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = window as typeof window & {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// ─── Command parser ────────────────────────────────────────────────────────────

function parseCommand(transcript: string, handlers: VoiceCommandHandlers): string | null {
  const t = transcript.toLowerCase().trim();

  // Navigation — must not match note-creation pattern
  if (/\b(historial|history)\b/.test(t) && !/\b(nota|note):?\s+\w/.test(t)) {
    handlers.onNavigate?.('history');
    return 'history';
  }
  if (/\b(ajustes|settings|configuraci[oó]n)\b/.test(t)) {
    handlers.onNavigate?.('settings');
    return 'settings';
  }
  if (/\b(notas?)\b/.test(t) && !/\b(nota|note):?\s+\w/.test(t)) {
    handlers.onNavigate?.('notes');
    return 'notes';
  }
  if (/\b(scanner?|scan tab|escanear?\s+tab)\b/.test(t)) {
    handlers.onNavigate?.('scan');
    return 'scan-tab';
  }

  // Scan / capture
  if (/\b(escanear?|scan(ear)?|foto|capturar?|capture|toma(r)?\s+foto)\b/.test(t)) {
    handlers.onScan?.();
    return 'scan';
  }

  // Batch
  if (/\b(batch|lote|modo\s+lote|batch\s+mode)\b/.test(t)) {
    handlers.onBatchToggle?.();
    return 'batch-toggle';
  }
  if (/\b(guardar\s+lote|save\s+batch|guardar\s+todo|save\s+all)\b/.test(t)) {
    handlers.onBatchSave?.();
    return 'batch-save';
  }

  // Note creation: "nota: [text]" or "note [text]"
  const noteMatch = /\b(?:nota|note):?\s+(.+)/.exec(t);
  if (noteMatch?.[1]?.trim()) {
    handlers.onNote?.(noteMatch[1].trim());
    return 'note';
  }

  return null;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useVoiceCommands(handlers: VoiceCommandHandlers) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const isSupported = getSpeechRecognitionCtor() !== null;

  useEffect(() => {
    if (!isSupported) setVoiceState('unsupported');
  }, [isSupported]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setVoiceState('idle');
  }, []);

  const start = useCallback(() => {
    const SR = getSpeechRecognitionCtor();
    if (!SR) { setVoiceState('unsupported'); return; }

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    // Spanish primary — covers English command words too
    recognition.lang = 'es-ES';

    recognition.onresult = (event) => {
      setVoiceState('processing');
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript) {
        setLastTranscript(transcript);
        const cmd = parseCommand(transcript, handlersRef.current);
        setLastCommand(cmd);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setVoiceState('idle');
    };

    recognition.onerror = (event) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setVoiceState('idle');
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setVoiceState('listening');
  }, []);

  const toggle = useCallback(() => {
    if (voiceState === 'listening') {
      stop();
    } else {
      start();
    }
  }, [voiceState, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }
    };
  }, []);

  return { voiceState, lastTranscript, lastCommand, isSupported, start, stop, toggle };
}
