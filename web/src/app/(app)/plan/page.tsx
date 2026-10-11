import type { Metadata } from "next";
import { ActiveHomeRedirect } from "@/components/app/active-home-redirect";

export const metadata: Metadata = { title: "Plan" };

export default function Page() {
  return <ActiveHomeRedirect section="plan" />;
}
