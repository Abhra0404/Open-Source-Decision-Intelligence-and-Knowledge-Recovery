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

The deterministic `rule-based-mvp` provider remains available through `MODEL_PROVIDER=deterministic` for comparison. No model training or fine-tuning was performed.

METIS also has an optional Groq-hosted provider configured as `qwen/qwen3.8-27b`. A completed extraction run (`646fcae2-bfeb-46fb-9d4d-baf269b4fb60`) recorded two model calls, model revision `fp_424cb89518`, 1,590 prompt tokens, and 1,095 completion tokens. This verifies that the provider was invoked; it does not establish hackathon eligibility. Organizer permission for Groq-hosted inference and the exact model license must be confirmed before relying on this provider for judging. Use the local Ollama Qwen3 8B provider when hosted inference is not approved.

The Groq credential is read from the server-side `GROQ_API_KEY` environment variable and is not included in the repository or returned by the frontend.
