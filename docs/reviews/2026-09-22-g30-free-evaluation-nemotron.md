# O01 bounded real free evaluation — Nemotron, 2026-09-22

Branch `g30-free-fallback-qualification`, following `906d67bd2`. User-authorized free-only inference used existing OpenRouter credentials; credentials were never printed or persisted. Seven total synthetic requests were attempted against one exact model, `nvidia/nemotron-3-super-120b-a12b:free`, endpoint tag `nvidia`. No customer data, private decks, purchases, paid fallback or configuration activation.

## Result and independent review

Five completions returned the exact requested model and provider Nvidia, with explicit `usage.cost=0`; median successful latency 6879ms (range5720–9670ms). All five parsed and preserved exact quoted input sources, abstained from scores and independent confirmation. Three passed their bounded elementary fixture, one failed Vietnamese language (returned English), and one Vietnamese missing-evidence answer was too broad about next evidence. These results do not prove investor-grade report quality or superiority over DeepInfra.

The first request returned404 under ZDR/data-collection-denied routing; its body was not retained, so exact cause is unknown. For explicitly public/synthetic-only inputs, root authorized standard documented routing policy; subsequent requests used collection allowed/ZDR false with the same exact free model, zero prompt/completion/request maximum prices, no fallback or plugins. This does not authorize private-report inputs. Official routing documents explain those privacy filters constrain eligible providers. [OpenRouter routing](https://openrouter.ai/docs/guides/routing/provider-selection)

Request7 returned HTTP200 containing an upstream503/provider_overloaded error without completion, model identity or usage. The runner stopped. This is an availability failure, not a quality pass or evidence of a charge. Failed-response cost was not reported and is not assumed. Seven remaining planned cases were not run; contradiction, injection, deeper investor implications and score-abstention coverage remain incomplete. The failed first EN and successful VI request are distinct attempts, both retained in the denominator.

Before calls, authenticated `/key` observations showed 817 free requests remaining of1000 at the initial check. Calls were serial with4-second gaps plus response time, bounded below14 total; account counters were rechecked before every attempted inference. This ad-hoc evaluation does not establish a synchronized production minute ledger or atomic quota reservation across all callers. [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits)

## Reproducibility and source change

`web/content/ai-qualification/evaluations/2026-09-22-nemotron-free/` contains exact synthetic request bodies, public endpoint metadata, completion/usage responses, latency, quota-before observations, manually authored fixture requirements, content hashes and independent inspection notes. No key, auth header or account label is retained. Evaluations are not promoted into approved artifacts or the manifest.

The loader now requires matching `dataScope` in request demand, reviewed manifest and quality evidence. `public_synthetic_only` qualification can prepare standard public-input routing; it cannot authorize `private_report` input. Private-report routing continues to require collection denied/ZDR, plus separate privacy authorization. No consumer dispatch was wired, and the approved manifest remains empty.

Eight focused loader tests passed using private `/tmp` configuration/cache, including rejection of public-only evidence for private-deck demand. Targeted ESLint passed. No broad build or deployment.

Next: one different documented multilingual free candidate with explicit natural-language EN/VI instructions, same bounded cost controls and no private input. Retain this failed batch rather than replacing its history.
