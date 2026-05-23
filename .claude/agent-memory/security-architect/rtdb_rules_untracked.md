---
name: rtdb-rules-untracked
description: database.rules.json is referenced by firebase.json but NOT tracked in git (firestore.rules IS tracked)
metadata:
  type: project
---

`database.rules.json` (the RTDB security rules) is wired into `firebase.json` but is NOT version-controlled — `git ls-files database.rules.json` returns nothing; it exists only in the working tree. By contrast `firestore.rules` IS tracked.

**Why it matters:** the deployed RTDB rules artifact is unauditable / not reproducible from the repo, and a teammate cloning the repo won't have it. Any RTDB rules review is reviewing an uncommitted file that could differ from what's actually deployed.

**How to apply:** when assessing RTDB security posture or before any `firebase deploy --only database`, confirm the on-disk `database.rules.json` matches what's intended and recommend committing it. Don't assume git history reflects the live RTDB rules.
