/** One score in the "My scores" list: its source + a history of transcription
 *  attempts. Each completed attempt can be downloaded (MusicXML + MIDI) and
 *  previewed; a "Re-process" action starts a new attempt with chosen options. */
import { lazy, Suspense, useState } from "react";
import {
  Download,
  Eye,
  EyeOff,
  FileMusic,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Music4,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScoreStatusView } from "./ScoreStatusView";
import {
  TranscriptionOptionsForm,
  defaultOptions,
} from "./TranscriptionOptionsForm";
import {
  deleteScore,
  getScore,
  reprocessScore,
  type Attempt,
  type OmrEngine,
  type Score,
  type TranscriptionOptions,
} from "@/features/scores/apis/scores";

// The MusicXML renderer (OpenSheetMusicDisplay) is large and only needed when
// the user opens a preview, so we code-split it into its own lazy chunk.
const ScorePreview = lazy(() =>
  import("./ScorePreview").then((m) => ({ default: m.ScorePreview }))
);

/** A short human summary of an attempt's options for the history list. */
function summarizeOptions(o: TranscriptionOptions | null): string {
  if (!o) return "Default options";
  const parts: string[] = [];
  if (o.inputQuality) parts.push(o.inputQuality[0].toUpperCase() + o.inputQuality.slice(1));
  if (o.binarization === "global")
    parts.push(`Global${o.binarizationThreshold != null ? ` ${o.binarizationThreshold}` : ""}`);
  else if (o.binarization === "adaptive") parts.push("Adaptive");
  if (o.ocrLanguage) parts.push(o.ocrLanguage);
  const on = o.switches ? Object.entries(o.switches).filter(([, v]) => v).length : 0;
  if (on) parts.push(`${on} switch${on > 1 ? "es" : ""}`);
  return parts.length ? parts.join(" · ") : "Default options";
}

export function ScoreCard({
  score,
  onDeleted,
}: {
  score: Score;
  onDeleted?: (id: string) => void;
}) {
  const Icon = score.sourceType === "pdf" ? FileText : FileMusic;
  const created = new Date(score.createdAt).toLocaleString();

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAttemptId, setPreviewAttemptId] = useState<string | null>(null);

  const [reprocessOpen, setReprocessOpen] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [engine, setEngine] = useState<OmrEngine>("audiveris");
  const [options, setOptions] = useState<TranscriptionOptions>(defaultOptions);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Presigned URLs are only on the detail endpoint, so fetch it on demand.
  async function urlFor(attemptId: string, kind: "music" | "midi"): Promise<string | null> {
    const detail = await getScore(score.id);
    const a = detail.attempts.find((x) => x.id === attemptId);
    return kind === "music" ? a?.downloadUrl ?? null : a?.midiUrl ?? null;
  }

  async function onDownload(attemptId: string) {
    const url = await urlFor(attemptId, "music");
    if (url) window.open(url, "_blank");
  }

  async function onDownloadMidi(attemptId: string) {
    const url = await urlFor(attemptId, "midi");
    if (url) window.open(url, "_blank");
  }

  async function onTogglePreview(attemptId: string) {
    if (previewAttemptId === attemptId) {
      setPreviewAttemptId(null);
      setPreviewUrl(null);
      return;
    }
    const url = await urlFor(attemptId, "music");
    setPreviewUrl(url);
    setPreviewAttemptId(url ? attemptId : null);
  }

  async function onViewOriginal() {
    const detail = await getScore(score.id);
    if (detail.sourceUrl) window.open(detail.sourceUrl, "_blank");
  }

  async function onReprocess() {
    setReprocessing(true);
    try {
      await reprocessScore(score.id, engine, options);
      toast.success("Re-processing started");
      setReprocessOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-process failed");
    } finally {
      setReprocessing(false);
    }
  }

  async function onDelete() {
    setDeleting(true);
    try {
      await deleteScore(score.id);
      toast.success("Deleted");
      setDeleteOpen(false);
      onDeleted?.(score.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
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
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onViewOriginal}>
              <ImageIcon />
              View original
            </Button>
            <Button variant="outline" size="sm" onClick={() => setReprocessOpen(true)}>
              <RefreshCw />
              Re-process
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 />
              Delete
            </Button>
          </div>
        </div>

        <div className="flex flex-col divide-y rounded-lg border">
          {score.attempts.map((attempt, i) => (
            <AttemptRow
              key={attempt.id}
              attempt={attempt}
              label={`Run ${score.attempts.length - i}`}
              previewing={previewAttemptId === attempt.id}
              previewUrl={previewAttemptId === attempt.id ? previewUrl : null}
              onDownload={() => onDownload(attempt.id)}
              onDownloadMidi={() => onDownloadMidi(attempt.id)}
              onTogglePreview={() => onTogglePreview(attempt.id)}
            />
          ))}
        </div>
      </CardContent>

      <Dialog open={reprocessOpen} onOpenChange={setReprocessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-process with new options</DialogTitle>
            <DialogDescription>
              Run the transcription again on the same file. This adds a new run —
              your existing results are kept.
            </DialogDescription>
          </DialogHeader>
          <TranscriptionOptionsForm
            engine={engine}
            onEngineChange={setEngine}
            value={options}
            onChange={setOptions}
            disabled={reprocessing}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setReprocessOpen(false)}
              disabled={reprocessing}
            >
              Cancel
            </Button>
            <Button onClick={onReprocess} disabled={reprocessing}>
              {reprocessing ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Starting…
                </>
              ) : (
                <>
                  <RefreshCw />
                  Re-process
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this score?</DialogTitle>
            <DialogDescription>
              This permanently removes the uploaded file and every transcription
              run (MusicXML + MIDI). This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <LoaderCircle className="animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 />
                  Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AttemptRow({
  attempt,
  label,
  previewing,
  previewUrl,
  onDownload,
  onDownloadMidi,
  onTogglePreview,
}: {
  attempt: Attempt;
  label: string;
  previewing: boolean;
  previewUrl: string | null;
  onDownload: () => void;
  onDownloadMidi: () => void;
  onTogglePreview: () => void;
}) {
  const done = attempt.status === "completed";
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            {label}
            {attempt.engine && (
              <span className="text-xs font-normal text-muted-foreground">
                {attempt.engine}
              </span>
            )}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {summarizeOptions(attempt.options)}
          </div>
        </div>
        <ScoreStatusView status={attempt.status} progress={attempt.progress} />
      </div>

      {attempt.status === "failed" && attempt.error && (
        <p className="text-sm text-destructive">{attempt.error}</p>
      )}

      {done && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download />
            MusicXML
          </Button>
          {attempt.outputMidiKey && (
            <Button variant="outline" size="sm" onClick={onDownloadMidi}>
              <Music4 />
              MIDI
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onTogglePreview}>
            {previewing ? (
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

      {previewing && previewUrl && (
        <Suspense
          fallback={
            <div className="text-sm text-muted-foreground">Loading preview…</div>
          }
        >
          <ScorePreview url={previewUrl} />
        </Suspense>
      )}
    </div>
  );
}
