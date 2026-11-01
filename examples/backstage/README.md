# Backstage Unsupported-Evidence Example

**Outcome:** Verified insufficient-evidence fallback, not a successful answer.

- Repository: `backstage/backstage`
- Repository ID: `16c18238-5b49-4eb7-afde-af7d66dd6b8b`
- Conversation ID: `0cb9c293-b94b-4326-83f1-76da013508c9`
- Question: “Which accepted decisions explain how Backstage plugins should communicate with one another?”
- Actual answer: “I couldn't find sufficient evidence in this repository to answer that question.”
- Diagnostics: no matching decisions; zero evidence; `llm_invoked=false`.

At capture time, this repository had 38 ingested discussions, 0 decisions, and 0 decision-evidence records. There are no decision evidence IDs or original decision URLs to cite. METIS correctly declined to infer repository history from discussion text alone.

See the [request](input/unsupported-plugin-communication.json), [complete API response](output/unsupported-plugin-communication.json), [data check](evidence/unsupported-plugin-communication.md), and [actual browser screenshot](screenshots/unsupported-plugin-communication.png).