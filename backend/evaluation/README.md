# METIS Evaluation Dataset

`dataset.jsonl` is intentionally annotation-first. Each line must be a real
ingested discussion that a human has reviewed. Do not generate labels from the
deterministic provider or from an LLM.

The target split is 25 examples: five accepted, five rejected, five proposed,
five unresolved, and five no-decision discussions. Every example must preserve
the original discussion URL and include exact supporting excerpts. The runner
rejects missing labels and does not fabricate results.

To prepare candidates from the local database without assigning labels:

```bash
python -m backend.evaluation.runner export-candidates --output backend/evaluation/dataset.jsonl
```

Manually complete `expected_outcome` and `evidence` for each exported record,
then run:

```bash
MODEL_PROVIDER=open_weight MODEL_NAME=qwen3:8b MODEL_BASE_URL=http://localhost:11434 \
python -m backend.evaluation.runner evaluate \
  --dataset backend/evaluation/dataset.jsonl \
  --output backend/evaluation/results.json
```

`results.json` is generated output and is not included until a fixed, manually
reviewed dataset has been completed.