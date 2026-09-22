# Budget admission at actual Brave dispatch

Source implementation only; no production search, customer debit or environment activation.

`discoverWithBraveBudget` composes the existing durable budget ledger, bounded discovery loop and official-endpoint Brave adapter. A durable job supplies its original month, question/batch identity and approved public queries. Each actual search reserves one query before the network call, then checks job/account/report/consent authority again. The reservation ID hashes the complete job/question/batch/month/query binding; no query text or API result is written to the budget ledger. Concurrent or repeated identical jobs cannot dispatch the same query twice. Old jobs are refused after month rollover rather than silently getting a fresh allowance.

Unknown transport outcomes, cancellation after reservation and revoked authority keep the conservative reservation. They require reconciliation, not an automatic refund/retry. Free allowance and the existing paid monthly cap are enforced by the existing policy/store; the adapter introduces no new pricing or cap. Search URLs remain request-local discovery candidates, not verified or retained evidence. Source acquisition and semantic review remain separate.

Seven focused tests passed using the actual file ledger and Brave adapter with a synthetic fetch: durable-before-network ordering, exact replay, concurrent workers, paid cap, ambiguous failure, revocation during admission, month rollover and no dispatch for missing configuration/invalid input/cancellation. No real provider request was made.

Activation still needs the durable authorized worker and trusted policy reader, a provisioned private budget directory, accounting for the four earlier validation requests, and signed SVI gateway integration. `assertAuthorized` must revalidate the actual lease, closed-account state, current report, wallet grant and unexpired consent; an unconditional callback is not production authorization. This function does not create a quote, hold, publication, charge or SVI change.
