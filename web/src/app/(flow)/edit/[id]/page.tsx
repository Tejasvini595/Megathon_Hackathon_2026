import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { EditFlow } from "./edit-flow";
import type { EnergyUsage } from "@/lib/extract/fields";
import { footprintSize } from "@/lib/twin/from-record";
import { savedExtraction } from "./saved-extraction";

export const metadata: Metadata = { title: "Edit your home" };

export default function Page({ params }: PageProps<"/edit/[id]">) {
  return (
    <Suspense>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: { params: PageProps<"/edit/[id]">["params"] }) {
  const { id } = await params;
  const user = await requireUser();
  const home = await prisma.home.findFirst({
    where: { id, userId: user.id },
    select: { id: true, nickname: true, status: true, record: true, footprint: true, extractions: { where: { status: "DONE" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });
  const extraction = home && savedExtraction(home.record as Record<string, unknown> | null, home.extractions[0] ?? null);
  if (!home || !extraction) notFound();

  return <EditFlow homeId={home.id} nickname={home.nickname} extraction={extraction} footprint={footprintSize(home.footprint)} usage={(home.record as { usage?: EnergyUsage } | null)?.usage} backHref={home.status === "CONFIRMED" ? `/home?homeId=${home.id}` : "/you"} />;
}
