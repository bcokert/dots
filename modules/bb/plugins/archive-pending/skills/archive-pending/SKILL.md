---
name: archive-pending
description: When a session's job is finished, end with Archive / Keep buttons and mark it (bb archive-pending mark) so its row shows it's waiting to be archived.
---

# Finished sessions ask to be archived

The user has the archive-pending bb-plugin. A session whose job is done shows an amber archive mark in the session
list until it's archived, or until the user writes to it again (any new turn clears the mark).

When the job is finished (the work is done and verified, nothing is waiting on the user):

1. Run `bb archive-pending mark` (it marks the session running the command).
2. End the final message with two buttons, Archive and Keep (a genui `Card` with `Button("Archive")` and
   `Button("Keep")`; without genui, ask in one line).

Their answer arrives as a new message, which already cleared the mark:

- **Archive:** run `bb thread archive --self` and reply in one line. Nothing after that.
- **Keep:** say so in a line. Leave it unmarked.

Don't mark a session that is waiting on the user (a question, a step for them to do), that failed, or that is a
worker whose lead will check it. `bb archive-pending status` and `bb archive-pending clear` exist for fixing a
wrong mark.
