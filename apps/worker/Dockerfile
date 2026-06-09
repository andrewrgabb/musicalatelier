# Worker image (Python + homr). Build context is the REPO ROOT; deploy with,
# from the repo root:
#   fly deploy --config apps/worker/fly.toml --dockerfile apps/worker/Dockerfile .
#
# homr is ONNX-based (no PyTorch). We bake its model weights into the image so
# the first job in production isn't slow or network-dependent. This image is
# large (~a couple of GB) and the VM needs ~2 GB RAM — sized in fly.toml.

FROM python:3.12-slim

# Native libs: opencv needs libGL/glib; onnxruntime needs libgomp. curl to fetch
# a warm-up sample for baking the weights.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     libgl1 libglib2.0-0 libgomp1 ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# uv (pinned). Use the image's own Python 3.12 rather than downloading another.
COPY --from=ghcr.io/astral-sh/uv:0.11.19 /uv /usr/local/bin/uv
ENV PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Install dependencies first for better layer caching.
COPY apps/worker/pyproject.toml apps/worker/uv.lock ./
RUN uv sync --frozen

# Pre-bake homr's model weights BEFORE copying app source, so this (slow,
# network) layer is cached across source changes. Run homr once on a sample so
# the weights download into this layer; the first real job is then fast and
# offline. Inference may be killed for RAM during build, but the weights are
# cached before that, so we tolerate a non-zero exit.
RUN curl -fsSL https://raw.githubusercontent.com/BreezeWhite/oemer/main/figures/tabi.jpg -o /tmp/sample.jpg \
  && (homr /tmp/sample.jpg || true) \
  && rm -f /tmp/sample.jpg /tmp/sample.musicxml

# Application source.
COPY apps/worker/ ./

# No public port — the worker only consumes the queue and talks to backing
# services over Fly's private network.
CMD ["python", "worker.py"]
