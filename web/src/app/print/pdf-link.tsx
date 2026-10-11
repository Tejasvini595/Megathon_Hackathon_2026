import Link from "next/link";
import { FileDown } from "lucide-react";

export function PlanPdfLink({ homeId }: { homeId: string }) {
  return (
    <Link href={`/print/${homeId}`} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-hairline transition-colors hover:text-foreground">
      <FileDown className="size-3.5" />
      Save as PDF
    </Link>
  );
}
