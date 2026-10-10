import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readUpload } from "@/lib/storage";

/** Serves an uploaded photo or plan to its owner only. `id` is the HomeInput id. */
export async function GET(_request: Request, ctx: RouteContext<"/api/uploads/[id]">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("unauthorised", { status: 401 });
  const { id } = await ctx.params;
  const input = await prisma.homeInput.findFirst({ where: { id, home: { userId: session.user.id } } });
  if (!input?.fileUrl) return new Response("not found", { status: 404 });
  const body = await readUpload(input.fileUrl);
  return new Response(new Uint8Array(body), {
    headers: { "content-type": input.mimeType ?? "application/octet-stream", "cache-control": "private, max-age=3600" },
  });
}
