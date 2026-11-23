# WS-PTW — Core + Isolation only (ST7-1 / ST7-11)

## Approved pilot scope
- Only ST7-1 and ST7-11 are currently implemented as native digital print templates.
- Other annexes (HOT WORK / confined space / excavation / scaffolding / testing and unrecognized work activities) are deferred. Their paper-issue registration is blocked until the official form workflows are implemented.
- PTW numbering, autosave, archive, AP account and SAP account mapping remain server-backed.
- Every isolation point inherits its parent PTW number. Its recorded tag position represents a **plan**, not field verification.

## Manual-paper lifecycle: ST-07 (2025), section 5.4, printed pp. 19–21
1. **Draft**: station or maintenance account prepares data; signed paper does not exist yet.
2. **Issued**: the assigned station-operations SAP account records that SAP signed ST7-1 section 6 and AP received/signed section 7 on the *original paper*, and field safety/isolation checks were performed per approved procedures. This only records a confirmation; it does NOT generate an electronic signature, certify physical isolation, or independently authorize work.
3. **Cancelled (closed by SAP)**: after the AP has cleared and manually signed ST7-1 section 9, SAP confirms that SAP manually signed section 11 and records cancellation in the app. Only the login selected as SAP for this station and PTW may call the endpoint. The database records actor and timestamp and makes the record read-only.
4. **Normalized**: after SAP has instructed operators and verified the prescribed de-isolation/tag removal process, and section 12 is completed on paper, SAP separately records normalization in the app. Cancellation does not imply normalization.

This restricted workflow is a record-keeping aid, not a replacement for ST-07, authorized persons' appointments, inspections, manual signatures, or filed original paperwork.

## Equipment-history warning
- When the selected equipment is saved, a server-restricted query compares its asset UUID; historical free-text records are matched only as a fallback.
- Shows up to 20 other PTWs at the same station, separated by outstanding vs. historical.
- Drafts, issued permits, and cancelled permits with unresolved normalization of isolation points are highlighted.
- A normalized permit remains searchable as history.
- The warning does not block creating a draft and does not confer permission to begin work.

## Authorization and data protection
- SAP candidate is the existing station operations login; AP candidate is the maintenance engineer login. These are *account mappings* for the pilot, not independent technical authorization.
- The **SAP-only** operations check both assigned `sap_account_user_id` and active station login mapping on the server.
- Stored actor and server timestamp do not constitute an electronic signature.
- No changes to existing reports/maintenance tables and no changes to `main`; work is on the draft PR branch.
- Code and DDL are versioned at `database/ptw-core-isolation-sap-close.sql` and `database/ptw-core-limited-scope.sql`.

## Validation status (2026-11-23)
- SQL migration applied to the existing PTW-only schema; no operational report table changed.
- 8 scoped SQL checks passed in an ephemeral transaction with all QA rows rolled back: same-asset history lookup, manual paper issue, block on unsupported HOT WORK form, refusal for AP cancellation, required AP paper-clearance confirmation, SAP cancellation, unresolved-isolation warning, and post-normalization history state.
- Current operational PTW row count remains zero.
- `ptw-core.js` and inline print scripts for ST7-1 and ST7-11 passed JavaScript syntax checks.
- Pending: browser acceptance test using real signed-in station and maintenance user sessions, review of exact printed PDFs after lifecycle status changes, and production release decision. This PR remains draft.

## Release gate
Do not merge this draft pull request or treat it as field-approved until:
1. Real users at Wadi Jizan can create/reopen a draft, persist it from a different device, and view its isolation lines and warning.
2. The AP account fails an attempted SAP cancellation and the assigned SAP account succeeds after paper confirmations.
3. All ST7-1/ST7-11 print fields, borders, checkbox states, and page breaks are accepted visually.
4. The actual SAP/AP technical authorizations and paper signature process are verified by site management.
