import { OG_SIZE, renderOgImage } from "@/lib/og-circle";

export const dynamic = "force-dynamic";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Twitter nareai circle";

export default async function Image({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return renderOgImage(handle);
}
