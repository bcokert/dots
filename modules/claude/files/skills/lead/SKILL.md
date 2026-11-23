---
name: lead
description: How a lead session plans, delegates and checks a job. Use when starting a multi-part job, proposing slices, writing a subagent brief, picking a model or budget, or handing off to the next phase (a sibling session). The rules themselves are in the global AGENTS.md ("Leads"); this is the how.
---

# Leading a job

The global AGENTS.md has the rules. This is how to follow them without thinking about it.

## The shape of every job

1. **Understand.** Restate the ask in a line. Unclear: ask, decision-shaped. Complex: grill until the edges are sharp.
2. **Break it down up front.** One todo per slice in a nested namespace (the todo app's README), all claimed. The
   progress bar's steps are those todos' names.
3. **Propose** with the card below: who does each slice, model, effort, budget, and which could run in parallel.
   Small job: skip the card, say "doing it" and do it.
4. **Delegate** to subagents one after another (parallel only where Bdon ticked it). Do the small and
   judgment-heavy slices yourself.
5. **Check** in proportion, check off each todo the moment it's done, move the bar.
6. **Close or hand off.** Phase over, or your context past about half: hand off to a sibling (below).

## The proposal card

Copy [proposal-card.html](proposal-card.html) into an `app` fence and edit only its `SLICES` list. Model is colour
(Fable gold, Opus violet, Sonnet blue, Haiku green), effort is the border (dashed low, thin medium, thick high, glow
max), budget is a chip, and Bdon ticks which slices may run in parallel. His choice lands in his message box.
Check it with `check_ui` before sending. No genui in the session: a short table with the same columns.

## Who does what

| Model | Use it for | Agent tool `model` |
|---|---|---|
| Haiku | Search, inventories, mechanical edits, extracting data, first-pass checks | `haiku` |
| Sonnet | A well-briefed build or fix, UI work with screenshots, a focused review | `sonnet` |
| Opus | The lead: planning, design calls, integration, decisions. A subagent only for a hard design question | `opus` |
| Fable | The hardest reasoning, or when Bdon asks | `fable` |

The lead runs on Opus at high effort and stays out of bulk work.

## A subagent brief

A subagent knows only its brief. Write it so a weaker model could follow it:

```text
You're a subagent of a lead session (<thread id>, project <name>). <One line: the job.>

## Objective        what to deliver, for whom, and why it matters to Bdon
## Context          paths, what already exists, the reference to copy, decisions already made
## Done when        checkable: "tsc clean, plugin reloaded, screenshot at desktop and phone shows X"
## Boundaries       which files it may touch; no commits (the lead commits); what's off-limits
                    (credentials, other machines, other people's work in the same tree)
## Verify           exactly how (commands, URLs, screenshot sizes, tool quirks on this box)
## Budget           a time box in tool calls (it can count those), plus rough tokens
## Report           short: what changed (files), decisions made, how it was checked, what's uncertain
```

Run it in the background (`run_in_background`) unless the next step needs it, so Bdon can keep talking to you.
When the report comes back, it's evidence, not proof: check in proportion.

## Budgets

Give tokens as the usage panel counts them, and a time box in tool calls, since a subagent can't see its own
token spend. Reference points:

- One Sonnet subagent building a UI feature with screenshots: ~80k tokens, ~30 tool calls, ~5 min.
- The same kind of work as a child session: 0.3 to 1.9M tokens. The overhead is the session itself, which is why
  subagents are the default.

Past budget: stop and ask, with where it stands.

## Parallel

Only when Bdon opts in on the card, and say what it saves in time and costs in tokens. This box has 4 cores: at
most 2 parallel workers that use a browser, one browser each, closed when done. Headless Chromium here needs
`--no-sandbox --disable-gpu`.

## The next phase is a sibling

When a phase ends or your context passes about half, start a fresh session instead of compacting:

1. Write the handoff to a file: the goal, decisions made (with why), where it stands, the next slices, and links
   to the todos (by name). Enough that the new session never needs this transcript.
2. Start it in the same project, titled `<job> · <phase>`:
   `bb thread spawn --project <id> --environment "$BB_ENVIRONMENT_ID" --title "<job> · <phase>" --prompt-file <handoff>`
   (`--environment`: without it bb tries a worktree, and worktrees may be off)
   (or bb's Handoff in the app). No `--parent-self`: it's a sibling, not a child.
3. Release your todo claims for what the sibling takes over (it claims them with its own `thread::`), mark your
   bar done, and tell Bdon the new session's name with a link (`@thread:<id>`).

## Child sessions: the exception

Only when Bdon would want to open and steer that piece himself, it must outlive you, or it needs another machine:

`bb thread spawn --project <id> --environment <env id or path> --parent-self --lifecycle-owner-thread "$BB_THREAD_ID" --model <model> --reasoning-level <level> --title "<slice>" --prompt-file <brief>`

Same brief. It sets `role:: worker` and `thread::` on its todo. Archive it (`bb thread archive <id>`) once its
work is reviewed and committed.
