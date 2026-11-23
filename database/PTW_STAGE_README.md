# WS-PTW staged integration (DRAFT ONLY)

This branch integrates a central-draft PTW interface, search, AP receiver draft records, planned isolation records, and native ST7-1 / ST7-11 print templates.

**Live release is disabled.** No electronic SAP/AP issue signatures or physical isolation verification. Print outputs carry a DRAFT warning; isolation execution date/time is not fabricated.

Backend schema migration **ws_ptw_draft_core_20261123** was applied separately in Supabase. Do not re-run blindly. Initial sequence is 0206 after Excel review. Grant PTW preparer rights explicitly via ptw_role_assignments to test users. Existing administrators can create draft records but are NOT automatically SAP/AP.

Before main merge: review security warning for intentional SECURITY DEFINER RPC, real-auth test permissions across stations, multi-device save, print with 8+ isolations, and original-site regression tests.
