"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await signOut();
        router.replace("/sign-in");
        router.refresh();
      }}
      className="flex w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3.5 text-left text-sm text-destructive ring-1 ring-hairline"
    >
      <LogOut className="size-4" /> Sign out
    </button>
  );
}
