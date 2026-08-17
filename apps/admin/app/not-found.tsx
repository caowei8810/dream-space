import Link from "next/link";

export default function AdminNotFound() {
  return (
    <main className="admin-state-page">
      <div className="admin-state admin-state-empty">
        <strong>页面不存在</strong>
        <span>请从管理端导航选择可用模块。</span>
        <Link className="admin-button secondary" href="/tasks">
          返回生成任务
        </Link>
      </div>
    </main>
  );
}
