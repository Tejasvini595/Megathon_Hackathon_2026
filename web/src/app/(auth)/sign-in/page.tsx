import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function Page(props: PageProps<"/sign-in">) {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-gradient text-4xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground">Sign in to see your home’s twin.</p>
      </div>
      <Suspense fallback={<AuthForm mode="sign-in" />}>
        <FormWithNext {...props} />
      </Suspense>
    </div>
  );
}

async function FormWithNext({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-in" next={typeof next === "string" ? next : undefined} />;
}
