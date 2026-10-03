import { CirclePageShell } from "@/app/CirclePageShell";
import { HandleCircleApp } from "@/components/HandleCircleApp";
import { HandleSeoSummary } from "@/components/HandleSeoSummary";

export default async function EnUserCirclePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return (
    <CirclePageShell>
      <HandleCircleApp />
      <HandleSeoSummary handle={handle} locale="en" />
    </CirclePageShell>
  );
}
