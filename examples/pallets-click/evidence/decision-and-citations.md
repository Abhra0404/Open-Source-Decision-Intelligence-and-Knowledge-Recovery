# Click: Less Interruption Behavior

- Decision ID: `e761b80b-faa2-4595-8376-b47ec3192040`
- Title: Document `less` interruption behavior
- Decision status: `unresolved`
- Review status: `needs_review`
- Review reason: evidence role does not match the cited source content

Cited evidence returned by METIS:

1. Evidence `e3490b1e-d71c-493e-87a4-d83407ad297d`, discussion `f098f452-420b-4001-8eca-7b6d74450749`, role `proposal`: “This answer the question in https://github.com/pallets/click/issues/3886 on how Click and `less` interact with each others on `Ctrl+C`.” [Original PR](https://github.com/pallets/click/pull/3900)
2. Evidence `9904cefb-c573-455a-b2f5-eef7623d52c2`, discussion `ee960277-c410-4c30-91a5-7d8a47411128`, role `objection`: “This feels way too verbose. It can be shortened to a couple sentences. > To quit `less` in follow mode (`-f`), press `Ctrl+X` then `q`. Pressing `Ctrl+C` will propagate to Click and quit the command as well.” [Original comment](https://github.com/pallets/click/pull/3900#issuecomment-6498926214)

The second excerpt directly supports the documented `less` key sequence and Ctrl+C behavior. The proposal excerpt establishes that the PR addresses the question. METIS reports the decision as unresolved and needs review; this example does not claim that maintainers accepted the behavior. The record's evidence-role warning remains visible and the answer preserves that uncertainty.
