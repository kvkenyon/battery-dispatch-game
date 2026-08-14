# Content tier seam

Gridville does not contain payments, accounts, checkout code, or a payment SDK. Every campaign chapter is unlocked during the founders preview.

The campaign manifest in `src/data.ts` labels each chapter with a `tier` of `free` or `premium`. `isChapterAvailable()` is the single future entitlement seam: a later host can supply a premium entitlement without changing scenario data, dispatch accounting, or the HiGHS model.

The intended packaging is:

- Chapters 1–3: free campaign
- Chapters 4–6: premium-gateable campaign
- Current build: `FOUNDERS_PREVIEW` unlocks all chapters

Any future commercial implementation should live outside the static game core. This repository should continue to treat entitlements as a boolean input and must not collect payment or identity data itself.
