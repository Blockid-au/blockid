# Reader-first compatibility release

Target v3.29.2; no new unavailable valuation writer/gather policy enabled. New schema and reader/export guards consume explicit unavailable reports without inventing money or falling back from canonical data. Existing producer changes are type narrowing/availability guards; legacy generation behavior remains. Storage write acknowledgments, cache policy, billing and AI routing are unchanged in this slice.

Independent offline baseline: old f88 schema accepts historical available fixture, rejects same fixture with valid new unavailable valuation; old buildValuationView throws reading methods.filter. Reader slice includes persisted unavailable fixture through unchanged snapshot/assembled/evaluation storage readers and HTML free/standard rendering. Seven focused suites/88 tests passed. Full standalone typecheck first exhausted4GB heap;8GB follow-up exposed narrowing diagnostics now corrected. No final standalone typecheck pass is claimed here; production build remains authoritative under founder-authorized deferred-review profile.

New writers/final findings/full light foundations follow this compatible-reader release. This is not full report accuracy, full question-level research, billing fulfillment or sale acceptance. No production DB or provider call was made for the source slice.
