"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Role } from "./types";
import {
  initCallAudioContext,
  isCallSoundsMuted,
  playCallEndedSound,
  playCallInitiatedSound,
  playJoinSound,
  playLeaveSound,
  toggleCallSoundsMuted,
} from "./callSounds";

export type CallPromptType = "join" | "leave" | "initiated" | "ended";

export interface CallPrompt {
  id: string;
  type: CallPromptType;
  title: string;
  message: string;
  timestamp: number;
  peerRole?: Role;
}

interface UseCallAlertsOpts {
  selfRole?: Role;
  peerLabel: string; // "Patient" or "Clinician"
  roomId?: string | null;
}

export function useCallAlerts({ peerLabel, roomId }: UseCallAlertsOpts) {
  const [prompt, setPrompt] = useState<CallPrompt | null>(null);
  const [soundMuted, setSoundMuted] = useState<boolean>(() => isCallSoundsMuted());
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalTitleRef = useRef<string>("");

  const clearTitleFlash = useCallback(() => {
    if (titleIntervalRef.current) {
      clearInterval(titleIntervalRef.current);
      titleIntervalRef.current = null;
    }
    if (originalTitleRef.current && typeof document !== "undefined") {
      document.title = originalTitleRef.current;
    }
  }, []);

  // Flash the document title if the user is in another tab
  const flashTitle = useCallback(
    (alertText: string) => {
      if (typeof document === "undefined") return;
      if (!document.hidden) return;

      clearTitleFlash();
      originalTitleRef.current = document.title;
      let toggle = false;

      titleIntervalRef.current = setInterval(() => {
        document.title = toggle ? alertText : originalTitleRef.current;
        toggle = !toggle;
      }, 1000);

      // Stop flashing after 8 seconds
      setTimeout(clearTitleFlash, 8000);
    },
    [clearTitleFlash]
  );

  // Clear title flashing when window regains visibility
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleVisibility = () => {
      if (!document.hidden) {
        clearTitleFlash();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearTitleFlash();
    };
  }, [clearTitleFlash]);

  const dismissPrompt = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setPrompt(null);
  }, []);

  const showPrompt = useCallback(
    (newPrompt: CallPrompt, autoDismissMs = 5000) => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
      }
      setPrompt(newPrompt);
      if (autoDismissMs > 0) {
        dismissTimerRef.current = setTimeout(() => {
          setPrompt((curr) => (curr?.id === newPrompt.id ? null : curr));
        }, autoDismissMs);
      }
    },
    []
  );

  const onPeerJoined = useCallback(
    (peerRole?: Role) => {
      initCallAudioContext();
      playJoinSound();
      flashTitle(`🔔 ${peerLabel} Joined!`);

      showPrompt({
        id: `join-${Date.now()}`,
        type: "join",
        title: `${peerLabel} Joined Call`,
        message: `The ${peerLabel.toLowerCase()} is now connected to the consultation session.`,
        timestamp: Date.now(),
        peerRole,
      });
    },
    [peerLabel, flashTitle, showPrompt]
  );

  const onPeerLeft = useCallback(
    (peerRole?: Role) => {
      initCallAudioContext();
      playLeaveSound();
      flashTitle(`⚠ ${peerLabel} Left!`);

      showPrompt(
        {
          id: `leave-${Date.now()}`,
          type: "leave",
          title: `${peerLabel} Left Call`,
          message: `The ${peerLabel.toLowerCase()} has disconnected from the call.`,
          timestamp: Date.now(),
          peerRole,
        },
        6000
      );
    },
    [peerLabel, flashTitle, showPrompt]
  );

  const notifyCallInitiated = useCallback(() => {
    initCallAudioContext();
    playCallInitiatedSound();

    showPrompt(
      {
        id: `init-${Date.now()}`,
        type: "initiated",
        title: "Call Initiated",
        message: roomId
          ? `Room ${roomId} is live. Waiting for ${peerLabel.toLowerCase()} to join...`
          : `Consultation session live. Waiting for ${peerLabel.toLowerCase()}...`,
        timestamp: Date.now(),
      },
      4500
    );
  }, [roomId, peerLabel, showPrompt]);

  const notifyCallEnded = useCallback(() => {
    initCallAudioContext();
    playCallEndedSound();

    showPrompt(
      {
        id: `end-${Date.now()}`,
        type: "ended",
        title: "Consultation Ended",
        message: "You have left the consultation.",
        timestamp: Date.now(),
      },
      3000
    );
  }, [showPrompt]);

  const toggleSound = useCallback(() => {
    const next = toggleCallSoundsMuted();
    setSoundMuted(next);
    return next;
  }, []);

  return {
    prompt,
    soundMuted,
    dismissPrompt,
    onPeerJoined,
    onPeerLeft,
    notifyCallInitiated,
    notifyCallEnded,
    toggleSound,
  };
}
