# Torvaix Intelligence Layer (NLP) — spaCy + sentence-transformers behind FastAPI
FROM python:3.11-slim

WORKDIR /app

# curl is used by the container healthcheck
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch first so the requirements install below does NOT pull the
# multi-GB CUDA build. This keeps the image ~800MB instead of ~2.5GB.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the models into the image so the first request is instant and works offline.
RUN python -m spacy download en_core_web_sm \
  && python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY app ./app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=5 --start-period=40s \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
