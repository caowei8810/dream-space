"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="admin-state-page">
      <div className="admin-state admin-state-error" role="alert">
        <AlertTriangle aria-hidden="true" />
        <strong>管理端页面出现异常</strong>
        <span>页面没有完成加载，已有数据不会被自动修改。</span>
        <button className="admin-button secondary" type="button" onClick={reset}>
          <RefreshCw aria-hidden="true" />
          重新加载
        </button>
      </div>
    </main>
  );
}
