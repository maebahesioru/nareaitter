import { ImageResponse } from "next/og";

/** ビルド時の静的生成で Geist .ttf を読みに行き Windows/pnpm で ENOENT になるのを避ける */
export const dynamic = "force-dynamic";

const size = { width: 1200, height: 630 };

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(145deg, #0ea5e9 0%, #059669 42%, #18181b 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            width: 320,
            height: 320,
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 300,
              height: 300,
              border: "6px solid rgba(255,255,255,0.28)",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 200,
              height: 200,
              border: "6px solid rgba(255,255,255,0.45)",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: 100,
              height: 100,
              background: "rgba(255,255,255,0.92)",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
