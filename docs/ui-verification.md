# Chore board release checks

Before publishing calendar or chore-row changes:

- Use a read-only snapshot of the current household response, not only invented assignments. Intercept mutations during browser checks; never complete or reassign real chores for testing.
- Independently calculate weekly completion totals for each person and everyone. Use completion time within the Monday 9am Pacific household week, including older overdue assignments finished during that week. Keep all-time records available in History.
- Everyone’s week and household progress include current-week assignments plus older assignments completed in the household week, once per assignment. Completed work credits the recorded completer. Verify done count, denominator, effort points, percentage, and undo; unfinished older backlog stays separate and must not affect new-work allocation.
- Check boundaries immediately before and after Monday 9am, including daylight-saving transitions, and exclude invalid or missing completion timestamps.
- Test single-day, multi-day, full-week, early, missed, and overdue carry-over windows. Single-day windows must still have a visible track.
- Measure every mobile track against its row: identical left/right insets and thickness regardless of day count, evenly spaced markers, centered labels, matching endpoint markers for multi-day windows, and a centered marker for single-day windows. Check vertical track-to-caption and caption-to-divider spacing as well.
- Check emoji center coordinates against the button center in both axes. Hidden hover checkmarks must not occupy a second grid row. Verify hover, touch, disabled, confirming, completed, and undo states.
- Inspect screenshots of both pending and expanded Completed sections at 320, 393, 430, 768, 1100, and 1440px. Check equal card insets, row alignment, clipped text, navigation overlap, and horizontal overflow.
- Verify Calendar/List persistence after reload, person and effort filters, empty states, trade controls, owner-only completion, confirmation/cancel, and completion/undo count updates.
- Trade pickers must identify each occurrence by deadline and exclude missed or completed turns. Verify request and acceptance both reject a closed turn without swapping owners, including a request that expires while pending. Valid accepted swaps must appear for both participants after refresh in Calendar and List.
- Verify displayed local timestamps independently from the UTC source. Keep deadline calculations in Pacific time.
- Run TypeScript and production-build checks. Record which browsers and device sizes actually passed; do not describe desktop emulation as physical iPhone verification.
- Swipe rows: test a small drag that snaps closed, partial reveal, full swipe, direction reversal, outside dismissal, scrolling, cancellation, and keyboard alternatives. Right is green completion/reopen; left is blue trade. Full completion swipes must still require confirmation before sending a mutation.
- Swipe permissions must match button permissions: another person’s chores and missed turns cannot be completed or traded; unopened turns cannot be completed. Recheck ownership when live data changes during confirmation. Test save failure and retry without losing the pending confirmation.
- Pending starts expanded, Completed is a separate collapse, and completed chores must not also appear in the pending list. Completion and reopening update both counts and household progress. Check these in Calendar and List; both support swipes, with no visible point labels or right-side action buttons on chore cards.
- In both themes, inspect computed action-button backgrounds after revealing each swipe: completion is `rgb(52, 199, 89)` and trade is `rgb(0, 122, 255)`. Card-surface rules must never target action buttons via their `tabindex` attributes.
- Inspect dark sidebar, preferences (including a new unsaved row), dropdown selections, filter-menu items, editor forms, notification controls, history, and confirmation surfaces. Intentional profile colors and semantic action colors remain distinct from card backgrounds.

## Theme and swipe follow-up verification

- Local in-app browser: light and dark layouts measured at 320, 393, 768, and 1280px without horizontal overflow.
- Confirmed green completion reveal and blue trade reveal, including a native left drag on the 393px layout; no completion or trade mutations submitted.
- Visually inspected dark Me, preference-strength popup, Household, Add chore modal, and History. Watermarks are 120px on mobile and 132px on desktop, shifted inward horizontally and cropped vertically at card edges.
- TypeScript, production build, and whitespace checks pass. Physical iPhone/Safari verification remains outstanding.
