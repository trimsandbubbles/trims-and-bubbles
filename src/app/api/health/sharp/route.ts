import { NextResponse } from "next/server";

// Temporary health check: confirms the native `sharp` module loads and can
// process an image in the deployed serverless runtime. No auth/data involved.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sharp = (await import("sharp")).default;
    const buf = await sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 20, b: 30 } } })
      .jpeg()
      .toBuffer();
    return NextResponse.json({ ok: true, bytes: buf.length });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message.split("\n")[0] : String(e) },
      { status: 500 },
    );
  }
}
