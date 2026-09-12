"use client";

/**
 * Request mic + (optional) camera with graceful fallback.
 * Returns the best stream we could get, plus flags for what's actually in it.
 */
export type MediaResult = {
  stream: MediaStream;
  hasAudio: boolean;
  hasVideo: boolean;
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: "user",
};

export async function requestCallMedia(): Promise<MediaResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Microphone and camera access requires a secure HTTPS connection or localhost. Please check your browser address bar."
    );
  }

  // Preferred: mic + cam
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: VIDEO_CONSTRAINTS,
    });
    return {
      stream,
      hasAudio: stream.getAudioTracks().length > 0,
      hasVideo: stream.getVideoTracks().length > 0,
    };
  } catch (err: unknown) {
    console.warn("[media] Preferred mic+cam request failed:", err);
    // If the user actively denied permission, fail immediately with clear error
    if (
      err instanceof DOMException &&
      (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
    ) {
      throw err;
    }

    // Fallback: Camera might be busy, unavailable, or restricted — try audio only
    try {
      console.log("[media] Attempting audio-only fallback...");
      const audioOnly = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: false,
      });
      return {
        stream: audioOnly,
        hasAudio: audioOnly.getAudioTracks().length > 0,
        hasVideo: false,
      };
    } catch (audioErr: unknown) {
      console.error("[media] Audio-only fallback also failed:", audioErr);
      throw audioErr;
    }
  }
}

export function describeMediaError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
      return "Microphone/Camera permission denied. Please allow microphone & camera permissions in your browser and retry.";
    }
    if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
      return "No microphone or camera found. Please connect an audio input device and retry.";
    }
    if (e.name === "NotReadableError" || e.name === "TrackStartError") {
      return "Microphone/Camera is in use by another application. Please close other call apps and retry.";
    }
    if (e.name === "OverconstrainedError") {
      return "Media constraints could not be satisfied by your device.";
    }
    return `${e.name}: ${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}
