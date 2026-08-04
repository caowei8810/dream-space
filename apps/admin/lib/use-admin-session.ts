"use client";

import type { AdminSessionResponse } from "@dream-space/contracts";
import { useCallback, useEffect, useState } from "react";
import { adminApi } from "./admin-api";

const sessionEvent = "dream-space-admin-session-change";

export function notifyAdminSessionChanged() {
  window.dispatchEvent(new Event(sessionEvent));
}

export function useAdminSession() {
  const [session, setSession] = useState<AdminSessionResponse | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSession(await adminApi.session());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    const handleChange = () => void refresh();
    void refresh();
    window.addEventListener(sessionEvent, handleChange);
    return () => window.removeEventListener(sessionEvent, handleChange);
  }, [refresh]);

  const logout = async () => {
    await adminApi.logout();
    setSession({ authenticated: false });
    notifyAdminSessionChanged();
  };

  return { session, loading: session === null && !error, error, refresh, logout };
}
