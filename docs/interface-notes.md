# Interface implementation notes

## Reference and behavior

The supplied HTML informs the visual design: compact typography, monochrome glass surfaces, light and smoked-dark palettes, three overview layouts, oversized chore-symbol watermarks, relative deadline text, inward status glows, and a floating mobile dock with a separate add button. Desktop keeps a stationary sidebar.

Preview-only controls are not shipped: no simulated phone frame or status bar, View 3 debug toggle, frame-width control, CSS export dialog, fabricated totals, or mock completion history. The actual appearance setting lives in Me. The app uses its existing household API, not the HTML's in-memory demonstration state.

Natural-language chore parsing, guessed reminder settings, free-text preference interpretation, and simulated invitation behavior are not implemented. The actual editor, structured preferences, notification setup, verified administrator checks, join approval, and recurrence rules remain authoritative.

## Chore interactions

- A short horizontal swipe reveals a green completion action on the left or a blue trade action on the right. A full swipe invokes that action. Completion requires an additional confirmation before saving. Vertical scrolling and pinch zoom remain available; cancelled gestures reset safely.
- Pointer and keyboard alternatives remain available. Arrow keys reveal actions, Enter invokes the revealed action, and Escape closes them. Keyboard-focusable fallback actions also support assistive technology.
- Other people's assignments are read-only. Unopened turns cannot be completed. Closed missed windows cannot be completed or traded. A valid future turn can still be offered in a trade. The server independently validates permissions and dates.
- Completed cards support reopening by right swipe. Effort is hidden on cards, not removed from the data or allocation algorithm.
- Pending excludes locked missed turns. Missed turns are recorded separately. Completed counts use actual completion timestamps within the Monday 9am Pacific household week, including older overdue work finished during that week. The full record stays in History. Timestamps are displayed in the viewer's local timezone.
- Each trade option identifies its owner and deadline, including separate turns of a recurring chore. No ownership changes until the recipient confirms acceptance.

## Verification performed

Checked in the desktop in-app browser using an isolated local database. No live household assignments were changed for these checks.

- TypeScript and the production build.
- Light layouts at 320, 393, 430, 768, 1100, 1280, and 1440 CSS pixels: no horizontal document overflow; circular controls remain square; point labels are absent from chore cards; Pending starts expanded.
- Dark layouts at 320, 393, 768, and 1280 pixels: no horizontal overflow; pending and completed counts remain consistent.
- Partial and full right/left swipes, keyboard reveal and dismissal, completion confirmation/cancel, owner-only actions, disabled unopened turns, and separate missed turns.
- A local trade was requested, accepted after confirmation as the recipient, and its exact assignment moved to that recipient. The incoming navigation badge cleared. Completing that received turn changed Pending from 4 to 3 and Completed from 0 to 1; the record showed the recipient and local PDT time. A separate future turn of the same chore remained pending and disabled.
- People progress reflected the actual completion. Due Soon counted only one actionable chore, not the unopened turn. Clear Filters restored the complete list. Catalog search returned the matching chore; a nonmatching schedule showed an explicit empty state.
- Rich trade options and preference dropdowns were inspected on mobile. Preference controls have equal heights and centered trailing chevrons rather than a stretched icon column.

These are desktop-browser responsive checks, not physical iPhone/Safari verification. Touch inertia, installed-PWA behavior, and real push delivery still require device testing. The branch does not change the existing live deployment.
