import { GenerationWorkspace } from "../../components/generation/generation-workspace";
import { InspirationShell } from "../../components/inspiration/inspiration-shell";

export default function GeneratePage() {
  return (
    <InspirationShell activePage="generate">
      <GenerationWorkspace />
    </InspirationShell>
  );
}
