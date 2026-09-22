# G30 U01/U02 workspace return navigation — candidate

Shared WorkspaceLayout now shows a compact Home → persona Overview → catalogue
section/tab → current location trail. Investor seats return to their investor
overview; founder hubs retain their existing tab hierarchy. Dynamic IDs and
uncatalogued path segments never become customer-facing labels or invented
parent links. The current item is plain text with aria-current; parent items
are real links, underlined and keyboard focusable, with44px touch height.
Layout wraps on narrow screens and uses existing light semantic tokens.

UI/UX Pro Max guidance applied for predictable back paths, progressive
disclosure, touch targets and readable light surfaces. Its automatic dense/dark
dashboard suggestion was not adopted because the founder explicitly requires
simple light interfaces. Existing Next Link documentation was read locally.

21 focused navigation/shared-shell tests pass. No live/authenticated browser
or all-page review claimed; founder deferred broad review. This slice does not
complete menu regrouping, dashboard information hierarchy or all-page redesign.
