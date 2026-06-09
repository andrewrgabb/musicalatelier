/**
 * Upload a sheet-music image or PDF. The three-step flow mirrors the API:
 *   1. createScore  -> get a presigned upload URL
 *   2. uploadToStorage -> PUT the file directly to storage (not via our API)
 *   3. markUploaded -> enqueue the transcription job
 * Then we send the user to "My scores" to watch it process live.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createScore,
  markUploaded,
  uploadToStorage,
  type SourceType,
} from "../apis/scores";

function sourceTypeOf(file: File): SourceType {
  return file.type === "application/pdf" ? "pdf" : "image";
}

export function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { scoreId, uploadUrl } = await createScore({
        sourceType: sourceTypeOf(file),
        contentType: file.type || "application/octet-stream",
      });
      await uploadToStorage(uploadUrl, file);
      await markUploaded(scoreId);
      navigate("/scores");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Transcribe sheet music</h2>
      <p className="muted">
        Upload a photo or PDF of sheet music. We’ll convert it to MusicXML in the
        background and show you the result.
      </p>
      <form onSubmit={onSubmit}>
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
        <button type="submit" disabled={!file || busy}>
          {busy ? "Uploading…" : "Upload & transcribe"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
