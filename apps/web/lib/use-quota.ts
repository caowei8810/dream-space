"use client";

import type { QuotaResponse } from "@dream-space/contracts";
import { useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const quotaEvent = "dream-space-quota-change";

export function notifyQuotaChanged() {
  window.dispatchEvent(new Event(quotaEvent));
}

const demoQuota: QuotaResponse = {
  total: 100,
  available: 80,
  reserved: 0,
  used: 20,
  remainingPercent: 80,
};

export function useQuota(enabled: boolean) {
  const [quota, setQuota] = useState<QuotaResponse>(demoQuota);

  useEffect(() => {
    if (!enabled) {
      setQuota(demoQuota);
      return;
    }

    const controller = new AbortController();
    const refresh = () => {
      void fetch(`${apiUrl}/generation/quota`, {
        credentials: "include",
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) throw new Error(`Quota request failed with ${response.status}`);
          return response.json() as Promise<QuotaResponse>;
        })
        .then(setQuota)
        .catch((error: Error) => {
          if (error.name !== "AbortError") setQuota(demoQuota);
        });
    };
    refresh();
    window.addEventListener(quotaEvent, refresh);

    return () => {
      controller.abort();
      window.removeEventListener(quotaEvent, refresh);
    };
  }, [enabled]);

  return quota;
}
