"use client";

// SCH-825 M10 — Tiny client component that mounts the PM realtime hook and
// triggers router.refresh() on any change. RSC pages embed this to get
// reactive updates without becoming client components themselves.

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { usePmRealtime, type RealtimeFilter } from "./useRealtime";

export function RealtimeRefresher({ subs }: { subs: RealtimeFilter[] }) {
  const router = useRouter();
  const onChange = useCallback(() => router.refresh(), [router]);
  usePmRealtime(subs, onChange);
  return null;
}
