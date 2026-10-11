import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { getSharedTwin } from "./data";

export const alt = "Green Home Twin card";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Hex twin of scoreTone (CSS variables don't exist in the image renderer). */
const tone = (score: number) => (score >= 80 ? "#3dffb0" : score >= 65 ? "#9fe66f" : score >= 50 ? "#ffb020" : score >= 30 ? "#ff7a22" : "#ff3b1f");

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const shared = await getSharedTwin((await params).slug);
  const twin = shared?.twin;
  const color = twin ? tone(twin.score) : "#3dffb0";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: 72, color: "#f2f4f7", background: "radial-gradient(70% 90% at 25% 55%, #10281f, #0b0d10 70%)" }}>
        <div style={{ display: "flex", width: 440, height: 440, alignItems: "center", justifyContent: "center", borderRadius: 48, border: "2px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)" }}>
          <svg width="340" height="300" viewBox="0 0 120 90" fill="none">
            <path d="M14 44 60 10l46 34" stroke={color} strokeWidth="3" strokeLinejoin="round" />
            <path d="M24 38v42h72V38" stroke="#e9e6df" strokeWidth="3" strokeLinejoin="round" />
            <rect x="36" y="50" width="14" height="12" rx="1.5" stroke={color} strokeWidth="3" />
            <rect x="70" y="50" width="14" height="12" rx="1.5" stroke={color} strokeWidth="3" />
            <path d="M55 80V64h10v16" stroke="#e9e6df" strokeWidth="3" />
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 72, flex: 1 }}>
          <div style={{ display: "flex", fontSize: 28, letterSpacing: 6, color: "#8b95a3", textTransform: "uppercase" }}>Green Home Twin</div>
          {twin ? (
            <>
              <div style={{ display: "flex", fontSize: 64, fontWeight: 600, marginTop: 20, maxWidth: 560 }}>{twin.nickname.slice(0, 28)}</div>
              <div style={{ display: "flex", alignItems: "flex-end", marginTop: 24 }}>
                <div style={{ display: "flex", fontSize: 190, lineHeight: 1, fontWeight: 300, color }}>{twin.score}</div>
                <div style={{ display: "flex", fontSize: 40, marginLeft: 24, marginBottom: 20 }}>{twin.scoreRange ? `${twin.scoreClass} (est.)` : twin.scoreClass}</div>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", fontSize: 72, fontWeight: 600, marginTop: 24 }}>See your home as a living twin</div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
