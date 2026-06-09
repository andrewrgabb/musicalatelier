/** One score in the "My scores" list: status, and (when done) download + preview. */
import { lazy, Suspense, useState } from "react";
import { getScore, type Score } from "../apis/scores";
import { ScoreStatusView } from "./ScoreStatusView";

// The MusicXML renderer (OpenSheetMusicDisplay) is large and only needed when
// the user opens a preview, so we code-split it into its own lazy chunk.
const ScorePreview = lazy(() =>
  import("./ScorePreview").then((m) => ({ default: m.ScorePreview }))
);

export function ScoreCard({ score }: { score: Score }) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const created = new Date(score.createdAt).toLocaleString();

  // Lazily fetch the presigned download URL (only the detail endpoint returns it).
  async function ensureDownloadUrl(): Promise<string | null> {
    if (downloadUrl) return downloadUrl;
    const detail = await getScore(score.id);
    setDownloadUrl(detail.downloadUrl);
    return detail.downloadUrl;
  }

  async function onTogglePreview() {
    if (!showPreview) await ensureDownloadUrl();
    setShowPreview((v) => !v);
  }

  async function onDownload() {
    const url = await ensureDownloadUrl();
    if (url) window.open(url, "_blank");
  }

  return (
    <li className="card score-card">
      <div className="score-head">
        <div>
          <strong>{score.sourceType === "pdf" ? "PDF" : "Image"}</strong>
          <span className="muted"> · {created}</span>
        </div>
        <ScoreStatusView status={score.status} progress={score.progress} />
      </div>

      {score.status === "failed" && score.error && (
        <p className="error">{score.error}</p>
      )}

      {score.status === "completed" && (
        <div className="score-actions">
          <button onClick={onDownload}>Download MusicXML</button>
          <button onClick={onTogglePreview}>
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
        </div>
      )}

      {showPreview && downloadUrl && (
        <Suspense fallback={<div className="muted">Loading preview…</div>}>
          <ScorePreview url={downloadUrl} />
        </Suspense>
      )}
    </li>
  );
}
