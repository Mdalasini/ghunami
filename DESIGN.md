---
name: Ghunami
description: Chat-thread fundraiser drafting on a pale green-gray ground, ending like an M-Pesa confirmation.
colors:
  ink: "#0f1a12"
  paper: "#eef3ee"
  card: "#ffffff"
  sun: "#d6ead9"
  accent: "#15803d"
  accent-deep: "#116232"
  mute: "#4b5e52"
  hint: "#66796c"
  line: "#cdd9cf"
  error: "#c62828"
typography:
  display:
    fontFamily: "Rubik, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.25rem)"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Rubik, system-ui, sans-serif"
    fontSize: "clamp(3rem, 8vw, 4.5rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Rubik, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Rubik, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Rubik, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.05em"
rounded:
  tail: "8px"
  photo: "16px"
  bubble: "24px"
  full: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "20px"
  xl: "24px"
  edge: "4px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.card}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 28px"
    height: "3.25rem"
  button-primary-hover:
    backgroundColor: "{colors.accent-deep}"
    textColor: "{colors.card}"
    rounded: "{rounded.full}"
    height: "3.25rem"
  button-primary-disabled:
    backgroundColor: "{colors.line}"
    textColor: "{colors.mute}"
    rounded: "{rounded.full}"
    height: "3.25rem"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.mute}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0 28px"
    height: "3.25rem"
  chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.accent}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
  chip-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.card}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
  bubble-incoming:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bubble}"
    padding: "20px 24px"
  bubble-sent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.card}"
    rounded: "{rounded.bubble}"
    padding: "12px 20px"
  input-compose:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bubble}"
    padding: "20px 24px"
---

# Design System: Ghunami

## Overview

**Creative North Star: "M-Pesa Confirmation"**

Ghunami drafts a fundraiser the way money already moves in Kenya: a thread of messages that ends in a confirmation. The screen is a pale green-gray chat, not a gray form. ghunami asks from the left in white incoming bubbles, with the Horizon mark sitting in a dark disc as the avatar. Your answers leave as confirm-green sent bubbles. Review reads back as a receipt: dashed rows, tabular numerals, a green tick.

The material is fat and tactile. Actions are fully rounded pills with a solid darker bottom edge that presses in. One self-hosted face (Rubik, 300–900) carries every role; size does the talking. The name **ghunami** (lowercase in the wordmark; Ghunami in titles) and the Horizon mark (rising semicircle over two receding bands) are binding identity.

**Key Characteristics:**
- Pale green-gray paper with white speech surfaces and confirm-green sent answers
- One face, hierarchy by size; labels shout with uppercase and extra-bold
- Pressable 4px bottom-edge buttons
- Chat tails: large radius with one tighter corner toward the speaker
- Green means go or done; red is reserved for errors

## Colors

A single green family on cool paper. Accent is the confirmation color, not decoration.

### Primary
- **Confirm Green** (`accent`): Go, done, sent, progress fill, caret, focus ring, selected chips. Theme color in the browser chrome.
- **Press Green** (`accent-deep`): The solid bottom edge under primary buttons, and the hover of confirm green.

### Neutral
- **Night Grove** (`ink`): Body text and the Horizon avatar disc.
- **Pale Grove Paper** (`paper`): Page ground, sticky header, docked footer.
- **White Card** (`card`): Incoming bubbles, compose cards, receipt, button face on secondary, type on accent.
- **Mint Wash** (`sun`): Soft highlight (selection, photo-upload disc, landing header hover).
- **Leaf Mute** (`mute`): Supporting copy, secondary button type, receipt labels.
- **Hint Sage** (`hint`): Placeholders only.
- **Grove Line** (`line`): Borders, progress track, disabled primary fill, secondary button edge.

### Tertiary
- **Signal Red** (`error`): Error copy only. Never fill a button, chip, or bubble with it.

### Named Rules
**The Palette Law.** Green is go and done. Red is error only. Do not invent a third accent.

**The Confirmation Field Rule.** A sent answer and a live primary action share Confirm Green. If it is not an answer, a progress fill, or a go-control, it is not green.

## Typography

**Display Font:** Rubik (self-hosted latin `woff2`, variable 300–900) with system-ui sans fallback
**Body Font:** Rubik (same file, same stack)
**Label/Mono Font:** Rubik — no second family. Amounts use tabular figures (`font-feature-settings: 'tnum'` on the document).

**Character:** One heavy, slightly geometric grotesque. Questions and money are extra-bold and tight; supporting lines sit in mute at body size. Nothing italic.

### Hierarchy
- **Display** (800, `clamp(1.75rem, 4vw, 2.25rem)`, line-height 1.15, tracking -0.02em): The current question inside the incoming bubble. Size-only step up from body; same face.
- **Headline** (800, `clamp(3rem, 8vw, 4.5rem)`, line-height 1.05): Landing hero, and the Goal compose numerals (`3.5rem` / `4rem` on desktop, tracking -0.03em). Money is a headline, not a caption.
- **Title** (800, 1.25rem–1.5rem): Photo prompt, receipt “Draft confirmed”, compact sent-bubble amounts/titles (`font-bold` / `font-extrabold`).
- **Body** (400, 1rem / 1.125rem on large, line-height 1.5–relaxed): Question subcopy, story field, tip body, receipt story. Mute for secondary sentences.
- **Label** (800, 0.875rem, tracking wider, uppercase): Pressable buttons. Micro-labels (Edit / Change / counters) drop to 0.75rem, same case and weight.

### Named Rules
**The One Face Rule.** Rubik for display, body, UI, and numerals. Change size and case; do not add a display serif or a mono.

## Layout

Create flow is a single centered column, max width 40rem, 16px side gutters. The thread sits in a column that justifies to the bottom (`gap` 20px) so the latest question and compose land above a fixed dock. Compose and chips inset past the 48px Horizon disc (`margin-left` 3.75rem). The receipt insets slightly less (`2rem` / `3.5rem`).

The top is a sticky paper strip: 40px close control, then a five-segment progress bar (`16px` tall pills, `6px` gaps). The bottom is a fixed paper dock (`border-top` 2px line, 95% paper + blur) with the same 40rem inner row and a 16px pad. Main content keeps `8rem` bottom padding so the last bubble clears the dock.

Landing is looser: 24–48px page pad, wordmark left, a quiet text control right, a centered `max-width: 48rem` hero.

Spacing rhythm is 8 / 16 / 20 / 24. The press travel is a hard 4px, not a spacing step for layout.

## Elevation & Depth

Flat surfaces. No ambient drop shadows. Depth is a 4px solid bottom edge on pressable buttons, a sticky paper header, and a frosted dock. While an answer is sending, the compose card and chips flood Confirm Green — the draft becomes the sent bubble before it flies up.

### Shadow Vocabulary
- **Press edge** (`box-shadow: 0 4px 0 0 var(--btn-edge, var(--color-accent-deep))`): Default lift on `.btn-press`. Secondary sets `--btn-edge` to line.
- **Pressed** (`box-shadow: 0 0 0 0` + `translateY(4px)`): Active, 100ms. Disabled has no edge.

### Named Rules
**The Pressable Edge Rule.** A live primary or secondary action carries a 4px solid bottom edge in the matching deep/line color. Disabled primaries lose the edge and sit on Grove Line.

## Shapes

Speech surfaces are large rounds (`24px`) with one `8px` tail: bottom-left on incoming and tips, bottom-right on sent, top-right on compose, top-left on the receipt. Photos clip to `16px`. Controls, chips, progress segments, and the Horizon disc are fully round (`9999px`). Compose and chips use a 2px Grove Line stroke that turns Confirm Green on focus or drag.

## Components

### Buttons
Fat, fully rounded, extra-bold uppercase labels. Shared utility: height 3.25rem, horizontal pad 28px, 4px press edge, 100ms press.

- **Shape:** Capsule (`9999px`)
- **Primary:** Confirm Green face, White Card type, Press Green edge. Hover: Press Green fill. Disabled: Grove Line fill, Leaf Mute type, no edge.
- **Secondary:** White Card face, Leaf Mute type, 2px Grove Line stroke, Grove Line edge. Hover type goes Night Grove.
- **Focus:** 3px Confirm Green outline, 3px offset, on every control that is not a text field.

### Chips
Quick-reply amounts under Goal. Unselected: White Card, Confirm Green type, 2px Grove Line, 10×20 pad, `1rem` extra-bold. Selected: Confirm Green fill, White Card type, Confirm Green stroke. Hover on unselected turns the stroke Confirm Green.

### Cards / Containers
Incoming question, tip, compose, and receipt are the card language — not a lifted panel. White Card fill. Incoming has no stroke; compose/receipt/photo well use the 2px line. Internal pad 20–24px. Photo wells are 18rem tall. Sending floods compose to Confirm Green.

### Inputs / Fields
The bubble is the field. Inner input is borderless and transparent (`field-bare`); caret is Confirm Green; placeholder is Hint Sage. Focus-within turns the bubble stroke Confirm Green — no inner ring. Goal prefixes “Ksh” in Confirm Green title size. Error is a Leaf-weight `0.875rem` Signal Red line under the well, never a red border as the only cue.

### Navigation
Create header: 40×40 mute close (X) that washes White Card on hover; five-segment Grove Line track filling Confirm Green (current segment at 45%, complete at 100%). Landing header: Horizon wordmark at 32px tall; a small rounded text link (`0.875rem`, medium, ink/15 hairline) that washes Mint Wash — not a pressable.

### Incoming bubble
Horizon disc (`48px`, Night Grove, mark in White Card) sits at the baseline. White Card balloon with a bottom-left tail. Question uses Display; subcopy is Body in Leaf Mute.

### Sent bubble
Right-aligned, max 85% width, Confirm Green, bottom-right tail, White Card type. Tap to edit (pencil at 16px, 70% white). Hover: Press Green.

### Tip
A second incoming: same disc, smaller White Card balloon (`20×16` pad), Night Grove title at `0.875rem` extra-bold, Leaf Mute body. List markers, when present, are Confirm Green extra-bold.

### Receipt
Incoming-adjacent White Card with a top-left tail. Done state opens with a Confirm Green extra-bold “Draft confirmed” and a filled tick. Rows are dashed Grove Line dividers: mute label, extra-bold value (Goal at `1.875rem`). Edit/Change are 12px extra-bold uppercase capsules with a 2px line.

## Do's and Don'ts

### Do:
- **Do** keep the Horizon mark and the name ghunami on every surface that represents the product.
- **Do** put go/done/sent/progress on Confirm Green, and press travel on a 4px edge.
- **Do** give speech surfaces a 24px round and one 8px tail toward the speaker.
- **Do** set money and questions extra-bold, with tabular numerals on amounts.
- **Do** dock Continue/Back as pressable capsules on paper, and disable Continue on Grove Line with no edge.

### Don't:
- **Don't** use Signal Red for anything but an error message.
- **Don't** add a second typeface or a decorative italic.
- **Don't** use ambient drop shadows to lift cards; the edge and the paper are the depth.
- **Don't** turn a compose well into a gray Material field with its own inner border and ring.
- **Don't** replace the Horizon disc with a generic initials avatar.
