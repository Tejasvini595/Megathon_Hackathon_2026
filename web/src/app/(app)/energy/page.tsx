import type { Metadata } from "next";
import { ActiveHomeRedirect } from "@/components/app/active-home-redirect";

export const metadata: Metadata = { title: "Energy" };

export default function Page() {
  return <ActiveHomeRedirect section="energy" />;
}
