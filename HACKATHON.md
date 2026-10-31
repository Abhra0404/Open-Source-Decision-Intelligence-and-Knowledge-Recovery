# HACKATHON.md

## Team name

Dot

## Team members

-  Abhra Jaiswal
-  Ahmad Ibni Shafi
-  Shreyas Hemant Mohite

## Problem statement

Problem Statement 6: Open Source Decision Intelligence and Knowledge
Recovery

## Models we use and why

METIS currently supports and has tested this local open-weight model:

- **Model:** Qwen3 8B (`qwen3:8b` in Ollama)
- **Runtime:** Ollama's local OpenAI-compatible API at `http://localhost:11434`
- **Model digest tested:** `500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41`
- **License:** Apache 2.0, as published for the Qwen3 model family
- **Use:** Produce structured engineering-decision candidates from assembled GitHub discussion threads.

Qwen3 8B was selected because it is available locally and supports structured extraction through the permitted local model-server interface. Qwen3-14B was the preferred initial model but was not available in the tested runtime, so it is not claimed as an active model.

The provider was tested with a real local inference on 2026-11-01. The response parsed into the existing Pydantic extraction schema and reported 413 prompt tokens and 632 completion tokens. METIS independently validates evidence IDs, URLs, excerpts, roles, and semantic support before persistence; the model does not validate its own claims.

To run it locally:

```bash
ollama run qwen3:8b
MODEL_PROVIDER=open_weight MODEL_NAME=qwen3:8b MODEL_BASE_URL=http://localhost:11434 uvicorn backend.app.main:app --reload --port 8000
```

The deterministic `rule-based-mvp` provider remains available through `MODEL_PROVIDER=deterministic` for comparison. No closed model API, hosted proprietary inference API, or fine-tuning is used.

## Evaluation status

The reproducible evaluator is in `backend/evaluation/runner.py`. It exports
real ingested discussions for manual annotation and then compares the
deterministic and open-weight providers. The checked-in dataset is an
annotation template; benchmark metrics are intentionally not reported until
25 discussions have been manually labelled with exact evidence. This avoids
fabricating evaluation results.

Coding assistance was provided by GitHub Copilot. No model training or
fine-tuning was performed.

## Integration status

The demo workflow includes repository ingestion, evidence-validated decision
extraction, diagnostics, human review, repository-scoped Q&A with server-side
citation validation, and pending/reviewed decision relationships exposed through
timeline and graph APIs. The Q&A retrieval implementation is PostgreSQL
full-text plus exact-match fallback; semantic vector retrieval is not enabled.
Benchmark evaluation remains blocked until the 25 exported discussions are
manually labelled with exact expected outcomes and evidence.
