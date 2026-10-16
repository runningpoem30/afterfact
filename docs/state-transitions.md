# State transitions (initial policy)

## Claim

Allowed: proposed → accepted / contested / retracted; accepted → contested / superseded / retracted; contested → accepted / superseded / retracted. Superseded and retracted are historical terminal states. Current code creates extracted claims as `proposed`; correction preserves the old node as `superseded` and creates a replacement as `proposed`.

## Decision (planned)

draft → supported / needs_review; supported → needs_review / unsupported / superseded; needs_review → supported / unsupported / superseded. Re-evaluation must preserve a decision if at least one explicitly sufficient support group remains valid. Current code only marks directly dependent decisions for review; alternative support is not implemented.

## Action (planned)

proposed → approved / cancelled / held; approved → held / executing / cancelled; held → approved / cancelled; executing → succeeded / failed. Completed external actions are historical facts and require compensating work, never silent reversal. Execution-time checks, approvals and idempotency are deferred.

## Guardrails

The server enforces allowed transitions (not yet fully implemented). Unknown evidence or incomplete dependency coverage requires review; empty traversal results do not imply safety. A newer timestamp is not authority. Confidence means extractor confidence only.
