/** One score in the "My scores" list: status, and (when done) download + preview. */
import { lazy, Suspense, useState } from "react";
import { Download, Eye, EyeOff, FileMusic, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreStatusView } from "./ScoreStatusView";
import { getScore, type Score } from "@/features/scores/apis/scores";

// The MusicXML renderer (OpenSheetMusicDisplay) is large and only needed when
// the user opens a preview, so we code-split it into its own lazy chunk.
const ScorePreview = lazy(() =>
  import("./ScorePreview").then((m) => ({ default: m.ScorePreview }))
);

export function ScoreCard({ score }: { score: Score }) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const created = new Date(score.createdAt).toLocaleString();
  const Icon = score.sourceType === "pdf" ? FileText : FileMusic;

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
    <Card className="gap-4 py-4">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </div>
            <div>
              <div className="text-sm font-medium">
                {score.sourceType === "pdf" ? "PDF" : "Image"}
              </div>
              <div className="text-xs text-muted-foreground">{created}</div>
            </div>
          </div>
          <ScoreStatusView status={score.status} progress={score.progress} />
        </div>

        {score.status === "failed" && score.error && (
          <p className="text-sm text-destructive">{score.error}</p>
        )}

        {score.status === "completed" && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onDownload}>
              <Download />
              Download
            </Button>
            <Button variant="ghost" size="sm" onClick={onTogglePreview}>
              {showPreview ? (
                <>
                  <EyeOff />
                  Hide preview
                </>
              ) : (
                <>
                  <Eye />
                  Show preview
                </>
              )}
            </Button>
          </div>
        )}

        {showPreview && downloadUrl && (
          <Suspense
            fallback={
              <div className="text-sm text-muted-foreground">
                Loading preview…
              </div>
            }
          >
            <ScorePreview url={downloadUrl} />
          </Suspense>
        )}
      </CardContent>
    </Card>
  );
}
