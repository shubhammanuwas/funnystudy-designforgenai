# Semester Project Part 2 — Iteration 1

## User persona

**Nadia is a fictional composite adult research participant**, not the project owner. She is willing to take part in a humor study but may be interrupted, may not remember whether she completed the setup steps, and may return later on a different device or browser session. She needs a clear explanation of what remains to be done and a reliable way to continue where she stopped.

## Problem

The existing experience did not make setup progress and study status clear in one place. A participant who left during a study could lose their place, while labels such as “In progress” did not tell them what would happen when they returned. This added uncertainty and made it harder to complete a study.

## Working first version

- Added a home-page checklist for profile completion, notification preferences, and demographics. Each step reports its current state and provides a continuation link when action is needed.
- Made study actions explicit: **Start study**, **Resume study**, and **View results**. Required setup steps prevent starting or resuming an unfinished study until they are addressed.
- Added a database-backed study checkpoint containing the caption order, current position, and run-level timing/view information. A returning participant resumes at the saved caption; completed studies still show their saved results.
- Kept study progress writes authenticated with the participant's JWT and validated the checkpoint in both application and database code.
- Improved the setup checklist's responsive layout and contrast so status badges no longer crowd step titles on narrower screens.
- Initially added a read-only archive for ended public studies at `/previous-studies`, with paginated caption browsing that did not start participation or write votes, bookmarks, or progress. A later follow-up added participant-only editing of heart votes in studies the participant had entered; see the Iteration 2 update for the current behavior.

This version covers every feature in the proposal: onboarding status is summarized by the home checklist; active study cards distinguish new, in-progress, and completed studies; an in-progress card shows the saved caption position and a Resume action; and finishing/reopening a completed study displays the saved Study Stats summary. No proposal item remains unimplemented in the current first-version scope.

## First PM review and feedback

**Pending — not yet collected.** The working version still needs to be demonstrated to the PM. No feedback is recorded here because a review has not yet taken place.

After the demonstration, record specific observations:

- **Usefulness:** Did the participant progress checklist and resume action solve a real problem?
- **Clarity:** Could the reviewer tell what setup remained and whether a study was new, in progress, or completed?
- **Behavior:** Did resuming return to the expected caption and preserve the expected run progress?
- **Feedback/quote:** _Add the PM's actual words or observed behavior._

## Changes planned next

1. Replace this pending section with the PM's actual feedback and prioritize the most important issue.
2. Refine the progress labels, helper text, and resume position presentation if the PM or participant finds them unclear.
3. Test interruption and return scenarios with the PM: after setup, after a vote, after moving to another caption, and after reopening a completed study.
4. Use the review to choose the next iteration's improvement rather than adding unrelated features.

## Implementation and verification

The first version updates the home dashboard and study flow, adds the `study_participations.progress` field and authenticated save function, and adds application and SQL regression coverage. In a follow-up requested improvement, the home page also links to the read-only previous-study archive. The anonymized teaching-data dump was restored to the newly configured empty Supabase project and verified at 95 tables, 836,827 rows, 261 foreign keys, and 90 policies. [The resumable progress migration](../supabase/migrations/20261105153000_add_resumable_study_progress.sql) was applied to that project.

Checks run:

- `npm run test:demographics` — passed.
- `npm run test:images` — passed.
- `npm run test:settings` — passed.
- `npm run lint` — passed with one existing `<img>` optimization warning in `src/components/SwipeVoteCard.tsx`.
- `npm run build` using Node 24/npm 11 — passed.

The rollback-only database test in `supabase/tests/study_participations.sql` passed against the restored project after correcting the restored participation-table grants and qualifying the `progress` column in the SQL test. The test rolls back its fixture data.

After adding the archive, `npm run test:demographics` passed with 37 tests; focused ESLint and `npm run build` passed. The archive loader regression verifies ended-public-study filtering and caption pagination. Its local route redirects unauthenticated visitors to sign-in.
