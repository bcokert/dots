---
name: lead
description: How a lead session plans, delegates and checks a job. Use when starting a multi-part job, proposing slices, writing a subagent brief, picking a model or budget, or handing off to the next phase (a sibling session). The rules themselves are in the global AGENTS.md ("Leads"); this is the how.
---

# Leading a job

The global AGENTS.md has the rules. This is how to follow them without thinking about it.

## The shape of every job

1. **Understand.** Restate the ask in a line. Unclear: ask, decision-shaped. Complex: grill until the edges are sharp.
2. **Break it down up front.** One todo per slice in a nested namespace, all claimed the todo app's way
   (its README, "Who does what").
3. **Propose** with the card below: who does each slice, model, effort, budget, and which could run in parallel.
   Small job: skip the card, say "doing it" and do it.
4. **Delegate** to subagents: in parallel where the card left it ticked, the rest one after another. Do the small and
   judgment-heavy slices yourself.
5. **Check** in proportion, check off each todo the moment it's done.
6. **Close or hand off.** Phase over, or your context past about half: hand off to a sibling (below).
7. **Leave no orphans.** Before you archive, the pass below. Never release a claim to nobody.

## Before you archive

Walk every list you worked in (and, if no other live session in your group is left, the whole project):

- **Live session on it?** Its claim stays.
- **Next phase's work?** It's named in the handoff file and the sibling claims it first thing.
- **Later, no session yet?** You're the project's lead until you archive: keep it, or hand it to the lead still running
  in the group (`bb thread tell`). Don't spawn a new session for it while others in the group are still open.
- **Waiting on Bdon?** `owner:: bdon`, and your last message lists it with why.

**Sessions you started** get the same pass. One still open: stay open, or make sure it has its own group tag (its
project's, or yours if it's the same work: `bb session-agents tag --thread <id> --group "<group>"`) and tell it
it's that group's lead now. Keep its `--spawned-by` as history: the list only nests a row under a spawner in the same
group, so the tag never pulls it out of its group. Never archive over a session that's still running under you
without a group of its own: it would end up flat in a catch-all with nobody watching it.

Your last message lists where every open todo and every session you started went. Then the Archive button.

## The proposal card

Copy [proposal-card.html](proposal-card.html) into an `app` fence and edit only its `SLICES` list. Model is the whole
box's colour (Fable gold, Opus violet, Sonnet blue, Haiku green), effort is the border (dashed low, thin medium, thick
high, glow max), budget is a chip. No key under the cards: each card already says its model and effort in words (Bdon 2026-11-23). Every slice that can safely run
alongside the others gets `parallel: true`, which the card pre-ticks (Bdon 2026-11-23: subagents don't have child
sessions' problems in parallel); he unticks to serialise. His choice lands in his message box.
Check it with `check_ui` before sending. No genui in the session: a short table with the same columns.

A design choice inside the job (layout, UI, look) goes in the same `app` block, above the cards: a before/after
mockup with toggle chips per option (recommended first, the "after" redraws live, one line of trade-off under it),
and the one button writes the plan plus every pick (Bdon 2026-11-24: decides faster seeing it than reading options).

## Tagging sessions

The session list (session-agents bb-plugin) groups, nests and flags sessions from tags. At the start of a job, tag
your own session with its group, the todo project's name: `bb session-agents tag --group "<project>"`. The group is
the project the session works in, as narrow as the work (Design system, not Clarity). Work scattered across
projects (a todo review) spawns into each piece's own group, never one catch-all. After every spawn, tag the new
session:

`bb session-agents tag --thread <new id> --group "<project>" [--priority blocking|urgent --reason "<one line>"]`

- `--spawned-by` defaults to you, which nests the new row under yours (a child is nested anyway). A next-phase
  sibling passes `--spawned-by ""`: phases are linked by their pips, not nested.
- **blocking**: you can't go on until Bdon deals with it. **urgent**: it fixes something critical. Neither for
  ordinary work. Clear it when it no longer holds: `bb session-agents tag --thread <id> --priority none`.
- `bb session-agents show [--thread <id>]` reads the tags.

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
                    files for a session on another machine (a pod): handed over so it can open them
                    (on the Clarity host: `clarity-handoff <files>`, then its printed lines verbatim), never a
                    path only the sender's machine can see
```

Run it in the background (`run_in_background`) unless the next step needs it, so Bdon can keep talking to you.
When the report comes back, it's evidence, not proof: check in proportion.

## Budgets

Give tokens as the usage panel counts them, and a time box in tool calls, since a subagent can't see its own
token spend. Reference points:

- A Sonnet subagent building a UI slice with desktop and phone Playwright screenshots: 125k to 170k tokens, 35
  to 75 tool calls (Release 2 of the life dashboard, 5 slices). Tight briefs ("grep + targeted reads") didn't get
  one under ~125k.
- A data script with tests and a mapping that takes judgment: ~135k.
- A small server change checked with curl: ~50k.
- A UI slice as a child session: 0.3 to 1.9M tokens. The overhead is the session itself, which is why
  subagents are the default.

Past budget: stop and ask, with where it stands.

## Parallel

The default for subagents, pre-ticked on the card; his go is the opt-in. Say what it saves in time and costs in tokens. This box has 4 cores: at
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
   Then tag it: `bb session-agents tag --thread <new id> --group "<project>" --spawned-by ""`.
3. Release your todo claims for what the sibling takes over (it claims them itself, the todo app's way), and tell Bdon
   the new session's name with a link (`@thread:<id>`).

## Child sessions: the exception

Only when Bdon would want to open and steer that piece himself, it must outlive you, or it needs another machine:

`bb thread spawn --project <id> --environment <env id or path> --parent-self --lifecycle-owner-thread "$BB_THREAD_ID" --model <model> --reasoning-level <level> --title "<slice>" --prompt-file <brief>`

Same brief, and tag it (above). A child on another machine than yours (a Host session spawned from a pod) can't
open your thread storage, nor you its: its brief says how files come back (on the Clarity host, `clarity-handoff`,
which hands them to its spawner). It claims its todo as a worker, the todo app's way (its README, "Who does what"). Archive it
(`bb thread archive <id>`) once its work is reviewed and committed.
