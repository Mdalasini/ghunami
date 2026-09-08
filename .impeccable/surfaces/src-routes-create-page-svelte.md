---
version: 1
slug: "src-routes-create-page-svelte"
primary_target: "src/routes/create/+page.svelte"
related_targets: ["src/lib/create/Tip.svelte"]
---

# Create flow — /create

Scope: the fundraiser creation flow (Goal → Photo → Title → Story → Review) and its done state. Mode: Operate.

Audience: a Kenyan starting a personal fundraiser, on a phone, usually in daylight. Job: set a goal, a photo, a title, a story; see it confirmed. Action: Continue. Content: user-authored draft only; no claims, no social proof. Constraints: browser-only draft, KES, name ghunami + Horizon mark binding. Structure pinned by the user: Duolingo-like — one question per screen, thick progress bar, fixed bottom bar with big rounded buttons, high energy. User rejected gold and the two-column heading+card layout.

Memorable moment: pressing Continue sends your answer as a message and the next question arrives.

## Direction contract

THESIS: The fundraiser is written the way money already moves in Kenya: a thread of messages ending in a confirmation. Refuses the two-column "tips rail + form card" wizard and the neutral gray form.

OWN-WORLD: Chat thread on a pale green-gray ground. ghunami's questions are white incoming bubbles with the Horizon mark as avatar; your answers are confirm-green sent bubbles in white. Suggested amounts are quick-reply chips. Review is a receipt bubble: rules, tabular numerals, green tick. One face (Rubik) at heavy weights, hierarchy by size alone; no eyebrows. Palette law: green = go/done, red = error only. Buttons are fat, fully rounded, with a solid darker bottom edge that presses.

STORY: "This asks me one thing at a time, like a text. My answers stack up. At the end it reads back like an M-Pesa confirmation, so I trust it."

FIRST VIEWPORT: Top strip: close (X) left, a five-segment green progress bar filling the width. Single centered column ≤ 40rem. Prior answers as compact sent bubbles (none on step 1). The current question as a large white bubble, 28–32px heavy. Beneath it the compose area: for Goal, "Ksh" + a 56px+ numeric input, then four quick-reply chips. Fixed bottom bar: Back outline left, Continue solid green right (disabled: gray, no edge).

FORM: M-Pesa confirmation message — candidate 1 of 7 on my grounded list, taken as IMPECCABLE'S PICK over the assigned Harambee poster. Seed key d2a8356b. Raises kept: claim-and-proof (thread accumulates), one face/size-only hierarchy, palette law, progress as segments, steps deploy (send/arrive motion).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
