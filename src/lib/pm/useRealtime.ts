"use client";

// SCH-825 M10 — Supabase Realtime hook for PM tables. Subscribes to
// pm.tasks / pm.task_comments / pm.notifications with a row-level filter
// and calls the supplied onChange callback on INSERT/UPDATE/DELETE. The
// MVP just triggers router.refresh() in the call site so RSC re-fetches
// — incremental state-patching can come in Phase 2.
//
// Each subscription opens its own channel; the cleanup function unsubscribes.
// Channel names are scoped (pm:tasks:project=<id>) so multiple hooks on the
// same page don't collide.

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Table = "tasks" | "task_comments" | "notifications";

export type RealtimeFilter = {
  table: Table;
  filter?: string; // e.g. "project_id=eq.<uuid>"
  channelKey: string;
};

export function usePmRealtime(
  subs: RealtimeFilter[],
  onChange: () => void,
) {
  useEffect(() => {
    if (subs.length === 0) return;

    const sb = createClient();
    // Topic format aligned with @supabase/realtime: schema:table.filter.
    // We always run in the pm schema; the filter param is the row-level WHERE.
    const channels = subs.map((s) => {
      const channel = sb.channel(`pm:${s.table}:${s.channelKey}`);
      channel.on(
        // realtime-js typing has known gaps for Postgres changes; the
        // cast is the documented workaround.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "*",
          schema: "pm",
          table: s.table,
          ...(s.filter ? { filter: s.filter } : {}),
        },
        () => onChange(),
      );
      channel.subscribe();
      return channel;
    });

    return () => {
      channels.forEach((c) => sb.removeChannel(c));
    };
    // We key the effect on a JSON snapshot of `subs` so callers don't
    // have to memoize the array literal. onChange should be a stable
    // useCallback / router.refresh from the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(subs), onChange]);
}
