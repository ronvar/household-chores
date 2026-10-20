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
