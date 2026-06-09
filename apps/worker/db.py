"""Postgres access for the worker — mirrors job status into the `scores` row.

This is "option (a)" from the plan: the worker writes status directly to the
Prisma-managed tables. Prisma (Node) still OWNS the schema + migrations; the
worker only UPDATEs existing rows, never changes structure.

We use the DIRECT (non-pooled) connection — the worker is long-lived and writes
infrequently, so it doesn't need the API's request pooler, and a direct
connection avoids pgbouncer-specific query params asyncpg doesn't understand.
"""

import os

import asyncpg

# Prefer the direct URL; fall back to DATABASE_URL (locally they're identical).
_DSN = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL", "")

_pool: asyncpg.Pool | None = None


async def _get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(dsn=_DSN, min_size=1, max_size=4)
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


# status is a Postgres enum named "ScoreStatus" (quoted, case-sensitive), so we
# cast the text value to it explicitly.
async def set_processing(score_id: str) -> None:
    pool = await _get_pool()
    await pool.execute(
        'UPDATE scores SET status = $1::"ScoreStatus", progress = 0, '
        "updated_at = now() WHERE id = $2",
        "processing",
        score_id,
    )


async def set_progress(score_id: str, progress: int) -> None:
    pool = await _get_pool()
    await pool.execute(
        "UPDATE scores SET progress = $1, updated_at = now() WHERE id = $2",
        progress,
        score_id,
    )


async def set_completed(score_id: str, output_key: str) -> None:
    pool = await _get_pool()
    await pool.execute(
        'UPDATE scores SET status = $1::"ScoreStatus", progress = 100, '
        "output_key = $2, error = NULL, updated_at = now() WHERE id = $3",
        "completed",
        output_key,
        score_id,
    )


async def set_failed(score_id: str, error: str) -> None:
    pool = await _get_pool()
    await pool.execute(
        'UPDATE scores SET status = $1::"ScoreStatus", error = $2, '
        "updated_at = now() WHERE id = $3",
        "failed",
        error[:1000],  # keep the message bounded
        score_id,
    )
