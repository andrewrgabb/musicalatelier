/** Status badge (+ live progress bar while in flight) for a score's lifecycle. */
import type { ScoreStatus } from "@musical-atelier/contracts";
import { CircleCheck, CircleX, Clock, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

const META: Record<
  ScoreStatus,
  { label: string; variant: BadgeVariant; icon: typeof Clock }
> = {
  queued: { label: "Queued", variant: "muted", icon: Clock },
  processing: { label: "Processing", variant: "secondary", icon: LoaderCircle },
  completed: { label: "Completed", variant: "success", icon: CircleCheck },
  failed: { label: "Failed", variant: "destructive", icon: CircleX },
};

export function ScoreStatusView({
  status,
  progress,
}: {
  status: ScoreStatus;
  progress: number;
}) {
  const meta = META[status];
  const Icon = meta.icon;
  const inFlight = status === "processing" || status === "queued";

  return (
    <div className="flex items-center gap-3">
      {inFlight && (
        <div className="hidden items-center gap-2 sm:flex">
          <Progress value={progress} className="w-28" />
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
            {progress}%
          </span>
        </div>
      )}
      <Badge variant={meta.variant}>
        <Icon className={cn("size-3", status === "processing" && "animate-spin")} />
        {meta.label}
      </Badge>
    </div>
  );
}
