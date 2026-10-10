"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { auth } from "@/lib/auth";

export type AuthState = { error?: string; email?: string; name?: string };

const credentials = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().trim().max(80).optional(),
});

/** Only same-site relative paths; anything else falls back to the default. */
function safeNext(next: FormDataEntryValue | null, fallback: string) {
  const s = typeof next === "string" ? next : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
}

async function run(mode: "sign-in" | "sign-up", form: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    name: form.get("name") || undefined,
  });
  const echo = { email: String(form.get("email") ?? ""), name: String(form.get("name") ?? "") };
  if (!parsed.success) return { ...echo, error: parsed.error.issues[0].message };

  const { email, password, name } = parsed.data;
  try {
    // nextCookies() in lib/auth.ts writes the session cookie from inside the action.
    if (mode === "sign-up") await auth.api.signUpEmail({ body: { email, password, name: name || email.split("@")[0] }, headers: await headers() });
    else await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (e) {
    if (e instanceof APIError) return { ...echo, error: e.message || "Couldn't sign you in" };
    throw e;
  }
  redirect(safeNext(form.get("next"), mode === "sign-up" ? "/new" : "/home"));
}

export async function signInAction(_prev: AuthState, form: FormData) {
  return run("sign-in", form);
}

export async function signUpAction(_prev: AuthState, form: FormData) {
  return run("sign-up", form);
}
