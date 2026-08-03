import type { InspirationDetail } from "@dream-space/contracts";
import { notFound } from "next/navigation";
import { InspirationDetail as InspirationDetailView } from "../../../components/inspiration/inspiration-detail";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const dynamic = "force-dynamic";

export default async function InspirationDetailPage({
  params,
}: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const response = await fetch(`${apiUrl}/inspirations/${encodeURIComponent(slug)}`, {
    cache: "no-store",
  });

  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`Unable to load inspiration: ${response.status}`);

  const inspiration = (await response.json()) as InspirationDetail;
  return <InspirationDetailView inspiration={inspiration} />;
}
