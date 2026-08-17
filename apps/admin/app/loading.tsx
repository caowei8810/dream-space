import { AdminState } from "../components/admin-state";

export default function AdminLoading() {
  return (
    <main className="admin-state-page">
      <AdminState kind="loading" />
    </main>
  );
}
