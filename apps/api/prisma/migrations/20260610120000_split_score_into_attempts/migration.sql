-- Split the single-run `scores` table into `scores` (the uploaded source) and
-- `attempts` (one row per transcription run, so re-processing keeps a history).
-- Existing scores are backfilled as one attempt each before the moved columns
-- are dropped, so no run state is lost.

-- CreateTable
CREATE TABLE "attempts" (
    "id" TEXT NOT NULL,
    "score_id" TEXT NOT NULL,
    "engine" TEXT,
    "options" JSONB,
    "status" "ScoreStatus" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "output_key" TEXT,
    "output_midi_key" TEXT,
    "error" TEXT,
    "job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempts_score_id_idx" ON "attempts"("score_id");

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_score_id_fkey" FOREIGN KEY ("score_id") REFERENCES "scores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: one attempt per existing score, carrying its current run state.
-- Historical runs were produced by homr.
INSERT INTO "attempts" (
    "id", "score_id", "engine", "options", "status", "progress",
    "output_key", "output_midi_key", "error", "job_id", "created_at", "updated_at"
)
SELECT
    gen_random_uuid()::text,
    "id",
    'homr',
    NULL,
    "status",
    "progress",
    "output_key",
    NULL,
    "error",
    "job_id",
    "created_at",
    "updated_at"
FROM "scores";

-- Drop the moved columns from scores (now owned by attempts).
ALTER TABLE "scores"
    DROP COLUMN "status",
    DROP COLUMN "progress",
    DROP COLUMN "output_key",
    DROP COLUMN "error",
    DROP COLUMN "job_id";
