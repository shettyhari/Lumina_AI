import { useState, useEffect, useRef, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────

export type VoiceState =
  | "idle"          // mic off
  | "wake"          // always-on, waiting for "hey lumina"
  | "listening"     // actively capturing user query
  | "thinking"      // sent to AI, waiting
  | "speaking"      // TTS playing response
  | "error";        // mic permission denied / unavailable — needs user action, not silently retried

export interface UseVoiceAgentOptions {
  onTranscript: (text: string) => void; // called when user finishes speaking a query
  wakeWords?: string[];
}

export interface UseVoiceAgentReturn {
  state: VoiceState;
  interimText: string;           // live partial transcript shown in UI
  errorMessage: string | null;
  isSupported: boolean;
  toggleWake: () => void;        // enable/disable always-on wake mode
  startListening: () => void;    // manual mic start (no wake word needed)
  stopListening: () => void;
  setThinking: (v: boolean) => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
}

// Errors that mean "retrying won't help without the user doing something" —
// these must NOT be silently retried, or the app just loops start() forever
// with the UI stuck on "Listening for Hey Lina" and no explanation.
const FATAL_MIC_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);

function describeMicError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Please allow microphone permissions for this site in your browser settings, then try again.";
    case "audio-capture":
      return "No microphone was found. Please connect a microphone and try again.";
    default:
      return "Voice mode couldn't access your microphone. Please try again.";
  }
}

// Strip markdown so TTS doesn't say "asterisk asterisk bold asterisk asterisk"
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "code block")
    .replace(/`[^`]+`/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

// Pick the best available TTS voice (prefer natural-sounding female English)
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const PREFERRED = [
    "Google US English Female",
    "Microsoft Aria Online (Natural) - English (United States)",
    "Samantha",
    "Karen",
    "Victoria",
  ];
  for (const name of PREFERRED) {
    const v = voices.find(v => v.name === name);
    if (v) return v;
  }
  // Fallback: any English female
  const engFemale = voices.find(v => v.lang.startsWith("en") && /female/i.test(v.name));
  if (engFemale) return engFemale;
  // Fallback: any English
  return voices.find(v => v.lang.startsWith("en")) ?? voices[0] ?? null;
}

export function useVoiceAgent({ onTranscript, wakeWords = ["hey lumina", "lumina"] }: UseVoiceAgentOptions): UseVoiceAgentReturn {
  const [state, setState] = useState<VoiceState>("idle");
  const [interimText, setInterimText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSupported] = useState(() =>
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const stateRef = useRef<VoiceState>("idle");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const restartScheduledRef = useRef(false);

  // Keep stateRef in sync
  useEffect(() => { stateRef.current = state; }, [state]);

  // ── Build recognition instance ─────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildRecognition = useCallback((): any | null => {
    if (!isSupported) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const r = new SpeechRecognition();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.maxAlternatives = 1;
    return r;
  }, [isSupported]);

  // ── Silence detection ──────────────────────────────────────────────────

  const resetSilenceTimer = useCallback((onSilence: () => void, ms = 1500) => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(onSilence, ms);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  }, []);

  // ── Stop everything ────────────────────────────────────────────────────

  const stopAll = useCallback(() => {
    clearSilenceTimer();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    window.speechSynthesis.cancel();
    restartScheduledRef.current = false;
  }, [clearSilenceTimer]);

  // ── Wake-word mode ─────────────────────────────────────────────────────

  const startWakeMode = useCallback(() => {
    if (!isSupported) return;
    stopAll();
    setErrorMessage(null);
    setState("wake");

    const r = buildRecognition()!;
    recognitionRef.current = r;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      // Look for wake word in the latest transcript
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript.toLowerCase().trim();
        const triggered = wakeWords.some(w => transcript.includes(w));
        if (triggered) {
          // Transition to active listening
          r.onresult = null;
          r.onerror = null;
          r.onend = null;
          try { r.stop(); } catch { /* ignore */ }
          recognitionRef.current = null;
          startActiveListening(true);
          return;
        }
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "network") return; // restart on these
      if (FATAL_MIC_ERRORS.has(e.error)) {
        // Don't silently retry start() forever — nothing will change until
        // the user grants permission / plugs in a mic.
        setErrorMessage(describeMicError(e.error));
        setState("error");
      }
    };

    r.onend = () => {
      // Auto-restart wake mode unless we've switched state (including into
      // the fatal-error state set by onerror above, which fires first)
      if (stateRef.current === "wake" && !restartScheduledRef.current) {
        restartScheduledRef.current = true;
        setTimeout(() => {
          restartScheduledRef.current = false;
          if (stateRef.current === "wake") startWakeMode();
        }, 300);
      }
    };

    try { r.start(); } catch { setErrorMessage(describeMicError("unknown")); setState("error"); }
  }, [isSupported, buildRecognition, wakeWords, stopAll]); // eslint-disable-line

  // ── Active listening (capture user query) ─────────────────────────────

  const startActiveListening = useCallback((fromWake = false) => {
    if (!isSupported) return;
    clearSilenceTimer();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setState("listening");
    setInterimText("");

    const r = buildRecognition()!;
    recognitionRef.current = r;
    let finalText = "";
    let interimBuf = "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      interimBuf = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalText += e.results[i][0].transcript;
        } else {
          interimBuf += e.results[i][0].transcript;
        }
      }
      setInterimText((finalText + " " + interimBuf).trim());
      resetSilenceTimer(() => {
        const combined = (finalText + " " + interimBuf).trim();
        if (combined) {
          try { r.stop(); } catch { /* ignore */ }
          finalText = combined;
        }
      }, 1800);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => {
      if (e.error === "no-speech") return;
      if (FATAL_MIC_ERRORS.has(e.error)) {
        setErrorMessage(describeMicError(e.error));
        setState("error");
        setInterimText("");
        return;
      }
      setState(fromWake ? "wake" : "idle");
      setInterimText("");
      if (fromWake) startWakeMode();
    };

    r.onend = () => {
      clearSilenceTimer();
      // A fatal error already moved us to the "error" state above — don't
      // let this unconditional onend logic bounce us back into wake mode.
      if (stateRef.current === "error") return;
      const combined = finalText.trim();
      setInterimText("");
      if (combined) {
        setState("thinking");
        onTranscript(combined);
      } else {
        // Nothing captured — return to previous mode
        if (fromWake) {
          startWakeMode();
        } else {
          setState("idle");
        }
      }
    };

    try { r.start(); } catch { /* ignore */ }
  }, [isSupported, buildRecognition, clearSilenceTimer, resetSilenceTimer, onTranscript, startWakeMode]);

  // ── Public API ─────────────────────────────────────────────────────────

  const toggleWake = useCallback(() => {
    if (stateRef.current === "idle" || stateRef.current === "error") {
      startWakeMode();
    } else {
      stopAll();
      setState("idle");
      setInterimText("");
      setErrorMessage(null);
    }
  }, [startWakeMode, stopAll]);

  const startListening = useCallback(() => {
    if (stateRef.current === "listening") return;
    startActiveListening(false);
  }, [startActiveListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
    }
    setState("idle");
    setInterimText("");
    setErrorMessage(null);
    clearSilenceTimer();
  }, [clearSilenceTimer]);

  const setThinking = useCallback((v: boolean) => {
    setState(prev => {
      if (v) return "thinking";
      // When thinking ends, go back to wake mode if wake was on, else idle
      return prev === "thinking" ? "idle" : prev;
    });
  }, []);

  const speak = useCallback((text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    const cleaned = stripMarkdown(text);
    if (!cleaned) return;

    // Chunk long text so mobile doesn't cut off
    const MAX_CHARS = 200;
    const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [cleaned];
    const chunks: string[] = [];
    let current = "";
    for (const s of sentences) {
      if ((current + s).length > MAX_CHARS) {
        if (current) chunks.push(current.trim());
        current = s;
      } else {
        current += s;
      }
    }
    if (current.trim()) chunks.push(current.trim());

    let idx = 0;
    const speakNext = () => {
      if (idx >= chunks.length) {
        setState(prev => prev === "speaking" ? "idle" : prev);
        // Resume wake mode if it was active before
        if (stateRef.current === "idle") {
          // The caller will call startWakeMode if needed
        }
        return;
      }
      const utter = new SpeechSynthesisUtterance(chunks[idx++]);
      utteranceRef.current = utter;
      utter.rate = 1.05;
      utter.pitch = 1.0;
      utter.volume = 1.0;
      const voice = pickVoice();
      if (voice) utter.voice = voice;
      utter.onend = speakNext;
      utter.onerror = () => {
        setState(prev => prev === "speaking" ? "idle" : prev);
      };
      window.speechSynthesis.speak(utter);
    };

    setState("speaking");
    // Voices may not be loaded yet
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        speakNext();
      };
    } else {
      speakNext();
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setState(prev => prev === "speaking" ? "idle" : prev);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAll();
      window.speechSynthesis.cancel();
    };
  }, [stopAll]);

  return {
    state,
    interimText,
    errorMessage,
    isSupported,
    toggleWake,
    startListening,
    stopListening,
    setThinking,
    speak,
    stopSpeaking,
  };
}
