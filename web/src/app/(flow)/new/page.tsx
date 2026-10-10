import type { Metadata } from "next";
import { CaptureFlow } from "./capture-flow";

export const metadata: Metadata = { title: "Add your home" };

export default function Page() {
  return <CaptureFlow />;
}
