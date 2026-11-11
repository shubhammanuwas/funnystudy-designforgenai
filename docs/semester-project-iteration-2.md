# Semester Project Part 3 — Iteration 2 Progress Update

## Project and user

- **Repository:** funnystudy
- **Primary user:** Nadia, a fictional composite adult humor-study participant. She is not the project owner. She wants to understand what the study asks her to do, respond honestly to captions, and continue without friction if interrupted.
- **User-centered hypothesis to validate:** Nadia should be able to like captions she finds funny without feeling forced to label every other caption as a dislike. If she is unsure or does not find a caption funny, she needs to know whether she can simply move on.

This persona is a design hypothesis, not a participant interview result. The next review should validate it with the PM and, if permitted, actual participants.

## Feedback received

The PM's feedback was shared in paraphrase by the student; the review round and date have not yet been confirmed:

> The site is good, but the UI could be better. The student asked why the humor-study experience has no dislike function. The PM said the team had removed it and asked the student to consider why it was removed and whether keeping it would be good for the user.

No reason for the team's decision has been verified yet. This update does not claim the feedback is from the required second PM review.

## What changed after Iteration 1

The study welcome instructions now explicitly say that participants can move on without voting if a caption is not funny or they are unsure. This small, user-centered revision clarifies the existing heart-only interaction without adding a negative vote or changing the study instrument, saved vote data, or database schema.

The current working version adds two explicit participant controls:

- **Next caption** advances through the same navigation path as swipe, scroll, and arrow-key navigation. It does not submit a like or a negative vote. The button appears beside the heart action, including on captions without images.
- **Pause and return** saves the current study checkpoint before navigating home. Voting and caption navigation are held while the save is pending. If the checkpoint save fails, the participant stays in the study and sees the save error, so the control does not silently discard the requested pause.

These controls are a user-focused usability refinement, not a confirmed response from the PM. They preserve the existing study data and completion flow.

The previous-study archive lets any signed-in user update their own heart response on an ended public study. They can remove an earlier like, restore it, or add a like to a caption they had skipped; a study participation record is not required. New archived likes are stored as study votes; timing is left unmeasured, and an already-saved completion stats snapshot remains unchanged.

The codebase already contains vote-value types and mappings for several older rating choices, including negative values; their presence in the schema does not establish why the study UI removed those controls or whether they should return. The active study UI currently saves the heart action as `funny`; moving to another caption is not a dislike vote.

## User-perspective analysis of the dislike question

There are plausible reasons both to omit and to include a dislike option. They need validation rather than assumption.

**Potential benefit of no dislike control**

- Keeps the participant's task simple: affirm captions they find funny and move past the rest.
- Does not equate “not funny,” “not my style,” “I did not understand it,” “I am unsure,” and “I dislike this” as one negative response.
- Avoids pressuring participants to give a negative rating when the research may only need positive preferences or skip behavior.

**Potential benefit of an explicit negative control**

- Could capture a useful distinction if the research question needs explicit positive and negative ratings.
- Might feel more complete to participants who expect to rate every caption rather than leave some unmarked.

**Questions for the PM/research team before changing vote behavior**

1. What research question should a negative vote answer?
2. Why was the control removed: participant confusion, data quality, protocol change, implementation cost, or another reason?
3. Should “not funny” be distinct from “didn't understand,” “not sure,” or simply moving on?
4. Does the current study protocol and analysis expect an explicit negative response, or are unliked captions intentionally left unclassified?
5. How should the UI explain the choice without changing how participants interpret the study?

## Working version and local checks

- The study welcome page clarifies that liking is optional for captions that are not funny or are uncertain.
- Participants can use an explicit **Next caption** action or existing gestures and keyboard controls; moving on does not save a negative vote.
- Participants can use **Pause and return** to save their current position and return to the dashboard. The pause only navigates away after the checkpoint save succeeds.
- Signed-in users can update their own heart responses in any ended public study, including adding a like to a caption they skipped. Vote editing does not rewrite a saved Study Stats snapshot.
- The underlying vote behavior is unchanged: heart likes remain positive votes, and navigation without a like does not submit a dislike.
- `npm run test:demographics`: 41 passed.
- `npm run test:images`: 6 passed.
- `npm run test:settings`: 34 passed.
- `npm run lint`: passed with one existing `<img>` optimization warning in `src/components/SwipeVoteCard.tsx`.
- `npm run build`: passed using Node 24/npm 11.
- Authenticated study interactions were not browser-tested because a signed-in test session was not available; the automated participant-flow tests and production build pass.

## Second PM review and deployment

- **Second PM demonstration and feedback:** Pending. The updated version still needs to be shown to the PM. Add the PM's actual feedback here after the review; do not infer acceptance from the current discussion.
- **Vercel application URL:** Not deployed yet. `http://localhost:3002` is a local development address and is not a substitute for the Vercel URL requested by the assignment.

## Next steps

1. Demonstrate the optional-like instruction, **Next caption**, **Pause and return**, and previous-study like editing to the PM; ask whether the controls make the participant's choices and ability to resume/revise clearer.
2. Observe whether a participant can move on without voting, pause/resume, and revise or add a past like without help. Record actual observations rather than guessed persona details.
3. Ask the PM/research team why the dislike option was removed and what the study needs to measure before implementing any negative rating.
4. If explicit negative feedback is required, agree on its meaning and data mapping with the PM before changing the UI, telemetry, tests, or database. Otherwise, retain the optional-like model and validate that the instructions are clear.
5. Deploy after review to Vercel, test the intended signed-in workflow on the deployed URL, and add that URL here.
6. Record the second PM review, the specific changes prioritized from that feedback, and any remaining usability questions.
