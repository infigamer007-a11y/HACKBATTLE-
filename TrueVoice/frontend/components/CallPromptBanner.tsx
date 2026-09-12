"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  UserCheck,
  UserX,
  PhoneCall,
  PhoneOff,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { CallPrompt } from "@/lib/useCallAlerts";
import { cn } from "@/lib/utils";

interface Props {
  prompt: CallPrompt | null;
  onDismiss: () => void;
  soundMuted?: boolean;
  onToggleSound?: () => void;
  className?: string;
}

export default function CallPromptBanner({
  prompt,
  onDismiss,
  soundMuted = false,
  onToggleSound,
  className,
}: Props) {
  return (
    <AnimatePresence>
      {prompt && (
        <motion.div
          key={prompt.id}
          initial={{ opacity: 0, y: -24, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.94 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          className={cn(
            "fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md pointer-events-auto",
            className
          )}
        >
          <div
            className={cn(
              "relative flex items-center gap-3.5 rounded-xl px-4 py-3.5 shadow-2xl backdrop-blur-xl transition-all",
              "border bg-neutral-950/92 text-white",
              prompt.type === "join" &&
                "border-emerald-500/50 shadow-[0_8px_32px_rgba(16,185,129,0.22)]",
              prompt.type === "leave" &&
                "border-amber-500/50 shadow-[0_8px_32px_rgba(245,158,11,0.22)]",
              prompt.type === "initiated" &&
                "border-orange-500/50 shadow-[0_8px_32px_rgba(249,115,22,0.22)]",
              prompt.type === "ended" &&
                "border-neutral-700/60 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
            )}
          >
            {/* Tone icon pill */}
            <div
              className={cn(
                "flex-none flex items-center justify-center h-10 w-10 rounded-lg",
                prompt.type === "join" && "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
                prompt.type === "leave" && "bg-amber-500/15 text-amber-400 border border-amber-500/30",
                prompt.type === "initiated" && "bg-orange-500/15 text-orange-400 border border-orange-500/30",
                prompt.type === "ended" && "bg-neutral-800 text-neutral-300 border border-neutral-700"
              )}
            >
              {prompt.type === "join" && <UserCheck className="h-5 w-5 animate-pulse" />}
              {prompt.type === "leave" && <UserX className="h-5 w-5 animate-pulse" />}
              {prompt.type === "initiated" && <PhoneCall className="h-5 w-5 animate-pulse" />}
              {prompt.type === "ended" && <PhoneOff className="h-5 w-5" />}
            </div>

            {/* Prompt details */}
            <div className="flex-1 min-w-0 pr-1">
              <div className="flex items-center gap-2">
                <span className="font-['Space_Grotesk'] text-[13px] font-bold tracking-tight text-white">
                  {prompt.title}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider",
                    prompt.type === "join" && "bg-emerald-500/20 text-emerald-300",
                    prompt.type === "leave" && "bg-amber-500/20 text-amber-300",
                    prompt.type === "initiated" && "bg-orange-500/20 text-orange-300",
                    prompt.type === "ended" && "bg-neutral-800 text-neutral-400"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      prompt.type === "join" && "bg-emerald-400 tv-pulse-dot",
                      prompt.type === "leave" && "bg-amber-400",
                      prompt.type === "initiated" && "bg-orange-400 tv-pulse-dot",
                      prompt.type === "ended" && "bg-neutral-400"
                    )}
                  />
                  {prompt.type === "join"
                    ? "Active"
                    : prompt.type === "leave"
                    ? "Left"
                    : prompt.type === "initiated"
                    ? "Live"
                    : "Ended"}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-neutral-300 leading-snug line-clamp-2">
                {prompt.message}
              </p>
            </div>

            {/* Actions: Sound toggle & close */}
            <div className="flex-none flex items-center gap-1">
              {onToggleSound && (
                <button
                  type="button"
                  onClick={onToggleSound}
                  title={soundMuted ? "Unmute call sounds" : "Mute call sounds"}
                  className="rounded-md p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  {soundMuted ? (
                    <VolumeX className="h-4 w-4 text-red-400" />
                  ) : (
                    <Volume2 className="h-4 w-4 text-emerald-400" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={onDismiss}
                title="Dismiss notification"
                className="rounded-md p-1.5 text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
