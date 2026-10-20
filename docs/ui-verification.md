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

## Shared cards and history scope

- History defaults to Everyone independently of the Overview person filter. Filter completions by recorded completer, falling back to the assignee only when no completer ID exists. Include inactive household members in the picker.
- Validate Everyone and each person against distinct completion fixtures, including an assignment completed by someone other than its current owner. Check filtered Board log counts and empty states separately.
- Chore records in Overview, History, Me, and Household use `HouseholdCard` and shared spacing, minimum height, radius, typography, and watermark tokens. Additional record details may increase height; never truncate timestamps or chore names to force a fixed height.
- Mobile navigation has four evenly spaced items and no detached add button. Household retains Add chore. Check 320px as well as the larger mobile breakpoint.
- Local follow-up: independent History filters returned all three people, then one correct completer per selection using isolated temporary fixtures. Light and dark layouts in all four tabs had no horizontal overflow at 320, 393, 768, and 1280px. Temporary fixtures were removed afterward; production data was not changed.

## Weekly completion history and Board changes

- Both completion sections default to the current household week. Each picker selects exactly one of five periods: this week or one, two, three, or four weeks ago. Periods use actual completion time, not the chore's original due date, and run Monday 9am Pacific to the next Monday 9am Pacific.
- Board changes only includes trade requests/responses/cancellations, chore additions/removals, and edits containing an effort-point change. Completion, reopen, profile, preference, people, schedule-only, and automatic allocation messages remain stored but are hidden from this view.
- Follow-up checks passed: 18 event inclusion/exclusion cases, exact Monday cutoff boundaries, the fall daylight-saving transition, and five disjoint completion weeks. Local browser fixtures verified current, last, and four-weeks-ago results without mixing periods; Overview's picker independently started at This week. Fixtures were removed after checking. Responsive history controls fit at 320, 393, and 1280px.

## Completion card badges

- History and Overview completion records share `CompletedChoreCard`: larger profile image and title/name text, with right-aligned status and local timestamp badges. Dates are MM/DD/YY; the timezone abbreviation is omitted from the visible time.
- Lateness is measured against the original household deadline in Pacific time: On time through the deadline day, Late for one through six days, then whole weeks late. Device-local date/time presentation must not change the deadline calculation.
- Local checks passed for on-time, late, one/two weeks late, Pacific midnight, and daylight-saving boundaries. Both themes were inspected. At 320, 393, and 1280px, avatars measured 44/48px, text did not overlap badges, and there was no horizontal overflow. Temporary completion fixtures were restored afterward.
