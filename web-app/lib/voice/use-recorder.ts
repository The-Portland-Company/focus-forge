"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "recording" | "stopped" | "error";

interface UseRecorderResult {
  state: RecorderState;
  error: string | null;
  elapsedMs: number;
  level: number;
  start: () => Promise<void>;
  stop: () => Promise<Blob | null>;
  cancel: () => void;
}

const MAX_DURATION_MS = 120_000;

export function useRecorder(): UseRecorderResult {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (tickRef.current !== null) {
      cancelAnimationFrame(tickRef.current);
      tickRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close();
    }
    audioCtxRef.current = null;
    analyserRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setElapsedMs(0);
    setLevel(0);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const resolve = stopResolveRef.current;
        stopResolveRef.current = null;
        cleanup();
        setState("stopped");
        resolve?.(blob.size > 0 ? blob : null);
      };

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);

      startedAtRef.current = Date.now();
      const tick = () => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        if (analyserRef.current) {
          analyserRef.current.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 2));
        }
        if (elapsed >= MAX_DURATION_MS) {
          recorder.state === "recording" && recorder.stop();
          return;
        }
        tickRef.current = requestAnimationFrame(tick);
      };
      tickRef.current = requestAnimationFrame(tick);

      recorder.start();
      setState("recording");
    } catch (err) {
      cleanup();
      setState("error");
      const msg =
        err instanceof Error
          ? err.name === "NotAllowedError"
            ? "Microphone permission denied."
            : err.message
          : "Failed to start recording.";
      setError(msg);
      throw err;
    }
  }, [cleanup]);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state !== "recording") {
        resolve(null);
        return;
      }
      stopResolveRef.current = resolve;
      recorder.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    chunksRef.current = [];
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch {
        // noop
      }
    }
    cleanup();
    setState("idle");
    setElapsedMs(0);
    setLevel(0);
  }, [cleanup]);

  return { state, error, elapsedMs, level, start, stop, cancel };
}
