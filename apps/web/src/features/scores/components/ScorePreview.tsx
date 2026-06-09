/**
 * Renders a MusicXML document as engraved sheet music, in the browser, using
 * OpenSheetMusicDisplay (OSMD). This closes the loop: the user sees their score
 * transcribed, right next to (or in place of) the original upload.
 *
 * It loads directly from the presigned storage URL — so the storage bucket must
 * allow CORS GETs from the app origin (MinIO allows this by default; for R2 you
 * configure CORS on the bucket).
 */
import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

export function ScorePreview({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let active = true;

    const osmd = new OpenSheetMusicDisplay(el, {
      autoResize: true,
      drawingParameters: "compact",
    });
    setError(null);
    osmd
      .load(url)
      .then(() => {
        if (active) osmd.render();
      })
      .catch((e) => active && setError(String(e?.message ?? e)));

    return () => {
      active = false;
      el.innerHTML = "";
    };
  }, [url]);

  if (error) {
    return <div className="muted">Couldn’t render preview: {error}</div>;
  }
  return <div className="preview" ref={containerRef} />;
}
