import { NextResponse } from "next/server";

/** 常に text/plain で返し、AdSense / ads.txt 検証を通しやすくする */
const ADS_TXT =
  "google.com, pub-9868361167191737, DIRECT, f08c47fec0942fa0\n";

export function GET() {
  return new NextResponse(ADS_TXT, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
