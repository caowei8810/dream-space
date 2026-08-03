"use client";

import type { AuthSessionResponse } from "@dream-space/contracts";
import { useCallback, useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const authEvent = "dream-space-auth-change";

export function notifyAuthChanged() {
  window.dispatchEvent(new Event(authEvent));
}

export function useAuth() {
  const [session, setSession] = useState<AuthSessionResponse | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`${apiUrl}/auth/session`, {
        credentials: "include",
        signal,
      });
      if (!response.ok) throw new Error(`Session request failed with ${response.status}`);
      setSession((await response.json()) as AuthSessionResponse);
      setError(false);
    } catch (requestError) {
      if ((requestError as Error).name !== "AbortError") setError(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const handleChange = () => void refresh();
    void refresh(controller.signal);
    window.addEventListener(authEvent, handleChange);
    return () => {
      controller.abort();
      window.removeEventListener(authEvent, handleChange);
    };
  }, [refresh]);

  const logout = async () => {
    const response = await fetch(`${apiUrl}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error(`Logout failed with ${response.status}`);
    setSession({ authenticated: false });
    notifyAuthChanged();
  };

  return { session, loading: session === null && !error, error, refresh, logout };
}
