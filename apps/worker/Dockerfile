# Worker image (Python + homr + Audiveris). Build context is the REPO ROOT;
# deploy from the repo root:
#   fly deploy --config apps/worker/fly.toml --dockerfile apps/worker/Dockerfile .
#
# Two OMR engines ship in this image; OMR_ENGINE picks one at runtime:
#   - homr: ONNX-based (no PyTorch), a Python lib invoked via its CLI. Its model
#     weights are pre-baked below so the first job isn't slow/network-dependent.
#   - Audiveris: a Java app driven via its batch CLI. Built from source in a
#     separate stage, then dropped in alongside a JRE + Tesseract.
#
# Carrying both engines makes this image large (a few GB) and the build slow
# (a JDK build stage + ONNX weights). The VM needs real RAM — sized in fly.toml.

# ---------------------------------------------------------------------------
# Stage 1 — build the Audiveris distribution from source.
# Audiveris 5.10.x targets Java 25; pin a release tag so the build is reproducible.
# `installDist` produces an unpacked, runnable distribution (skips tests/packaging).
# ---------------------------------------------------------------------------
FROM eclipse-temurin:25-jdk AS audiveris-build

ARG AUDIVERIS_VERSION=5.10.2

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 --branch "${AUDIVERIS_VERSION}" \
      https://github.com/Audiveris/audiveris.git .

# Build the unpacked distribution, then move it to a fixed, version-independent
# path so the final stage can COPY it without knowing the version in the name.
RUN ./gradlew --no-daemon installDist \
  && mv app/build/install/* /audiveris

# ---------------------------------------------------------------------------
# Stage 2 — the worker runtime: Python (homr) + a JRE + Tesseract + Audiveris.
# ---------------------------------------------------------------------------
FROM python:3.12-slim

# Native libs:
#   homr/opencv -> libGL + glib;  onnxruntime -> libgomp
#   Audiveris   -> fontconfig + freetype (rendering/PDF)
#   tesseract   -> the OCR engine + English language data (eng.traineddata)
#   curl/ca-certs -> fetch a warm-up sample for baking homr's weights
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     libgl1 libglib2.0-0 libgomp1 \
     fontconfig libfreetype6 \
     tesseract-ocr tesseract-ocr-eng \
     ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

# A JRE for Audiveris (copied from the Temurin image — matches the build JDK).
COPY --from=eclipse-temurin:25-jre /opt/java/openjdk /opt/java/openjdk
ENV JAVA_HOME=/opt/java/openjdk

# The built Audiveris distribution. Launcher lives at /opt/audiveris/bin/Audiveris.
COPY --from=audiveris-build /audiveris /opt/audiveris

# uv (pinned). Use the image's own Python 3.12 rather than downloading another.
COPY --from=ghcr.io/astral-sh/uv:0.11.19 /uv /usr/local/bin/uv
ENV PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:/opt/java/openjdk/bin:$PATH" \
    # Audiveris engine config (see transcribe/audiveris_engine.py).
    AUDIVERIS_CMD="/opt/audiveris/bin/Audiveris" \
    TESSDATA_PREFIX="/usr/share/tesseract-ocr/5/tessdata" \
    JAVA_TOOL_OPTIONS="-Djava.awt.headless=true"

WORKDIR /app

# Install Python dependencies first for better layer caching.
COPY apps/worker/pyproject.toml apps/worker/uv.lock ./
RUN uv sync --frozen

# Fail the build early if the Audiveris launcher is broken (wrong JRE, etc.).
RUN /opt/audiveris/bin/Audiveris -help || (echo "Audiveris launcher smoke test failed" && exit 1)

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
