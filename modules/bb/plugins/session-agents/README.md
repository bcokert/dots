# Session agents

Makes bb's session list say who runs each session and how sessions relate. It decorates bb's own sidebar (and the
phone's "Recent" list); if bb's markup changes, rows just look normal. Unloading the plugin removes every mark.

## What the marks mean

- **Agent icon:** house = a machine with your own login, briefcase = a work machine, solid terminal = a Host agent, HUD ring = Claire (a machine matching `claireMachines`)
  (runs directly on a computer). A crown or branch arrow on it marks a lead running a team, or a worker.
- **Groups:** inside a project, sessions sit under a small label with a coloured bar. Health first, then the other
  groups, then everything else. Every group gets its label, even with one session.
- **Group families:** a group started by Bdon is a root and gets its own colour. A group spawned from a session in
  another group (directly or deeper) belongs to that root's family and takes its colour; the family is one flat list.
  Dashes along the top of the label show the position: none for the root, one for the first spawned group, two for
  the second (by first session's start), and so on. Order: families by their root's start, oldest first, each root
  followed by its descendants. A spawner whose group isn't in the list makes its group a root. Health stays first and red.
- **Spawned by:** a session spawned by another sits right under it, indented one step per level, with a ↳. Hover
  for who spawned it.
- **Health:** a red pulse in place of the agent icon. The tooltip still names the agent.
- **Urgent / blocking:** a flat tinted row and an icon. Blocking (red, stop sign): the spawner can't proceed
  without it. Urgent (amber, bolt): it fixes something critical. Hover for the reason. It stays until the session is
  archived or cleared.
- **Waiting on Bdon:** a small hourglass beside the title of a session that is idle (not running, not archived) but
  still holds `doing::` todo claims: it stopped and is parked, not abandoned. Hover: the claimed todos, up to five.
  Claims come from the todo app's API (`/api/claims`), polled every 60 s; with no Access token configured there are no marks.
- **Phase pips:** a session titled `<job> · phase N` shows one small square per phase in the job's colour. Past
  phases are filled, the current one is open and glows. Hover: "<job>: phase N of M". The title shows just the job name.
- **Subagents:** a pip per subagent of the latest turn, and a dim row per running one.
- Header reads "Sessions · <label>", projects stay most-recently-used, and a session's top bar starts with where it runs.

## Where tags come from

All state-derived, nothing from titles except the phase numbers.

- **Spawner:** bb's own parent session if there is one, else the `--spawned-by` tag.
- **Group:** the session's tag, else its spawner's (up the chain), else its job's (any phase with a group), else none.

## CLI

```bash
bb session-agents tag [--thread <id>] [--group <name>] [--spawned-by <id>] [--priority urgent|blocking|none] [--reason <text>]
bb session-agents show [--thread <id>]
```

- `--thread` defaults to the session running the command. Tagging another session defaults `--spawned-by` to the
  caller, so a lead can tag what it starts: `bb session-agents tag --thread <child> --priority blocking --reason "<why>"`.
- Only the options you pass change. `--group ""` clears the group, `--priority none` clears priority and reason.
- Tags are this plugin's thread metadata. The app polls them every 15 s.

## Checks

`node derive.test.mjs` covers group inheritance, spawner precedence, the header rule, ordering, pips and the waiting rule.

## How the list is ordered

bb's list is React-managed, so rows are never moved in the DOM: the project's list becomes a flex column and each
row gets a CSS `order`; indent is padding, and a group label is `::before` on its first row. The sidebar renders a
project's rows in a plain list (no absolute positioning), so this holds; a list that mixes projects only gets marks.
