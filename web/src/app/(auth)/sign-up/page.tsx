import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Create account" };

export default function Page(props: PageProps<"/sign-up">) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-gradient text-4xl font-semibold tracking-tight">Meet your home’s twin</h1>
        <p className="text-muted-foreground">See where your heat goes, what to fix first, and what it’s worth.</p>
      </div>
      <Suspense fallback={<AuthForm mode="sign-up" />}>
        <FormWithNext {...props} />
      </Suspense>
    </div>
  );
}

async function FormWithNext({ searchParams }: PageProps<"/sign-up">) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-up" next={typeof next === "string" ? next : undefined} />;
}
