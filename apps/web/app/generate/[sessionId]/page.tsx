import { GenerationWorkspace } from "../../../components/generation/generation-workspace";
import { InspirationShell } from "../../../components/inspiration/inspiration-shell";

export default async function GenerationSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return (
    <InspirationShell activePage="generate">
      <GenerationWorkspace initialSessionId={sessionId} />
    </InspirationShell>
  );
}
