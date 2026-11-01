# METIS Q&A Evaluation - All Registered Repositories

Evaluation date: 2026-11-01

## Summary

METIS currently has five registered repositories, 228 ingested discussion
records, 18 persisted decisions, and 23 structurally valid decision-evidence
records. A structurally valid record has a nonempty excerpt and source URL, and
its decision and source discussion belong to the same repository. This check
does not prove that the excerpt actually supports the decision; the review
warnings and linkage problems below matter.

Eighteen evidence-derived questions were submitted through the live chat API,
using a new conversation scoped to each question's repository. Eight returned
useful answers with relevant, repository-owned citations. Two returned answers
but have semantic citation contamination and are not clean successes. Two
retrieved evidence but the model returned its insufficient-evidence response.
Six FastAPI requests reached Groq but failed with `rate_limit_exceeded`.

Five additional unsupported questions, one per repository, were tested through
the same API. All returned the insufficient-evidence response without invoking
Groq. Two had `no_matching_decisions`; three had candidates but no decisions
survived the relevance filter.

No application code, retrieval thresholds, repository isolation, evidence
validation rules, decisions, or evidence records were changed for this
evaluation. The 18 candidate-question conversations remain persisted. At final
verification, only the HTTPX and Click unsupported-question conversations were
still available; `GET .../messages` returned 404 for the Backstage, FastAPI,
and Dify conversation IDs. The live answers for those three probes were
captured when the requests ran, but their transcripts could not be replayed.
This is a persistence anomaly; its cause was not established.

## Database coverage

Counts are from the live PostgreSQL database. Discussion type counts are
disjoint; `comments` means `issue_comment`, and `reviews` means `review`.

| Repository | Repository ID | Discussions | Issues | Pull requests | Comments | Reviews | Decisions | Structurally valid evidence |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `backstage/backstage` | `16c18238-5b49-4eb7-afde-af7d66dd6b8b` | 38 | 0 | 11 | 16 | 11 | 0 | 0 |
| `encode/httpx` | `3cabfd2b-eb57-4019-8023-75c31d246be2` | 36 | 2 | 8 | 14 | 12 | 6 | 8 |
| `fastapi/fastapi` | `309fb937-ae54-4eb2-85c6-c49f3c2bf1b0` | 114 | 0 | 10 | 29 | 75 | 7 | 7 |
| `langgenius/dify` | `5e956df9-5894-4273-bf81-13a2401a87d6` | 34 | 4 | 12 | 13 | 5 | 3 | 3 |
| `pallets/click` | `4bb8be0d-403e-4f29-9fc8-56290b966436` | 6 | 0 | 2 | 3 | 1 | 2 | 5 |
| **Total** | **5 repositories** | **228** | **6** | **43** | **75** | **104** | **18** | **23** |

### Decision and review status

| Repository | Decision status | Review status | Count |
|---|---|---|---:|
| `backstage/backstage` | No decisions | No decisions | 0 |
| `encode/httpx` | `unresolved` | `needs_review` | 6 |
| `fastapi/fastapi` | `proposed` | `valid` | 6 |
| `fastapi/fastapi` | `unresolved` | `needs_review` | 1 |
| `langgenius/dify` | `rejected` | `needs_review` | 2 |
| `langgenius/dify` | `unresolved` | `needs_review` | 1 |
| `pallets/click` | `unresolved` | `needs_review` | 2 |

`needs_review` and unresolved decisions are included, but are described as
proposals or uncertain records rather than accepted outcomes. In particular,
all six HTTPX decisions and both Click decisions are unresolved and need
review. Their API answers are useful as discussion summaries, not evidence of
approved project policy.

## Live Q&A evaluation

Each row below is one persisted conversation submitted to
`POST /api/v1/chat/conversations/{conversation_id}/messages`. `Candidates ->
filtered -> evidence` reports `candidate_decisions_retrieved`,
`decisions_remaining_after_filtering`, and
`evidence_records_passing_validation`, respectively. Citation counts and
diagnostics are from the persisted API results.

### `encode/httpx`

| Conversation | Question | Candidates -> filtered -> evidence | API result |
|---|---|---:|---|
| `84d94b54-7dff-4038-a99b-fe74f3d5583c` | What option is proposed to keep the original HTTP method after a 301 or 302 redirect? | 4 -> 2 -> 4 | Answer returned; 1 citation. Described the proposed option to preserve the method instead of switching to GET. `unresolved` / `needs_review`. |
| `2e63fe06-a953-4712-a5e2-5a65147f80b7` | Why is the cryptography dependency proposed to move from 45.0.7 to 46.0.6? | 4 -> 1 -> 1 | Answer returned; 1 citation. Connected the proposed bump with security vulnerabilities. `unresolved` / `needs_review`. |
| `b4b37bc8-0b3d-4a20-b607-367521984fc8` | How is test server startup failure handled to prevent the test suite from hanging? | 5 -> 1 -> 1 | Groq invoked, but returned insufficient evidence; 0 citations; fallback `llm_reported_insufficient_evidence`. The evidence concerns propagating server-thread errors, but the live answer did not establish the requested handling. |
| `68366454-3421-44a6-8a8d-fcc8635152fa` | What change removes GNU grep warnings from the sync-version script? | 6 -> 1 -> 1 | Answer returned; 1 citation. It says to remove the PCRE-specific `?:` syntax from grep expressions. `unresolved` / `needs_review`. |
| `43185bd9-fbd6-46d3-99a1-8c6f939a8c91` | Why replace the context manager in `map_httpcore_exceptions` with try/except? | 1 -> 1 -> 1 | Answer returned; 1 citation. The rationale is lower overhead in hot paths. `unresolved` / `needs_review`. |
| `ed115101-ae74-44b5-a975-017406e1d5ba` | What is the proposed compatibility approach for the HTTPX 1.0 release? | 5 -> 5 -> 5 | Answer returned; 1 citation. It says no breaking changes are planned, with supported Python versions and security-related defaults under consideration. `unresolved` / `needs_review`. |

### `fastapi/fastapi`

| Conversation | Question | Candidates -> filtered -> evidence | API result |
|---|---|---:|---|
| `1ee51c72-8097-4994-9f3b-11dedd229a66` | What is proposed to make FastAPI documentation accessible to Swahili readers? | 6 -> 6 -> 6 | Groq invoked; provider error `rate_limit_exceeded`; no answer or citations persisted. |
| `5f3bfc3b-9722-4f62-bfe1-e22f01ac521b` | What change is proposed for Swahili translations in FastAPI documentation? | 6 -> 6 -> 6 | Groq invoked; provider error `rate_limit_exceeded`; no answer or citations persisted. |
| `2e6853b0-b85a-4d8e-ab4e-8a16f0741e12` | What did the Swahili translation contributor propose for FastAPI docs? | 7 -> 6 -> 6 | Groq invoked; provider error `rate_limit_exceeded`; no answer or citations persisted. |
| `10ce197c-5f2d-4011-a299-f195af712eac` | What does this historical discussion say about the FastAPI documentation preview? | 7 -> 7 -> 7 | Groq invoked; provider error `rate_limit_exceeded`; no answer or citations persisted. |
| `b45c0df1-2a98-476e-b77f-bbfc2fff0135` | Why remove the redundant `isinstance(field_info, FieldInfo)` check in `analyze_param`? | 6 -> 2 -> 2 | Answer returned; 2 citations. The explanation says the check became redundant after mixed Pydantic v1/v2 support was no longer needed. One citation is attached to the Swahili decision, so this is a partial, contaminated answer rather than a clean success. |
| `a9f61951-11c5-428d-8d61-3b15eb4b9b9d` | What change is proposed for FastAPI's `.venv` gitignore entry? | 6 -> 6 -> 6 | Groq invoked; provider error `rate_limit_exceeded`; no answer or citations persisted. |
| `db7a122b-cc7d-40f8-872c-747d81b294da` | Which sponsor is proposed for addition to FastAPI? | 6 -> 6 -> 6 | Groq invoked; provider error `rate_limit_exceeded`; no answer or citations persisted. |

The Swahili proposal is present in the database, but the three API calls could
not be evaluated for answer quality because Groq was rate-limited. The
FieldInfo answer did return, but its extra Swahili citation makes it unsuitable
as a clean demo.

### `langgenius/dify`

| Conversation | Question | Candidates -> filtered -> evidence | API result |
|---|---|---:|---|
| `b765d03a-7877-43c5-bc83-9d0f8fa0c45b` | What does the billing API proposal say about typing error reasons per proto service? | 3 -> 3 -> 3 | Answer returned; 1 citation. It describes per-service `ErrorReason` schemas and typed generation. The cited billing record is `unresolved` / `needs_review`. |
| `7deed3a4-b789-4ef2-8dc6-1b63fc378ddb` | What was the status of the billing error-reasons-per-proto-service decision? | 3 -> 3 -> 3 | Answer returned; 3 citations. It reports conflicting `unresolved` and `rejected` records. One citation is a ReAct decision linked to the billing PR, so this is partial and contaminated. |
| `2cafa9b9-2100-4c7e-8bd0-73190dccba50` | How does the decision propose handling malformed ReAct action payloads? | 1 -> 1 -> 1 | Groq invoked, then returned insufficient evidence; 0 citations; fallback `llm_reported_insufficient_evidence`. The only linked evidence is actually the billing PR, not ReAct evidence. |

### `pallets/click`

| Conversation | Question | Candidates -> filtered -> evidence | API result |
|---|---|---:|---|
| `6ba75db7-2040-4976-91f9-d38b852de994` | What behavior should the documentation explain when Ctrl+C is pressed while `less` is in follow mode? | 2 -> 1 -> 4 | Answer returned; 2 citations. It says Ctrl+C propagates to Click and quits the command, and that Ctrl+X then `q` quits `less` in follow mode. `unresolved` / `needs_review`. |
| `05f3eb28-67e2-4570-b869-f9dad9f301df` | Why stop passing a deprecated command's help text through gettext? | 2 -> 1 -> 1 | Answer returned; 1 citation. It describes aligning translation of the `(DEPRECATED)` label with options and arguments. `unresolved` / `needs_review`. |

## Verified answer citations

These eight responses had useful answers and citations whose source discussion
matches the question. The decision status remains as shown; the citation does
not make a proposed or unresolved decision approved.

| Repository | Decision ID | Evidence ID(s) returned by API | Source discussion |
|---|---|---|---|
| `encode/httpx` | `636baf23-11bb-436c-aac0-888a6303af98` | `e57b53bf-a0bb-4f73-af89-4a8ea94360f1` | [PR #3783](https://github.com/encode/httpx/pull/3783) |
| `encode/httpx` | `4a5563f4-405b-4170-9de0-24fde3e3c470` | `8afd64d9-bc89-42c8-998e-cad6cf3c32cd` | [PR #3785](https://github.com/encode/httpx/pull/3785) |
| `encode/httpx` | `b64caf98-c468-449f-9eff-b0fe4e2a5381` | `0ef8c7ce-b1a0-4483-bb85-7dfb89615017` | [PR #3776](https://github.com/encode/httpx/pull/3776) |
| `encode/httpx` | `ead80479-ff5f-43a3-bc42-beff8d458189` | `97a7eedf-75ab-4e40-8316-58f415e5242e` | [PR #3778](https://github.com/encode/httpx/pull/3778) |
| `encode/httpx` | `c99701a8-f470-4215-b3b0-9a788387b518` | `dca30d2c-ccbb-419b-8106-df46bfdca6e2` | [PR #3796](https://github.com/encode/httpx/pull/3796) |
| `langgenius/dify` | `dbbeef8d-4998-4702-85b0-89d53c29be8e` | `42f24515-3566-4f63-9d44-a81c25bdf68f` | [PR #45203](https://github.com/langgenius/dify/pull/45203) |
| `pallets/click` | `00869a62-1710-403f-8641-3e34655a448a` | `4e0c6a7a-d859-4243-80ab-d1887e3d44b8` | [PR #3901](https://github.com/pallets/click/pull/3901) |
| `pallets/click` | `e761b80b-faa2-4595-8376-b47ec3192040` | `e3490b1e-d71c-493e-87a4-d83407ad297d`, `9904cefb-c573-455a-b2f5-eef7623d52c2` | [PR #3900](https://github.com/pallets/click/pull/3900), [review comment](https://github.com/pallets/click/pull/3900#issuecomment-6498926214) |

## Unsupported-question tests

One unsupported question was sent to each repository through the same endpoint.
Every response was: "I couldn't find sufficient evidence in this repository to
answer that question." All returned zero citations and did not invoke Groq.

| Repository | Conversation | Unsupported question | Candidates -> filtered -> evidence | Fallback |
|---|---|---|---:|---|
| `backstage/backstage` | `435efd61-0b5b-4865-af9f-af1f88134808` | Which AWS region did maintainers select to host Backstage production services? | 0 -> 0 -> 0 | `no_matching_decisions`; transcript returned 404 at final check |
| `encode/httpx` | `b2fcbc64-e9cb-4b81-b5d9-ed42bb09f78b` | Which AWS region did HTTPX maintainers select to host production services? | 3 -> 0 -> 0 | `below_relevance_threshold`; transcript persisted |
| `fastapi/fastapi` | `7eac0e1c-e9f0-4857-a906-5dee7faba45e` | Which database engine did FastAPI maintainers select as the default storage backend? | 3 -> 0 -> 0 | `below_relevance_threshold`; transcript returned 404 at final check |
| `langgenius/dify` | `d47e1448-126e-41d0-9258-61bcfedce9cb` | Which JVM garbage collector did Dify maintainers select for the backend? | 3 -> 0 -> 0 | `below_relevance_threshold`; transcript returned 404 at final check |
| `pallets/click` | `df6a3a0e-44ca-4a7a-b61d-48feab5be42d` | Which Kubernetes operator did Click maintainers select for production deployment? | 0 -> 0 -> 0 | `no_matching_decisions`; transcript persisted |

This is the expected evidence-safe behavior: weak candidates may be found, but
they are filtered out before generation. No unsupported answer or citation was
produced.

## Gaps and diagnosis

1. **Backstage is a repository coverage gap.** It has 38 ingested discussion
   records but no extracted decisions or decision evidence. There is nothing
   for repository-scoped decision Q&A to retrieve.
2. **The HTTPX server-startup question is not a demonstrated retrieval defect.**
   One candidate and one validated evidence record reached Groq; the model
   declined to answer. The evidence says server-thread errors should be caught
   and propagated immediately, but the API produced no citation. This is an
   answer-generation/evidence-sufficiency failure after retrieval.
3. **FastAPI has a provider availability problem and one evidence-linkage
   problem.** Six questions retrieved candidates/evidence but Groq returned
   `rate_limit_exceeded`. The FieldInfo answer cited the correct FieldInfo
   evidence (`41a8b6df-cc5f-4ffe-88b0-0d3faee80c3a`) and also a Swahili
   decision's evidence (`3c735a56-f8f7-4ca1-a97d-2d880f3363e3`). Decision
   `a7fea8ec-3103-407e-aef5-408e52411a6c` is titled as a Swahili translation
   decision but its evidence excerpt is about the FieldInfo refactor. The
   citation is repository-owned, but the decision/evidence association is
   semantically wrong.
4. **Dify has duplicated and mislinked decision records.** The billing
   discussion has both `dbbeef8d-4998-4702-85b0-89d53c29be8e`
   (`unresolved`) and `6ecfae01-7b44-48ff-b08a-8375ba61d446` (`rejected`),
   both `needs_review`, with the same billing source. The ReAct decision
   `e9b66e8b-7dda-456d-afad-37a448539df8` points to evidence
   `b126e107-684b-408f-9292-890531c8c67a`, whose excerpt and source URL are
   from the billing PR. The billing status answer consequently exposed the
   conflict and included the unrelated ReAct citation; the ReAct question
   retrieved that mismatched evidence and fell back.
5. **HTTPX and Click review metadata should be respected.** HTTPX evidence
   records have `review_status=needs_review` with an "evidence role does not
   match" review reason. Click's unresolved decisions also need review. Their
   API responses summarize the recorded proposals; they should not be
   presented as approved decisions.

Repository isolation and citation provenance checks worked in the tested
requests: no cross-repository citation was observed, and unsupported questions
did not receive generated answers. The main demonstrated problems are missing
Backstage decisions, Groq rate limits, and decision/evidence data quality, not
a reason to weaken retrieval thresholds or evidence validation.

## Best five demo questions

These five produced useful, cited responses in the live API. State the
recorded status when demoing them: these are unresolved proposals awaiting
review, not approved decisions.

1. **What behavior should the documentation explain when Ctrl+C is pressed
   while `less` is in follow mode?** Click answered that Ctrl+C propagates to
   Click and quits the command, and that Ctrl+X then `q` quits `less` in follow
   mode. Two citations; [PR #3900](https://github.com/pallets/click/pull/3900).
2. **Why replace the context manager in `map_httpcore_exceptions` with
   try/except?** The recorded rationale is lower overhead in hot paths. One
   citation; [PR #3778](https://github.com/encode/httpx/pull/3778).
3. **Why stop passing a deprecated command's help text through gettext?** The
   proposal aligns translation behavior for the deprecated label with options
   and arguments. One citation;
   [PR #3901](https://github.com/pallets/click/pull/3901).
4. **What is the proposed compatibility approach for the HTTPX 1.0 release?**
   The record says no breaking changes are planned. One citation;
   [PR #3796](https://github.com/encode/httpx/pull/3796).
5. **Why is the cryptography dependency proposed to move from 45.0.7 to
   46.0.6?** The answer connects the proposed bump with reported CVEs. One
   citation; [PR #3785](https://github.com/encode/httpx/pull/3785).

## Results

| Metric | Result |
|---|---:|
| Registered repositories inspected | 5 |
| Decisions inspected | 18 |
| Decisions with structurally valid evidence | 18 |
| Structurally valid evidence records | 23 |
| Evidence-derived candidate questions submitted | 18 |
| Clean, useful API answers with relevant repository-owned citations | 8 / 18 (44.4%) |
| Partial answers with semantic citation contamination | 2 |
| Answers falling back after evidence reached Groq | 2 |
| FastAPI requests failing with Groq `rate_limit_exceeded` | 6 |
| Candidate questions returning `no_matching_decisions` | 0 / 18 |
| Unsupported probes returning `no_matching_decisions` | 2 / 5 |
| Unsupported probes returning `below_relevance_threshold` | 3 / 5 |
| Cross-repository citations observed | 0 |

The 23 evidence records are structurally valid by repository/excerpt/URL
checks; this does not imply that every record is semantically linked to its
decision. No retrieval threshold, isolation rule, evidence validation rule,
decision, or evidence record was changed during this evaluation.
