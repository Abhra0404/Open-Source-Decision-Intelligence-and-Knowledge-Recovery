# METIS

### Remember the Why. Understand the Evolution.

**METIS** is an open-source engineering decision intelligence and
knowledge recovery system. It aims to help developers recover the
reasoning behind a codebase by turning scattered GitHub discussions into
structured, searchable engineering knowledge.

A pull request shows *what* changed. An issue or review discussion may
explain *why*. METIS is being built to connect those pieces of context.

> **Project status:** Hackathon MVP in development. The architecture and
> model choices are subject to change as the team implements and
> evaluates the system.

## Implemented MVP capabilities

The current local MVP includes GitHub discussion ingestion, deterministic and
local Qwen3 8B extraction, evidence-grounded diagnostics, human decision
review, repository-scoped Decision Intelligence Q&A, and pending/reviewed
Decision Evolution relationships with timeline and graph APIs.

Q&A uses PostgreSQL full-text retrieval and the configured local open-weight
provider. It returns an insufficient-evidence response when no verified source
can support an answer. Relationship proposals remain pending until reviewed.

------------------------------------------------------------------------

## The problem

Important engineering decisions are often buried across GitHub issues,
pull requests, review comments, and discussions.

Over time: - Context gets lost when contributors leave or teams
change. - The same technical debates happen repeatedly. - A proposed
solution can be mistaken for an accepted decision. - Developers struggle
to understand why a particular implementation or constraint exists. -
Existing code search can show where something is implemented, but not
necessarily why it was designed that way.

This makes maintaining and extending an unfamiliar codebase harder than
it needs to be.

## Our approach

METIS aims to transform project discussions into an evidence-backed
decision knowledge base.

It will: 1. Ingest relevant GitHub issues, pull requests, reviews, and
discussion threads. 2. Extract candidate engineering decisions and their
supporting context. 3. Classify each decision as **accepted**,
**rejected**, **proposed**, or **unresolved**. 4. Preserve the
rationale, alternatives, participants' reasoning, and links to original
sources. 5. Retrieve relevant historical decisions when a developer
investigates code or prepares a change. 6. Present the result with
source references so developers can verify the original discussion.

METIS is intended to recover knowledge---not manufacture certainty. If a
discussion does not establish a final decision, the system should
preserve that uncertainty.

------------------------------------------------------------------------


## What makes METIS different?

METIS is not intended to be just another chatbot over GitHub data.

Its central unit of knowledge is an **engineering decision**, not merely
a discussion summary.

A useful decision record should capture:

-   **Decision:** What was decided?
-   **Status:** Was it accepted, rejected, proposed, or left unresolved?
-   **Rationale:** Why was the decision made?
-   **Alternatives:** What other approaches were considered?
-   **Evidence:** Which comments or messages support the interpretation?
-   **Source:** Where can a developer inspect the original discussion?

This structure helps distinguish an actual project decision from an idea
that was only suggested.

------------------------------------------------------------------------

## System architecture

The diagram below represents the **proposed MVP architecture**.
Components and data flows may change as implementation and evaluation
progress.

``` mermaid
flowchart TB
    GH["GitHub Repository<br/>Issues · Pull Requests · Reviews · Discussions"]

    subgraph ING["1. Data Ingestion"]
        API["GitHub API Client"]
        FETCH["Fetch & Paginate"]
        NORMALIZE["Normalize Discussions<br/>and Preserve Source URLs"]
        GH --> API --> FETCH --> NORMALIZE
    end

    subgraph INTEL["2. Decision Intelligence Pipeline"]
        EXTRACT["Decision Extraction<br/>Candidate · Rationale · Alternatives"]
        CLASSIFY["Decision Status Classification<br/>Accepted · Rejected · Proposed · Unresolved"]
        EVIDENCE["Evidence Linking<br/>Comments · Authors · Timestamps · URLs"]
        VALIDATE["Validation & Structured Output"]
        NORMALIZE --> EXTRACT --> CLASSIFY --> EVIDENCE --> VALIDATE
    end

    subgraph DATA["3. Knowledge Storage"]
        DB[("PostgreSQL")]
        VECTOR[("pgvector<br/>Discussion & Decision Embeddings")]
        VALIDATE --> DB
        VALIDATE --> VECTOR
    end

    subgraph RETRIEVAL["4. Retrieval & Context Assembly"]
        QUERY["Developer Query / PR Context"]
        SEARCH["Hybrid Retrieval<br/>Metadata + Semantic Similarity"]
        ASSEMBLE["Context Assembly<br/>Relevant Decisions + Evidence"]
        DB --> SEARCH
        VECTOR --> SEARCH
        QUERY --> SEARCH --> ASSEMBLE
    end

    subgraph APP["5. Application Layer"]
        FASTAPI["FastAPI Backend"]
        ORCHESTRATE["Workflow Orchestration"]
        ANSWER["Evidence-Grounded Response<br/>with Source References"]
        NEXT["Next.js Frontend"]
        NEXT <--> FASTAPI
        FASTAPI --> ORCHESTRATE
        ORCHESTRATE --> QUERY
        ASSEMBLE --> ANSWER
        ANSWER --> ORCHESTRATE
    end

    USER["Developer"]
    USER <--> NEXT
```

### Architecture flow

1.  **Ingest:** Retrieve repository discussions and normalize them into
    a consistent representation.
2.  **Extract:** Identify candidate decisions, rationale, and
    alternatives from the discussion.
3.  **Classify:** Determine whether each candidate is accepted,
    rejected, proposed, or unresolved.
4.  **Ground:** Attach supporting comments and original GitHub URLs to
    extracted records.
5.  **Persist:** Store structured records and embeddings for later
    retrieval.
6.  **Retrieve:** Search for relevant historical decisions using a
    developer question or PR context.
7.  **Respond:** Present concise answers with evidence links so
    developers can inspect the original source.

The language model and embedding model are still under evaluation. Exact
model names will be documented after they are integrated and tested.

------------------------------------------------------------------------

## Example

Imagine a repository discussion about choosing a database
connection-pooling strategy.

A conventional summary might say:

> The team discussed connection pooling and performance.

METIS aims to produce a more useful record:
```
  -----------------------------------------------------------------------
  Field                               Example
  ----------------------------------- -----------------------------------
  Decision                            Use connection pooling for the
                                      service

  Status                              Accepted

  Rationale                           Reduce connection setup overhead
                                      under concurrent requests

  Alternative                         Open a new connection for each
                                      request

  Evidence                            Relevant issue and review comments

  Source                              Link to the original GitHub
                                      discussion
  -----------------------------------------------------------------------
  ```

*This is an illustrative example, not a result from an already processed
repository.*

------------------------------------------------------------------------

## Initial technical direction

The following is the team's current **proposed direction**, not a claim
that every component is already implemented. The final stack will be
documented after integration and testing.

```
  -----------------------------------------------------------------------
  Layer                   Initial direction       Responsibility
  ----------------------- ----------------------- -----------------------
  Frontend                Next.js, Tailwind CSS   Search, decision
                                                  exploration, and
                                                  developer-facing
                                                  interface

  Backend API             Python, FastAPI         API endpoints and
                                                  orchestration

  AI workflow             LangGraph or an         Coordinate extraction,
                          explicit pipeline       classification, and
                                                  retrieval

  Language model          Under evaluation        Extract structured
                                                  decisions and explain
                                                  relevant context

  Embeddings              Sentence Transformers;  Semantic retrieval of
                          exact model under       related discussions and
                          evaluation              decisions

  Database                PostgreSQL with         Persist records and
                          pgvector                support vector
                                                  similarity search

  GitHub integration      GitHub API              Retrieve repository
                                                  discussions and
                                                  pull-request context
  -----------------------------------------------------------------------
```

We will list exact model names here only after they are integrated and
used in the submitted implementation.

------------------------------------------------------------------------



## Decision record: proposed data shape

A decision record is expected to contain fields similar to these:

``` json
{
  "title": "Adopt connection pooling",
  "summary": "Use a shared connection pool for database access.",
  "status": "accepted",
  "rationale": [
    "Reduces repeated connection setup overhead."
  ],
  "alternatives": [
    "Create a new connection for every request."
  ],
  "evidence": [
    {
      "source_type": "pull_request_comment",
      "url": "https://github.com/owner/repo/pull/123#discussion_r456"
    }
  ],
  "repository": "owner/repo"
}
```

This is an illustrative schema. The final data model may change during
implementation.

------------------------------------------------------------------------

## Design principles

1.  **Evidence first** --- important claims should link back to their
    original GitHub sources.
2.  **Status matters** --- proposals, accepted decisions, rejected
    options, and unresolved debates must not be conflated.
3.  **Preserve uncertainty** --- ambiguous discussions should remain
    ambiguous instead of being presented as settled facts.
4.  **Keep context** --- rationale and alternatives are as important as
    the final outcome.
5.  **Useful retrieval** --- surface relevant historical decisions in
    the context of a developer's current task.
6.  **Open-source transparency** --- document the models and components
    actually used.

------------------------------------------------------------------------

## Current status

METIS is being developed for **Hacktoberfest 2026 --- Hack Day
Sonipat**, under:

**Problem Statement 6: Open Source Decision Intelligence and Knowledge
Recovery**

The first vertical slice is implemented: a FastAPI backend, PostgreSQL
schema, GitHub ingestion, deterministic evidence-preserving extraction,
and a Next.js source discussion explorer. LLM extraction and semantic
embeddings remain future work.

### Local setup

Requirements: Python 3.13+, Node.js 20+, npm, and Docker Desktop.

```bash
docker compose up -d postgres
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cp .env.example .env

cd backend
../.venv/bin/python run.py
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`, enter a public GitHub repository URL, start
ingestion, then click **Extract decisions**. The API is available at
`http://localhost:8000/docs`. Extraction currently uses the explicit
deterministic MVP provider; it only creates evidence-backed candidates and
does not claim that a language model is configured.
Set `GITHUB_TOKEN` in `.env` or the shell for higher GitHub API limits.

### MVP milestones

-   [x] Connect to a GitHub repository and ingest discussion data.
-   [x] Normalize issues, pull requests, reviews, and comments.
-   [x] Persist structured discussions with source evidence.
-   [x] Display ingested source discussions in the frontend.
-   [ ] Extract candidate decisions with an evaluated language model.
-   [ ] Classify decision status with an evaluated language model.
-   [ ] Retrieve decisions with semantic embeddings.
-   [ ] Evaluate extraction and classification against manually reviewed
    examples.

------------------------------------------------------------------------

## Team

**Team Dot**

-   Abhra Jaiswal
-   Ahmad Ibni Shafi
-   Shreyas Hemant Mohite

------------------------------------------------------------------------

## Contributing

Contribution guidelines will be added as the repository structure and
development workflow are established.

When contributing, please keep these principles in mind: - Do not
present an inferred decision as accepted without supporting evidence. -
Preserve links to the original discussion. - Keep proposals and
unresolved debates distinct from final decisions. - Include tests for
changes to extraction, classification, and retrieval behavior.

## License

METIS is licensed under the **Apache License 2.0**. You may use, modify,
and distribute this project under the terms of that license.

See the [`LICENSE`](LICENSE) file for the full license text. For
details, visit the [Apache License, Version
2.0](https://www.apache.org/licenses/LICENSE-2.0).

------------------------------------------------------------------------
