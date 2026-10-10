import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/app/auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-gradient text-4xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground">Sign in to see your home’s twin.</p>
      </div>
      <Suspense>
        <AuthForm mode="sign-in" />
      </Suspense>
    </div>
  );
}
