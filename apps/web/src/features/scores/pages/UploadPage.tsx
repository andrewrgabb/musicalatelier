/**
 * Upload a sheet-music image or PDF. The three-step flow mirrors the API:
 *   1. createScore  -> get a presigned upload URL
 *   2. uploadToStorage -> PUT the file directly to storage (not via our API)
 *   3. markUploaded -> enqueue the transcription job
 * Then we send the user to "My scores" to watch it process live.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CloudUpload, FileMusic, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  createScore,
  markUploaded,
  uploadToStorage,
  type SourceType,
} from "@/features/scores/apis/scores";

function sourceTypeOf(file: File): SourceType {
  return file.type === "application/pdf" ? "pdf" : "image";
}

export function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    try {
      const { scoreId, uploadUrl } = await createScore({
        sourceType: sourceTypeOf(file),
        contentType: file.type || "application/octet-stream",
      });
      await uploadToStorage(uploadUrl, file);
      await markUploaded(scoreId);
      toast.success("Uploaded — transcription started");
      navigate("/scores");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle className="text-xl tracking-tight">
          Transcribe sheet music
        </CardTitle>
        <CardDescription>
          Upload a photo or PDF of sheet music. We’ll convert it to MusicXML in
          the background and show you the result.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-input bg-muted/30 px-6 py-12 text-center transition-colors hover:bg-muted/60">
            <CloudUpload className="size-8 text-muted-foreground" />
            {file ? (
              <span className="flex items-center gap-2 text-sm font-medium">
                <FileMusic className="size-4" />
                {file.name}
              </span>
            ) : (
              <>
                <span className="text-sm font-medium">
                  Click to choose a file
                </span>
                <span className="text-xs text-muted-foreground">
                  PNG, JPG, or PDF
                </span>
              </>
            )}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={busy}
            />
          </label>
          <Button type="submit" disabled={!file || busy} className="w-full">
            {busy ? (
              <>
                <LoaderCircle className="animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <CloudUpload />
                Upload &amp; transcribe
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
