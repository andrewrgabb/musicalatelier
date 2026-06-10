/**
 * "My scores" — lists the user's uploads with LIVE status. We poll the API
 * every 2s; while anything is still queued/processing the progress bars update
 * in place. (A production app might use SSE/WebSocket; polling keeps the
 * template simple and is plenty for the demo.)
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FileMusic, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listScores, type Score } from "@/features/scores/apis/scores";
import { ScoreCard } from "@/features/scores/components/ScoreCard";

const POLL_MS = 2000;

export function MyScoresPage() {
  const [scores, setScores] = useState<Score[]>([]);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    async function tick() {
      try {
        const { scores } = await listScores();
        if (active) {
          setScores(scores);
          setLoaded(true);
        }
      } catch {
        /* transient; keep polling */
      }
    }

    tick();
    timer.current = window.setInterval(tick, POLL_MS);
    return () => {
      active = false;
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My scores</h1>
          <p className="text-sm text-muted-foreground">
            Your uploads and their transcription status.
          </p>
        </div>
        <Button asChild size="sm">
          <Link to="/">
            <Plus />
            New upload
          </Link>
        </Button>
      </div>

      {!loaded && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}

      {loaded && scores.length === 0 && (
        <Card className="items-center gap-3 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <FileMusic className="size-6" />
          </div>
          <p className="text-sm font-medium">No uploads yet</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/">Upload your first score</Link>
          </Button>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {scores.map((s) => (
          <ScoreCard
            key={s.id}
            score={s}
            onDeleted={(id) => setScores((prev) => prev.filter((x) => x.id !== id))}
          />
        ))}
      </div>
    </section>
  );
}
