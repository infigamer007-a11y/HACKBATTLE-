export type Role = "patient" | "clinician";
export type BioModel = "helios" | "apollo" | "psyche";

export type TranscriptPartial = {
  type: "transcript_partial";
  role: Role;
  text: string;
  ts_ms: number;
};

export type TranscriptFinal = {
  type: "transcript_final";
  role: Role;
  text: string;
  start_ms: number;
  end_ms: number;
  utterance_id: string;
};

export type BiomarkerProgress = {
  type: "biomarker_progress";
  model: BioModel;
  name: string;
  speech_seconds: number;
  trigger_seconds: number;
};

export type BiomarkerResult = {
  type: "biomarker_result";
  model: "helios" | "apollo";
  name: string;
  value: number;
  ts_ms: number;
};

export type PsycheUpdate = {
  type: "psyche_update";
  affect: Record<string, number>;
  ts_ms: number;
};

export type BiomarkerEvidence = {
  name: string;
  value: number;
  ts_ms: number;
};

export type ConcordanceFlag = {
  type: "concordance_flag";
  flag_id: string;
  utterance_id: string;
  utterance_text: string;
  matched_phrase: string;
  biomarker_evidence: BiomarkerEvidence[];
  claude_gloss: string;
  ts_ms: number;
};

export type CallStatus = {
  type: "call_status";
  status: "connecting" | "connected" | "ended";
  peers: number;
};

export type DashboardEvent =
  | TranscriptPartial
  | TranscriptFinal
  | BiomarkerProgress
  | BiomarkerResult
  | PsycheUpdate
  | ConcordanceFlag
  | CallStatus;

export type RoomCreateResponse = {
  room_id: string;
  created_at_ms: number;
};

/**
 * Prefer same-origin HTTP API routes (`/api/...`) — see `next.config.ts` rewrites.
 * Kept for scripts or rare direct backend calls.
 */
export function resolveBackendWs(): string {
  if (typeof window !== "undefined") {
    const isHttps = window.location.protocol === "https:";
    const proto = isHttps ? "wss:" : "ws:";
    const hostname = window.location.hostname;

    // 1. Local development
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${proto}//127.0.0.1:8000`;
    }

    // 2. Public tunnel (Cloudflare trycloudflare.com, pinggy, ngrok) - routes /ws through same origin
    if (hostname.includes("trycloudflare.com") || hostname.includes("pinggy") || hostname.includes("ngrok")) {
      return `${proto}//${window.location.host}`;
    }

    // 3. Remote production (Vercel, Render frontend)
    return "wss://truevoice-backend-1mh1.onrender.com";
  }
  return process.env.NEXT_PUBLIC_BACKEND_WS_URL || "ws://127.0.0.1:8000";
}

export function resolveBackendHttp(): string {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://127.0.0.1:8000";
    }
    if (hostname.includes("trycloudflare.com") || hostname.includes("pinggy") || hostname.includes("ngrok")) {
      return window.location.origin;
    }
    return "https://truevoice-backend-1mh1.onrender.com";
  }
  return process.env.NEXT_PUBLIC_BACKEND_HTTP_URL || "http://127.0.0.1:8000";
}

export const BACKEND_HTTP = typeof window !== "undefined" ? resolveBackendHttp() : "http://127.0.0.1:8000";
export const BACKEND_WS = typeof window !== "undefined" ? resolveBackendWs() : "ws://127.0.0.1:8000";
