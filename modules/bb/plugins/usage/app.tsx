// usage bb-plugin frontend: three views of one data feed (server.ts `overview`).
//  - a side-panel tab "Usage": this machine's plan windows, this session's turns, this lead's family
//  - a composer chip: the 5-hour window and the last turn, one glance, click for the tab
//  - a sidebar card: every machine's plan windows and the leads spending the most
// Numbers are per machine: each machine has its own Claude login, so there is no one global figure.
import React, { useEffect, useState } from "react";
import { definePluginApp, experimental_Icon as Icon, experimental_useAppPanel as useAppPanel, useComposer, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "./server";

type Tok = { input: number; output: number; cacheRead: number; cacheWrite: number; weighted: number; calls: number };
type Win = { key: string; label: string; status: string; resetsAtMs: number | null; usedPercent: number | null };
type Machine = {
  hostId: string; name: string; planLabel: string | null; windows: Win[]; status: string | null; activeSessions: number;
  extra: { usedUsdCents: number; limitUsdCents: number; usedPercent: number } | null;
  overage: { status: string | null; reason: string | null } | null;
  window5h: { startMs: number; tok: Tok; leads: { id: string; title: string; tok: Tok; sessions: number }[] } | null;
};
type Turn = { id: string; at: number; prompt: string; initiator: string; tok: Tok; model: string | null };
type Overview = {
  now: number; machines: Machine[]; limitsOk: boolean;
  thread: { id: string; title: string; machine: { hostId: string; name: string }; source: string; tok: Tok; turns: Turn[]; windowShare: { id: string; share: number | null }[] } | null;
  lead: { id: string; title: string; tok: Tok; rows: { id: string; title: string; status: string; depth: number; role: string; machine: string; source: string; tok: Tok; current: boolean }[] } | null;
};

// --- One shared feed, so the tab, chip and card don't each poll. ---
const feeds = new Map<string | null, { data: Overview | null; error: string | null; subs: Set<() => void>; timer: number | null; busy: boolean }>();
function useOverview(threadId: string | null): { data: Overview | null; error: string | null } {
  const rpc = useRpc<typeof rpcContract>();
  const [, bump] = useState(0);
  useEffect(() => {
    let feed = feeds.get(threadId);
    if (!feed) { feed = { data: null, error: null, subs: new Set(), timer: null, busy: false }; feeds.set(threadId, feed); }
    const f = feed;
    const sub = () => bump((n) => n + 1);
    f.subs.add(sub);
    const load = async () => {
      if (f.busy || document.visibilityState === "hidden") return;
      f.busy = true;
      try { f.data = (await rpc.call("overview", { threadId })) as Overview; f.error = null; }
      catch (e) { f.error = (e as Error).message; }
      f.busy = false;
      f.subs.forEach((s) => s());
    };
    if (f.timer === null) { void load(); f.timer = window.setInterval(load, 20_000); }
    else sub();
    return () => {
      f.subs.delete(sub);
      if (f.subs.size === 0 && f.timer !== null) { clearInterval(f.timer); f.timer = null; }
    };
  }, [threadId, rpc]);
  const f = feeds.get(threadId);
  return { data: f?.data ?? null, error: f?.error ?? null };
}

// --- Formatting ---
const compact = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n));
const clock = (ms: number) => new Date(Math.round(ms / 60_000) * 60_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (ms: number) => new Date(Math.round(ms / 60_000) * 60_000).toLocaleDateString([], { month: "short", day: "numeric" });
const resetText = (ms: number, now: number) => (ms - now > 20 * 3_600_000 ? `${day(ms)} ${clock(ms)}` : clock(ms));
function left(ms: number, now: number) {
  const m = Math.max(0, Math.round((ms - now) / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
/** Green, yellow from 70%, red from 90%: the old status line's thresholds. */
const tone = (p: number) => (p >= 90 ? "bg-red-500" : p >= 70 ? "bg-amber-500" : "bg-emerald-500");
const toneText = (p: number) => (p >= 90 ? "text-red-600 dark:text-red-400" : p >= 70 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400");
const WINDOW_MS: Record<string, number> = { five_hour: 5 * 3_600_000, seven_day: 7 * 24 * 3_600_000 };
const short: Record<string, string> = { five_hour: "5h", seven_day: "7d" };

// --- Bits ---
/** Splits a token total into what it costs: fresh input (+cache writes), output, cache reads. Segments are weighted, so they show where the spend went. */
const KINDS = [
  { key: "in", label: "input", dot: "bg-sky-500" },
  { key: "out", label: "output", dot: "bg-violet-500" },
  { key: "cache", label: "cache", dot: "bg-zinc-400 dark:bg-zinc-500" },
] as const;
function parts(t: Tok) { return [t.input + 1.25 * t.cacheWrite, 5 * t.output, 0.1 * t.cacheRead]; }
function StackBar({ t, scale, h = "h-2" }: { t: Tok; scale: number; h?: string }) {
  const p = parts(t);
  const total = p[0] + p[1] + p[2] || 1;
  const width = Math.max(1.5, Math.min(100, (t.weighted / scale) * 100));
  return (
    <div className={`${h} w-full overflow-hidden rounded-full bg-muted`}>
      <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${width}%` }}>
        {p.map((v, i) => <div key={i} className={KINDS[i].dot} style={{ width: `${(v / total) * 100}%` }} />)}
      </div>
    </div>
  );
}
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {KINDS.map((k) => <span key={k.key} className="flex items-center gap-1"><span className={`size-2 rounded-full ${k.dot}`} />{k.label}</span>)}
    </div>
  );
}

/** One plan window as a gauge: the used % big and coloured (green, amber from 70, red from 90) when known; otherwise the status, with the bar showing how much of the window has passed. */
function Gauge({ w, now }: { w: Win; now: number }) {
  const span = WINDOW_MS[w.key];
  const known = w.usedPercent !== null;
  const p = w.usedPercent ?? 0;
  const elapsed = span && w.resetsAtMs ? ((span - Math.max(0, w.resetsAtMs - now)) / span) * 100 : 0;
  const status = w.status === "blocked" ? "limit reached" : w.status === "warning" ? "near limit" : "ok";
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{short[w.key] ?? w.label}</span>
        {w.resetsAtMs ? <span className="text-[11px] tabular-nums text-muted-foreground">in {left(w.resetsAtMs, now)}</span> : null}
      </div>
      {known
        ? <div className={`text-3xl font-semibold leading-none tabular-nums ${toneText(p)}`}>{Math.round(p)}<span className="text-lg">%</span></div>
        : <div className={`text-xl font-semibold leading-none ${w.status === "blocked" ? "text-red-600 dark:text-red-400" : w.status === "warning" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`} title="Used % isn't available for this machine's account; the bar shows how much of the window has passed">{status}</div>}
      <div className="h-2 w-full overflow-hidden rounded-full bg-background">
        <div className={`h-full rounded-full ${known ? tone(p) : "bg-foreground/25"}`} style={{ width: `${Math.max(2, Math.min(100, known ? p : elapsed))}%` }} />
      </div>
      {w.resetsAtMs ? <span className="text-[11px] tabular-nums text-muted-foreground">resets {resetText(w.resetsAtMs, now)}{known ? "" : " · bar = time passed"}</span> : null}
    </div>
  );
}

function SectionHead({ title, value, sub }: { title: string; value?: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/70 pb-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {sub ? <span className="text-[11px] text-muted-foreground">{sub}</span> : null}
      </div>
      {value ? <div className="text-2xl font-semibold leading-tight tabular-nums">{value}</div> : null}
    </div>
  );
}

function TokLine({ t }: { t: Tok }) {
  const vals = [t.input + t.cacheWrite, t.output, t.cacheRead];
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
      {KINDS.map((k, i) => <span key={k.key} className="flex items-center gap-1"><span className={`size-1.5 rounded-full ${k.dot}`} />{compact(vals[i])}</span>)}
    </span>
  );
}

function MachineBlock({ m, now, compactMode = false }: { m: Machine; now: number; compactMode?: boolean }) {
  const top = m.window5h?.leads ?? [];
  const max = Math.max(1, ...top.map((l) => l.tok.weighted));
  return (
    <section className="flex flex-col gap-3">
      <SectionHead title={compactMode ? m.name : `Plan · ${m.name}`} sub={[m.planLabel, m.activeSessions > 0 ? `${m.activeSessions} running` : null].filter(Boolean).join(" · ") || undefined} />
      {m.windows.length ? <div className="grid grid-cols-2 gap-2">{m.windows.map((w) => <Gauge key={w.key} w={w} now={now} />)}</div>
        : <p className="text-xs text-muted-foreground">No plan window reported yet on this machine.</p>}
      {m.extra ? (
        <div className="flex items-baseline gap-2 text-sm">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">extra</span>
          <span className="text-lg font-semibold tabular-nums">${(m.extra.usedUsdCents / 100).toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">of ${(m.extra.limitUsdCents / 100).toFixed(0)}</span>
        </div>
      ) : m.overage?.status ? (
        <p className="text-xs text-muted-foreground">Extra usage: {m.overage.status}{m.overage.reason ? ` (${m.overage.reason})` : ""}. Spend isn't reported.</p>
      ) : null}
      {m.window5h ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">Spent on this machine, last 5h</span>
            <span className="text-lg font-semibold tabular-nums">{compact(m.window5h.tok.weighted)}</span>
          </div>
          <StackBar t={m.window5h.tok} scale={m.window5h.tok.weighted} h="h-2.5" />
          <TokLine t={m.window5h.tok} />
          {top.slice(0, compactMode ? 3 : 5).map((l) => (
            <div key={l.id} className="flex flex-col gap-1 pt-1">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-xs">{l.title}</span>
                <span className="text-sm font-semibold tabular-nums">{compact(l.tok.weighted)}</span>
              </div>
              <StackBar t={l.tok} scale={max} />
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

// --- The thread tab ---
function Unit() {
  return <p className="text-[11px] leading-snug text-muted-foreground">Weighted = input-token equivalents (output ×5, cache write ×1.25, cache read ×0.1). A comparison unit, not plan units.</p>;
}

function UsageTab({ threadId }: { threadId: string }) {
  const { data, error } = useOverview(threadId);
  if (error && !data) return <div className="px-3 py-3 text-sm text-destructive">{error}</div>;
  if (!data) return <div className="px-3 py-3 text-sm text-muted-foreground">Reading usage…</div>;
  const th = data.thread;
  const mine = data.machines.find((m) => m.hostId === th?.machine.hostId);
  const others = data.machines.filter((m) => m !== mine);
  const turns = (th?.turns ?? []).filter((t) => t.tok.calls > 0);
  const maxTurn = Math.max(1, ...turns.map((t) => t.tok.weighted));
  const share = new Map(th?.windowShare.map((s) => [s.id, s.share]) ?? []);
  const rows = data.lead?.rows ?? [];
  const maxRow = Math.max(1, ...rows.map((r) => r.tok.weighted));
  return (
    <div className="flex flex-col gap-7 px-3 py-3 pb-8">
      {mine ? <MachineBlock m={mine} now={data.now} /> : null}

      {th ? (
        <section className="flex flex-col gap-3">
          <SectionHead title="This session" value={compact(th.tok.weighted)} sub={`${th.tok.calls || ""}${th.tok.calls ? " model calls" : ""}`} />
          <StackBar t={th.tok} scale={th.tok.weighted} h="h-2.5" />
          <div className="flex items-center justify-between gap-2"><TokLine t={th.tok} /><Legend /></div>
          {th.source === "events" ? <p className="text-xs text-muted-foreground">This machine's transcripts aren't readable from the server; totals come from bb's per-run summary, with no per-turn detail.</p> : null}
          {th.source === "none" ? <p className="text-xs text-muted-foreground">No token data recorded for this session yet.</p> : null}
          <div className="flex flex-col">
            {turns.map((t) => {
              const s = share.get(t.id);
              const big = t.tok.weighted === maxTurn && turns.length > 1;
              return (
                <div key={t.id} className="flex flex-col gap-1.5 border-t border-border/60 py-2.5 first:border-t-0">
                  <div className="flex items-start gap-3">
                    <span className="min-w-0 flex-1 text-xs leading-snug line-clamp-2" title={t.prompt}>{t.prompt || "(turn)"}</span>
                    <span className={`flex-none tabular-nums ${big ? "text-lg font-bold" : "text-base font-semibold"}`}>{compact(t.tok.weighted)}</span>
                  </div>
                  <StackBar t={t.tok} scale={maxTurn} />
                  <div className="flex items-baseline justify-between gap-2">
                    <TokLine t={t.tok} />
                    <span className="flex-none text-[11px] tabular-nums text-muted-foreground">{clock(t.at)}{s != null && s >= 0.001 ? ` · ${s >= 0.1 ? Math.round(s * 100) : (s * 100).toFixed(1)}% of 5h` : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <Unit />
        </section>
      ) : null}

      {data.lead && rows.length > 1 ? (
        <section className="flex flex-col gap-3">
          <SectionHead title="Lead and team" value={compact(data.lead.tok.weighted)} sub={`${rows.length} sessions`} />
          <StackBar t={data.lead.tok} scale={data.lead.tok.weighted} h="h-2.5" />
          <TokLine t={data.lead.tok} />
          <div className="flex flex-col gap-2.5">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className={`min-w-0 flex-1 truncate text-xs ${r.current ? "font-semibold" : ""}`}>
                    {r.role === "lead" ? <span className="mr-1.5 rounded bg-foreground px-1 py-px text-[10px] font-semibold uppercase text-background">lead</span> : null}{r.title}{r.current ? " (this)" : ""}
                  </span>
                  <span className="flex-none text-sm font-semibold tabular-nums">{compact(r.tok.weighted)}</span>
                </div>
                <StackBar t={r.tok} scale={maxRow} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {others.length ? (
        <section className="flex flex-col gap-5">
          <SectionHead title="Other machines" />
          {others.map((m) => <MachineBlock key={m.hostId} m={m} now={data.now} compactMode />)}
        </section>
      ) : null}
    </div>
  );
}

// --- The sidebar card ---
function UsageCard() {
  const { data, error } = useOverview(null);
  if (error && !data) return <div className="p-3 text-sm text-destructive">{error}</div>;
  if (!data) return <div className="p-3 text-sm text-muted-foreground">Reading usage…</div>;
  return (
    <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto p-3">
      {data.machines.length ? data.machines.map((m) => <MachineBlock key={m.hostId} m={m} now={data.now} compactMode />) : <p className="text-sm text-muted-foreground">No sessions in the last 7 days.</p>}
    </div>
  );
}

// --- The composer chip ---
function UsageChip() {
  const composer = useComposer();
  const panel = useAppPanel();
  const threadId = composer.scope.kind === "thread" ? composer.scope.threadId : null;
  const { data } = useOverview(threadId);
  if (!threadId || !data?.thread) return null;
  const m = data.machines.find((x) => x.hostId === data.thread!.machine.hostId);
  const w = m?.windows.find((x) => x.key === "five_hour");
  const last = data.thread.turns[0];
  const pct = w?.usedPercent;
  const dot = !w ? "bg-muted-foreground/40" : w.status === "blocked" || (pct ?? 0) >= 90 ? "bg-red-500" : w.status === "warning" || (pct ?? 0) >= 70 ? "bg-amber-500" : "bg-emerald-500";
  const open = () => panel.openTab({ tab: { id: "usage", context: { kind: "thread" }, availability: "action" }, params: {} });
  return (
    <button type="button" onClick={open} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" title={`Usage · ${data.thread.machine.name}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      <span className={`tabular-nums ${pct != null ? toneText(pct) : ""}`}>5h{pct != null ? ` ${Math.round(pct)}%` : ""}{w?.resetsAtMs ? ` ↻${clock(w.resetsAtMs)}` : ""}</span>
      {last && last.tok.calls ? <span className="tabular-nums">· {compact(last.tok.weighted)}</span> : null}
    </button>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_tab({
    id: "usage", title: "Usage", icon: "ChartColumn", tooltip: "Plan windows, tokens per turn, session and lead",
    context: { kind: "thread" }, availability: "action", params: {}, layout: "flush",
    component: ({ threadId }: { threadId: string }) => <UsageTab threadId={threadId} />,
  });
  app.experimental_sidebarFooter.register({ kind: "disclosure", id: "usage", label: "Usage", icon: "ChartColumn", component: UsageCard });
  app.composer.customize({ id: "usage-chip", scopes: ["thread"], actions: [{ id: "chip", component: UsageChip }] });
});
