---
name: archive-pending
description: When a session's job is finished, end with one Archive button and mark it (bb archive-pending mark) so its row shows it's waiting to be archived.
---

# Finished sessions ask to be archived

The user has the archive-pending bb-plugin. A session whose job is done shows a green archive mark in the session
list until it's archived or the user writes to it again. The mark is derived from state: it counts only if it was set after the latest user message, so writing to the session hides it and marking again in the new turn shows it again.

When the job is finished (the work is done and verified, nothing is waiting on the user):

1. Run `bb archive-pending mark` (it marks the session running the command).
2. End the final message with one button, Archive (a genui `Card` with just `Button("Archive")`, and no other
   question in that message; without genui, ask in one line). A lone answer button sends at once, so one tap
   archives. No Keep button: writing anything else to the session already clears the mark.

- **Archive** arrives as a new message: run `bb thread archive --self` and reply in one line. Nothing after that.
- Anything else: the mark no longer counts (it predates that message); carry on, and mark again when the job is finished.

Don't mark a session that is waiting on the user (a question, a step for them to do), that failed, or that is a
worker whose lead will check it. `bb archive-pending status` and `bb archive-pending clear` exist for fixing a
wrong mark.
