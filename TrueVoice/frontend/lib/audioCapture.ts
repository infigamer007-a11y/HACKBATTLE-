"use client";

import { Role } from "./types";

export type AudioCaptureHandle = {
  stop: () => void;
};

export async function startAudioCapture(opts: {
  stream: MediaStream;
  role: Role;
  wsUrl: string;
}): Promise<AudioCaptureHandle> {
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;

  const ctx = new AudioContextClass();
  if (ctx.state === "suspended") {
    await ctx.resume().catch((err) => console.warn("[audio] resume failed:", err));
  }

  await ctx.audioWorklet.addModule("/pcm-worklet.js");

  const src = ctx.createMediaStreamSource(opts.stream);
  const node = new AudioWorkletNode(ctx, "pcm-worklet", {
    processorOptions: { sampleRate: ctx.sampleRate },
  });
  src.connect(node);

  const ws = new WebSocket(opts.wsUrl);
  ws.binaryType = "arraybuffer";

  ws.onerror = (err) => {
    console.error("[audioCapture ws error]", opts.wsUrl, err);
  };

  node.port.onmessage = (e: MessageEvent) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(e.data);
    }
  };

  return {
    stop: () => {
      try { ws.close(); } catch {}
      try { node.disconnect(); } catch {}
      try { src.disconnect(); } catch {}
      try { ctx.close(); } catch {}
    },
  };
}
