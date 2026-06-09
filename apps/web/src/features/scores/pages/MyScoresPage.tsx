/**
 * "My scores" — lists the user's uploads with LIVE status. We poll the API
 * every 2s; while anything is still queued/processing the progress bars update
 * in place. (A production app might use SSE/WebSocket; polling keeps the
 * template simple and is plenty for the demo.)
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { listScores, type Score } from "../apis/scores";
import { ScoreCard } from "../components/ScoreCard";

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
    <section>
      <div className="page-head">
        <h2>My scores</h2>
        <Link to="/" className="button-link">
          + New upload
        </Link>
      </div>

      {!loaded && <p className="muted">Loading…</p>}
      {loaded && scores.length === 0 && (
        <p className="muted">
          No uploads yet. <Link to="/">Upload your first score.</Link>
        </p>
      )}

      <ul className="score-list">
        {scores.map((s) => (
          <ScoreCard key={s.id} score={s} />
        ))}
      </ul>
    </section>
  );
}
