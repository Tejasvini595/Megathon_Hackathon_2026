"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction, signUpAction, type AuthState } from "./actions";

const field = "h-12 rounded-2xl bg-surface px-4 text-base";
const label = "text-xs uppercase tracking-[0.14em] text-muted-foreground";

export function AuthForm({ mode, next }: { mode: "sign-in" | "sign-up"; next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "sign-up" ? signUpAction : signInAction, {});
  const signUp = mode === "sign-up";

  return (
    <form action={action} className="space-y-5">
      {next && <input type="hidden" name="next" value={next} />}
      {signUp && (
        <div className="space-y-2">
          <Label htmlFor="name" className={label}>Name</Label>
          <Input id="name" name="name" autoComplete="name" placeholder="Alex" defaultValue={state.name} className={field} />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email" className={label}>Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" defaultValue={state.email} className={field} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className={label}>Password</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete={signUp ? "new-password" : "current-password"} placeholder="At least 8 characters" className={field} />
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-12 w-full rounded-2xl text-base font-semibold">
        {pending ? <Loader2 className="animate-spin" /> : <>{signUp ? "Create account" : "Sign in"} <ArrowRight /></>}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {signUp ? "Already have an account? " : "New here? "}
        <Link href={signUp ? "/sign-in" : "/sign-up"} className="font-medium text-foreground underline-offset-4 hover:underline">
          {signUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
