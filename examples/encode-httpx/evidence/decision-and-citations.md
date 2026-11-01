# HTTPX: 301/302 Redirect Method Behavior

- Decision ID: `636baf23-11bb-436c-aac0-888a6303af98`
- Title: Add option to keep the same method for 301/302 redirects
- Decision status: `unresolved`
- Review status: `needs_review`
- Review reason: evidence role does not match the cited source content

Cited evidence returned by METIS:

1. Evidence `e57b53bf-a0bb-4f73-af89-4a8ea94360f1`, discussion `375cbcaa-083c-4351-b9ca-84cab91ba057`, role `proposal`: “Add new option to clients to select the behavior.” The original PR description explains that RFC expectations for 301/302 are unclear, browsers commonly switch to GET, and some server applications expect the legacy same-method behavior. [Original PR](https://github.com/encode/httpx/pull/3783)
2. Evidence `a0e5649a-3470-4ca8-90bb-0025a5e90d79`, discussion `38c68d13-f625-4c05-ae66-2289bcb7d882`, role `objection`: “I'd rather not have configuration options to support esoteric configurations.” The same comment suggests disabling redirects and handling the use case directly. [Original maintainer comment](https://github.com/encode/httpx/pull/3783#issuecomment-5736724354)

Together these sources support the proposed behavior and the maintainer's objection. The stored decision remains `unresolved` and `needs_review`; this example does not claim that the proposal was accepted. The response's cited IDs are validated against the repository and retrieved evidence, although semantic evidence-role validation still flags the decision for human review.
