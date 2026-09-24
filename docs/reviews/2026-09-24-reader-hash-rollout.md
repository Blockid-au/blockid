# Immutable reader hash verification rollout — 24 September 2026

The public immutable reader now verifies `report_hash` whenever a revision row carries one. It computes SHA-256 over the canonical ReportV2 JSON and rejects a mismatch before returning the document to web, PDF, DOCX, or email consumers. Rows from the initial migration with a null hash remain readable for compatibility; all writer-created rows carry a hash.

The phase is live at SHA `3839ef907fd687e61a11c25df8fa369347c037af`, release `i1_7kzJNHvExxIgL3t4br`, active origin `4131`, warm `4130`. Public/local HTTP returned 200, startup errors were zero, previous chunks remained readable, and mark-good completed after the accelerated 60-second soak. Origin 4125 and 4126 were retired with exact identity before admission to keep the active-origin count below the sixth-origin resource gate; artifacts remain retained.

Read-only reconciliation confirmed `report_revisions` exists (HTTP 200) but currently has zero rows. No customer report was run automatically because no founder-designated test project/scope is available; this avoids mutating a customer snapshot or spending DeepInfra budget without an explicit safe fixture. Controlled real-run row/token/permission reconciliation remains open.

