"use client";

import { useEffect, useRef, useState } from "react";
import { Role } from "./types";

type SignalMsg =
  | { type: "ready"; role?: Role; peer: Role | null }
  | { type: "peer-joined"; peer?: Role }
  | { type: "peer-left"; peer?: Role }
  | { type: "role-assigned"; role: Role }
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice"; candidate: RTCIceCandidateInit };

export type VideoCallState = {
  remoteStream: MediaStream | null;
  peerConnected: boolean;
  signalingConnected: boolean;
  peerPresent: boolean;
  error: string | null;
};

const INITIAL: VideoCallState = {
  remoteStream: null,
  peerConnected: false,
  signalingConnected: false,
  peerPresent: false,
  error: null,
};

const METERED_USER = "549f459ae4a48f00b18c813d";
const METERED_CRED = "FzJf5f9bRbxp0GLm";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.relay.metered.ca:80" },
  { urls: "stun:stun.l.google.com:19302" },
  {
    urls: "turn:global.relay.metered.ca:80",
    username: METERED_USER,
    credential: METERED_CRED,
  },
  {
    urls: "turn:global.relay.metered.ca:80?transport=tcp",
    username: METERED_USER,
    credential: METERED_CRED,
  },
  {
    urls: "turn:global.relay.metered.ca:443",
    username: METERED_USER,
    credential: METERED_CRED,
  },
  {
    urls: "turns:global.relay.metered.ca:443?transport=tcp",
    username: METERED_USER,
    credential: METERED_CRED,
  },
];

type Opts = {
  roomId: string | null;
  role: Role;
  localStream: MediaStream | null;
  enabled: boolean;
};

function getSignalingWsUrl(role: Role, roomId: string): string {
  const fallback =
    typeof window !== "undefined"
      ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
      : "ws://localhost:8000";
  const base = (process.env.NEXT_PUBLIC_BACKEND_WS_URL || fallback).replace(/\/$/, "");
  return `${base}/ws/signal/${encodeURIComponent(role)}/${encodeURIComponent(roomId)}`;
}

/**
 * 1:1 WebRTC video call between patient and clinician in a room.
 * Clinician is the impolite (offering) peer; patient is polite (answering).
 * Signaling runs over /ws/signal and relays SDP + ICE.
 */
export function useVideoCall({ roomId, role, localStream, enabled }: Opts): VideoCallState {
  const [state, setState] = useState<VideoCallState>(INITIAL);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet = useRef(false);
  const peerPresentRef = useRef(false);
  const activeRoleRef = useRef<Role>(role);
  const localStreamRef = useRef<MediaStream | null>(localStream);
  const destroyedRef = useRef(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeRoleRef.current = role;
  }, [role]);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    if (!enabled || !roomId) return;

    destroyedRef.current = false;
    const tag = `[call:${role}:${roomId}]`;

    const isPolite = () => activeRoleRef.current === "patient";

    const sendSignal = (msg: SignalMsg) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log(tag, "--> WS SEND:", msg.type);
        ws.send(JSON.stringify(msg));
      } else {
        console.warn(tag, "WS SEND DROPPED (socket not open):", msg.type, "state=", ws?.readyState);
      }
    };

    const addLocalTracks = (pc: RTCPeerConnection) => {
      const ls = localStreamRef.current;
      if (!ls) return;
      const senders = pc.getSenders();
      for (const track of ls.getTracks()) {
        const existing = senders.find((s) => s.track?.kind === track.kind);
        if (existing) {
          existing.replaceTrack(track).catch(() => {});
        } else {
          try {
            pc.addTrack(track, ls);
            console.log(tag, "Added local track:", track.kind);
          } catch {
            /* already added */
          }
        }
      }
    };

    const createAndSendOffer = async () => {
      const pc = pcRef.current;
      if (!pc) {
        console.warn(tag, "createAndSendOffer: no RTCPeerConnection");
        return;
      }
      if (pc.signalingState !== "stable" && pc.signalingState !== "have-local-offer") {
        console.warn(tag, "createAndSendOffer: unexpected signalingState", pc.signalingState);
        return;
      }
      try {
        console.log(tag, "--> Creating WebRTC offer (audio+video transceivers)...");
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        console.log(tag, "--> setLocalDescription(offer)");
        await pc.setLocalDescription(offer);
        if (pc.localDescription) {
          sendSignal({ type: "offer", sdp: pc.localDescription.toJSON() });
        }
      } catch (e) {
        console.error(tag, "Failed to create/send offer:", e);
        setState((s) => ({ ...s, error: `Offer failed: ${String(e)}` }));
      }
    };

    const updateConnectionState = (pc: RTCPeerConnection) => {
      const cs = pc.connectionState;
      const ics = pc.iceConnectionState;
      console.log(tag, `WebRTC state: connectionState=${cs}, iceConnectionState=${ics}`);
      const isConnected = cs === "connected" || ics === "connected" || ics === "completed";

      setState((s) => ({
        ...s,
        peerConnected: isConnected,
        peerPresent: peerPresentRef.current || isConnected,
      }));

      if ((cs === "failed" || ics === "failed") && !isPolite() && peerPresentRef.current) {
        console.warn(tag, "Connection failed; attempting ICE restart");
        try {
          pc.restartIce();
          createAndSendOffer();
        } catch {}
      }
    };

    const buildPeerConnection = () => {
      console.log(tag, "Building new RTCPeerConnection...");
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      remoteDescSet.current = false;
      pendingCandidates.current = [];

      const remote = new MediaStream();
      remoteStreamRef.current = remote;
      setState((s) => ({ ...s, remoteStream: remote, peerConnected: false }));

      pc.ontrack = (e) => {
        console.log(tag, "--> ontrack received track:", e.track.kind, "stream count:", e.streams.length);
        const stream = remoteStreamRef.current || new MediaStream();
        remoteStreamRef.current = stream;

        if (e.streams[0]) {
          e.streams[0].getTracks().forEach((t) => {
            if (!stream.getTracks().some((rt) => rt.id === t.id)) {
              stream.addTrack(t);
            }
          });
        } else if (!stream.getTracks().some((t) => t.id === e.track.id)) {
          stream.addTrack(e.track);
        }

        // Immediately update state so UI renders remote video without reloading
        setState((s) => ({
          ...s,
          remoteStream: stream,
          peerConnected: true,
          peerPresent: true,
        }));
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          const c = e.candidate;
          console.log(tag, "Local ICE candidate:", c.type, c.protocol, c.candidate);
          sendSignal({ type: "ice", candidate: c.toJSON() });
        } else {
          console.log(tag, "ICE gathering complete (null candidate)");
        }
      };

      pc.onconnectionstatechange = () => updateConnectionState(pc);
      pc.oniceconnectionstatechange = () => updateConnectionState(pc);
      pc.onsignalingstatechange = () => {
        console.log(tag, "Signaling state:", pc.signalingState);
      };

      addLocalTracks(pc);
      return pc;
    };

    const resetPeerConnection = () => {
      const pc = pcRef.current;
      if (pc) {
        try { pc.close(); } catch {}
      }
      pcRef.current = null;
      remoteStreamRef.current = null;
      setState((s) => ({ ...s, remoteStream: null, peerConnected: false }));
      buildPeerConnection();
    };

    const openSignaling = () => {
      if (destroyedRef.current) return;
      const url = getSignalingWsUrl(activeRoleRef.current, roomId);
      console.log(tag, "Connecting to signaling server:", url);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(tag, "Signaling WebSocket open and ready");
        setState((s) => ({ ...s, signalingConnected: true, error: null }));
      };

      ws.onclose = (ev) => {
        console.warn(tag, "Signaling WebSocket closed. Code:", ev.code, "Reason:", ev.reason);
        setState((s) => ({ ...s, signalingConnected: false, peerPresent: false }));
        peerPresentRef.current = false;

        if (ev.code === 4409) {
          setState((s) => ({
            ...s,
            error: "Room is full (both patient and clinician are already connected).",
          }));
          return;
        }

        if (ev.code === 4000) {
          setState((s) => ({
            ...s,
            error: "Session active in another window or tab.",
          }));
          return;
        }

        if (!destroyedRef.current) {
          reconnectTimer.current = setTimeout(openSignaling, 1500);
        }
      };

      ws.onerror = (err) => {
        console.error(tag, "Signaling WebSocket error:", err);
      };

      ws.onmessage = async (ev) => {
        let msg: SignalMsg;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        } catch {
          return;
        }

        console.log(tag, "<-- WS RECV:", msg.type, JSON.stringify(msg));
        const pc = pcRef.current;
        if (!pc) {
          console.warn(tag, "Received message but RTCPeerConnection not ready");
          return;
        }

        switch (msg.type) {
          case "role-assigned":
            console.log(tag, "Assigned role by server:", msg.role);
            activeRoleRef.current = msg.role;
            break;

          case "ready":
            if (msg.role) activeRoleRef.current = msg.role;
            if (msg.peer) {
              peerPresentRef.current = true;
              setState((s) => ({ ...s, peerPresent: true }));
              if (!isPolite()) {
                console.log(tag, "Impolite peer initiating offer upon ready...");
                await createAndSendOffer();
              }
            }
            break;

          case "peer-joined":
            peerPresentRef.current = true;
            setState((s) => ({ ...s, peerPresent: true }));
            if (!isPolite()) {
              console.log(tag, "Impolite peer initiating offer upon peer-joined...");
              await createAndSendOffer();
            }
            break;

          case "peer-left":
            console.log(tag, "Peer left the room");
            peerPresentRef.current = false;
            setState((s) => ({ ...s, peerPresent: false, peerConnected: false }));
            resetPeerConnection();
            break;

          case "offer": {
            try {
              console.log(tag, "Handling remote offer, current signalingState:", pc.signalingState);
              const polite = isPolite();
              const readyForOffer = !polite || pc.signalingState === "stable" || pc.signalingState === "have-local-offer";
              if (!readyForOffer) {
                console.warn(tag, "Offer collision; polite peer rolling back local offer");
                await pc.setLocalDescription({ type: "rollback" });
              }

              await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              remoteDescSet.current = true;

              console.log(tag, "Draining", pendingCandidates.current.length, "queued ICE candidates");
              for (const c of pendingCandidates.current) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(c));
                } catch (e) {
                  console.warn(tag, "Queued ICE candidate add failed:", e);
                }
              }
              pendingCandidates.current = [];

              console.log(tag, "Creating and sending answer...");
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              if (pc.localDescription) {
                sendSignal({ type: "answer", sdp: pc.localDescription.toJSON() });
              }
            } catch (e) {
              console.error(tag, "Failed to handle remote offer:", e);
              setState((s) => ({ ...s, error: `Offer processing error: ${String(e)}` }));
            }
            break;
          }

          case "answer": {
            try {
              console.log(tag, "Handling remote answer, current signalingState:", pc.signalingState);
              if (pc.signalingState === "have-local-offer") {
                await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                remoteDescSet.current = true;
                console.log(tag, "Remote description set (answer), draining queued ICE");
                for (const c of pendingCandidates.current) {
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(c));
                  } catch (e) {
                    console.warn(tag, "Queued ICE candidate add failed:", e);
                  }
                }
                pendingCandidates.current = [];
              } else {
                console.warn(tag, "Received answer in non-offering state:", pc.signalingState);
              }
            } catch (e) {
              console.error(tag, "Failed to handle remote answer:", e);
              setState((s) => ({ ...s, error: `Answer processing error: ${String(e)}` }));
            }
            break;
          }

          case "ice": {
            if (remoteDescSet.current) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } catch (e) {
                console.warn(tag, "addIceCandidate failed:", e);
              }
            } else {
              pendingCandidates.current.push(msg.candidate);
              console.log(tag, "ICE queued (pending remote description), total:", pendingCandidates.current.length);
            }
            break;
          }
        }
      };
    };

    buildPeerConnection();
    openSignaling();

    return () => {
      destroyedRef.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      try { wsRef.current?.close(); } catch {}
      try { pcRef.current?.close(); } catch {}
      wsRef.current = null;
      pcRef.current = null;
      remoteStreamRef.current = null;
      peerPresentRef.current = false;
      setState(INITIAL);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, roomId, role]);

  // Sync local tracks into the peer connection whenever the stream changes
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || !localStream) return;

    const senders = pc.getSenders();
    let tracksChanged = false;
    for (const track of localStream.getTracks()) {
      const existing = senders.find((s) => s.track?.kind === track.kind);
      if (existing) {
        if (existing.track !== track) {
          existing.replaceTrack(track).catch(() => {});
        }
      } else {
        try {
          pc.addTrack(track, localStream);
          tracksChanged = true;
        } catch {}
      }
    }

    if (tracksChanged && activeRoleRef.current === "clinician" && peerPresentRef.current) {
      (async () => {
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await pc.setLocalDescription(offer);
          if (pc.localDescription && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: "offer",
              sdp: pc.localDescription.toJSON(),
            }));
          }
        } catch {}
      })();
    }
  }, [localStream]);

  return state;
}
