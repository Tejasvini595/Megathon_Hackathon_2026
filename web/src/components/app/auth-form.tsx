"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn, signUp } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const name = String(form.get("name") ?? "");
    setError(null);
    startTransition(async () => {
      const res =
        mode === "sign-up"
          ? await signUp.email({ email, password, name: name || email.split("@")[0] })
          : await signIn.email({ email, password });
      if (res.error) {
        setError(res.error.message ?? "Something went wrong");
        return;
      }
      toast.success(mode === "sign-up" ? "Welcome aboard" : "Welcome back");
      router.replace(next && next.startsWith("/") ? next : mode === "sign-up" ? "/new" : "/home");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {mode === "sign-up" && (
        <div className="space-y-2">
          <Label htmlFor="name" className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Name</Label>
          <Input id="name" name="name" autoComplete="name" placeholder="Alex" className="h-12 rounded-2xl bg-surface px-4 text-base" />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" className="h-12 rounded-2xl bg-surface px-4 text-base" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          placeholder="At least 8 characters"
          className="h-12 rounded-2xl bg-surface px-4 text-base"
        />
      </div>
      {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending} className="h-12 w-full rounded-2xl text-base font-semibold">
        {pending ? <Loader2 className="animate-spin" /> : <>{mode === "sign-up" ? "Create account" : "Sign in"} <ArrowRight /></>}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "sign-up" ? "Already have an account? " : "New here? "}
        <Link href={mode === "sign-up" ? "/sign-in" : "/sign-up"} className="font-medium text-foreground underline-offset-4 hover:underline">
          {mode === "sign-up" ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
