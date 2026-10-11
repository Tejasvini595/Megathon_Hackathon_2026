"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { transcribe } from "@/lib/llm/transcribe";

const noop = () => () => {};
const RATE = 16_000;
const MAX_MS = 90_000;

/** Whatever the browser recorded (webm, ogg, mp4) -> 16 kHz mono 16-bit WAV, the one format every audio model reads. */
async function toWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer()).finally(() => ctx.close());
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const pcm = (await offline.startRendering()).getChannelData(0);
  const view = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  pcm.forEach((v, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return new Blob([view], { type: "audio/wav" });
}

/**
 * Voice input: records on the device, then an audio LLM on the server transcribes it (LLM_TRANSCRIBE_MODEL).
 * `interim` is a status line while recording or transcribing. `supported` is false without a microphone API.
 */
export function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const supported = useSyncExternalStore(noop, () => !!navigator.mediaDevices?.getUserMedia && "MediaRecorder" in window, () => false);
  const rec = useRef<MediaRecorder | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const stop = useCallback(() => {
    if (rec.current?.state === "recording") rec.current.stop();
  }, []);

  const start = useCallback(async () => {
    if (rec.current) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast.error("Allow microphone access to talk, or type instead.");
      return;
    }
    const r = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const began = Date.now();
    const tick = setInterval(() => {
      setSeconds(Math.floor((Date.now() - began) / 1000));
      if (Date.now() - began >= MAX_MS) stop();
    }, 250);
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = async () => {
      clearInterval(tick);
      stream.getTracks().forEach((t) => t.stop());
      rec.current = null;
      setListening(false);
      setSeconds(0);
      if (Date.now() - began < 400) return; // a mis-tap
      setTranscribing(true);
      try {
        const form = new FormData();
        form.set("audio", await toWav(new Blob(chunks, { type: r.mimeType })));
        const res = await transcribe(form);
        if (!res.ok) toast.error(res.error);
        else if (res.text) onFinalRef.current(res.text);
        else toast("Didn't catch that. Try again a little closer to the mic.");
      } catch {
        toast.error("Couldn't transcribe that. Try again, or type instead.");
      } finally {
        setTranscribing(false);
      }
    };
    rec.current = r;
    r.start();
    setListening(true);
  }, [stop]);

  // Leaving the page drops the recording rather than sending it.
  useEffect(
    () => () => {
      const r = rec.current;
      if (!r) return;
      r.onstop = null;
      r.stop();
      r.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const interim = listening ? `Listening… ${seconds}s, tap stop when done` : transcribing ? "Transcribing…" : "";
  return { listening, transcribing, interim, supported, start, stop };
}
