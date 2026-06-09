/** A small status badge + progress bar for a score's lifecycle. */
import type { ScoreStatus } from "@musical-atelier/contracts";

const LABEL: Record<ScoreStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

export function ScoreStatusView({
  status,
  progress,
}: {
  status: ScoreStatus;
  progress: number;
}) {
  return (
    <div className="status">
      <span className={`badge badge-${status}`}>{LABEL[status]}</span>
      {(status === "processing" || status === "queued") && (
        <div className="progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
          <span className="progress-pct">{progress}%</span>
        </div>
      )}
    </div>
  );
}
