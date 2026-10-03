import { CirclePageShell } from "@/app/CirclePageShell";
import { HandleCircleApp } from "@/components/HandleCircleApp";
import { HandleSeoSummary } from "@/components/HandleSeoSummary";

export default async function UserCirclePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return (
    <CirclePageShell>
      <HandleCircleApp />
      <HandleSeoSummary handle={handle} />
    </CirclePageShell>
  );
}
