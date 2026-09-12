"use client";

import { useState } from "react";
import Script from "next/script";
import Link from "next/link";

declare global {
  interface Window {
    puter?: {
      auth: {
        signIn: () => Promise<{ success: boolean; token: string }>;
        isSignedIn: () => boolean;
        getUser: () => Promise<{ username: string }>;
      };
      authToken?: string;
    };
  }
}

export default function PuterTokenPage() {
  const [token, setToken] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const handleSignIn = async () => {
    if (!window.puter) {
      setError("Puter SDK is still loading, please wait a moment and try again.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await window.puter.auth.signIn();
      if (res && res.token) {
        setToken(res.token);
        const user = await window.puter.auth.getUser().catch(() => null);
        if (user) setUsername(user.username);
      } else if (window.puter.authToken) {
        setToken(window.puter.authToken);
      }
    } catch (err: any) {
      setError(err?.msg || err?.message || "Failed to sign in with Puter.");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center items-center p-6">
      <Script src="https://js.puter.com/v2/" strategy="afterInteractive" />

      <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-orange-500"></span>
          <span className="font-bold text-orange-500 tracking-tight">TRUE</span>
          <span className="font-bold text-white -ml-1">VOICE</span>
          <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded ml-auto">
            Free Claude Access
          </span>
        </div>

        <div>
          <h1 className="text-xl font-bold text-white">Get Free Puter Token</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Connect with Puter to get your personal auth token for free Claude API access in TrueVoice.
          </p>
        </div>

        {!token ? (
          <button
            onClick={handleSignIn}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-orange-500/20"
          >
            {loading ? (
              <span>Connecting to Puter...</span>
            ) : (
              <span>Sign in with Puter & Get Token</span>
            )}
          </button>
        ) : (
          <div className="space-y-4">
            {username && (
              <p className="text-xs text-green-400">
                Connected as <strong className="text-white">{username}</strong>
              </p>
            )}

            <div>
              <label className="text-xs font-mono uppercase tracking-wider text-neutral-400 block mb-1">
                Your Puter Auth Token:
              </label>
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono break-all text-neutral-300 max-h-24 overflow-y-auto select-all">
                {token}
              </div>
            </div>

            <button
              onClick={copyToClipboard}
              className="w-full py-3 px-4 rounded-xl bg-white hover:bg-neutral-200 text-neutral-950 font-semibold transition-all flex items-center justify-center gap-2"
            >
              {copied ? "Copied to Clipboard!" : "Copy Token"}
            </button>

            <div className="p-3 bg-neutral-950/60 border border-neutral-800/80 rounded-lg text-xs text-neutral-400 space-y-1">
              <p className="font-semibold text-neutral-300">Next step:</p>
              <p>Paste this token into <code className="text-orange-400">backend/.env</code>:</p>
              <code className="block bg-neutral-900 p-2 rounded text-neutral-200 break-all">
                PUTER_AUTH_TOKEN={token}
              </code>
            </div>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 bg-red-950/40 p-3 rounded-lg border border-red-900/50">
            {error}
          </p>
        )}

        <div className="pt-2 border-t border-neutral-800 text-center">
          <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
            Back to TrueVoice Home
          </Link>
        </div>
      </div>
    </div>
  );
}
