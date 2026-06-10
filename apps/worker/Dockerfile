# Worker image (Python + Audiveris). Build context is the REPO ROOT;
# deploy from the repo root:
#   fly deploy --config apps/worker/fly.toml --dockerfile apps/worker/Dockerfile .
#
# The OMR engine is Audiveris: a Java app driven via its batch CLI, built from
# source in a separate stage and dropped into the Python runtime alongside a JRE
# and Tesseract. The Python worker also converts the MusicXML output to MIDI.
#
# The JDK build stage + JRE + Tesseract make this image large and the build slow;
# the VM needs real RAM — sized in fly.toml.

# ---------------------------------------------------------------------------
# Stage 1 — build the Audiveris distribution from source.
# Audiveris 5.9.x targets Java 25; pin a release tag so the build is reproducible
# (5.9.0 matches the constant keys mapped in transcribe/audiveris_engine.py).
# `installDist` produces an unpacked, runnable distribution (skips tests/packaging).
# ---------------------------------------------------------------------------
FROM eclipse-temurin:25-jdk AS audiveris-build

ARG AUDIVERIS_VERSION=5.9.0

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
# Stage 2 — the worker runtime: Python + a JRE + Tesseract + Audiveris.
# ---------------------------------------------------------------------------
FROM python:3.12-slim

# Native libs:
#   Audiveris -> fontconfig + freetype (rendering/PDF)
#   tesseract -> the OCR engine + English language data (eng.traineddata)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     fontconfig libfreetype6 \
     tesseract-ocr tesseract-ocr-eng \
     ca-certificates \
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

# Application source.
COPY apps/worker/ ./

# No public port — the worker only consumes the queue and talks to backing
# services over Fly's private network.
CMD ["python", "worker.py"]
