import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";
import type { HealthStatus } from "@/lib/types";

const STATUS_STYLES: Record<HealthStatus, string> = {
  online: "bg-[var(--status-online)]/15 text-[var(--status-online)] border-[var(--status-online)]/30",
  degraded: "bg-[var(--status-degraded)]/15 text-[var(--status-degraded)] border-[var(--status-degraded)]/30",
  offline: "bg-[var(--status-offline)]/15 text-[var(--status-offline)] border-[var(--status-offline)]/30",
  unknown: "bg-[var(--status-unknown)]/15 text-[var(--status-unknown)] border-[var(--status-unknown)]/30",
};

const STATUS_DOT: Record<HealthStatus, string> = {
  online: "bg-[var(--status-online)]",
  degraded: "bg-[var(--status-degraded)]",
  offline: "bg-[var(--status-offline)]",
  unknown: "bg-[var(--status-unknown)]",
};

const STATUS_LABEL: Record<HealthStatus, string> = {
  online: "Online",
  degraded: "Degraded",
  offline: "Offline",
  unknown: "Unknown",
};

export function StatusBadge({
  status,
  className,
  pulse = true,
}: {
  status: HealthStatus;
  className?: string;
  /** Pulse the dot for live/active states. */
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status],
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse && status !== "unknown" && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
              STATUS_DOT[status],
            )}
          />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
      </span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--muted)] px-2 py-0.5 text-xs",
        className,
      )}
      {...props}
    />
  );
}
