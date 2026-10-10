import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/app/auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-gradient text-4xl font-semibold tracking-tight">Meet your home’s twin</h1>
        <p className="text-muted-foreground">See where your heat goes, what to fix first, and what it’s worth.</p>
      </div>
      <Suspense>
        <AuthForm mode="sign-up" />
      </Suspense>
    </div>
  );
}
