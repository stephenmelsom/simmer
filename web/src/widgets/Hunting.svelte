<script lang="ts">
  interface Season {
    name: string;
    icon?: string;
    start: string; // "YYYY-MM-DD"
    end: string; // "YYYY-MM-DD"
    note?: string;
  }

  type Status = "open" | "upcoming" | "closed";

  interface Row extends Season {
    status: Status;
    startDate: Date;
    endDate: Date;
  }

  let { settings }: { settings: Record<string, any> } = $props();

  let title = $derived<string>(typeof settings.title === "string" ? settings.title : "HUNTING");
  let source = $derived<string | undefined>(typeof settings.source === "string" ? settings.source : undefined);
  let seasons = $derived<Season[]>(Array.isArray(settings.seasons) ? settings.seasons : []);

  // Parse "YYYY-MM-DD" as a local calendar date (avoids UTC-parse off-by-one).
  function parseDate(s: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  const RANK: Record<Status, number> = { open: 0, upcoming: 1, closed: 2 };

  let rows = $derived.by<Row[]>(() => {
    const today = new Date();
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const out: Row[] = [];
    for (const s of seasons) {
      const startDate = parseDate(s.start);
      const endDate = parseDate(s.end);
      if (!startDate || !endDate) continue;
      const status: Status = now < startDate ? "upcoming" : now > endDate ? "closed" : "open";
      out.push({ ...s, startDate, endDate, status });
    }
    return out.sort((a, b) => {
      if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status];
      // Open: soonest to close first. Otherwise: soonest to open first.
      const key = a.status === "open" ? "endDate" : "startDate";
      return a[key].getTime() - b[key].getTime();
    });
  });

  let openCount = $derived(rows.filter((r) => r.status === "open").length);

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function fmt(d: Date): string {
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }
  function statusLabel(r: Row): string {
    if (r.status === "open") return "OPEN";
    if (r.status === "upcoming") return `opens ${fmt(r.startDate)}`;
    return "closed";
  }
</script>

<section class="panel">
  <header>
    <p class="eyebrow">{title}</p>
    <span class="tally" class:live={openCount > 0}>{openCount} IN SEASON</span>
  </header>

  {#if !rows.length}
    <p class="state-msg">No seasons configured — add a seasons list to this widget's settings.</p>
  {:else}
    <ul>
      {#each rows as r (r.name)}
        <li class:open={r.status === "open"} class:closed={r.status === "closed"}>
          <span class="icon">
            {#if r.icon}{r.icon}{:else}<span class="mono-fallback data">{r.name.slice(0, 1).toUpperCase()}</span>{/if}
          </span>
          <span class="name">
            {r.name}
            {#if r.status === "open"}<span class="badge">OPEN</span>{/if}
            {#if r.note}<span class="note">{r.note}</span>{/if}
          </span>
          <span class="range data">{fmt(r.startDate)} – {fmt(r.endDate)}</span>
          <span
            class="dot"
            class:open={r.status === "open"}
            title={statusLabel(r)}
          ></span>
        </li>
      {/each}
    </ul>
  {/if}

  {#if source}
    <a class="source" href={source} target="_blank" rel="noreferrer">NCWRC ↗</a>
  {/if}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 4px;
  }

  .eyebrow {
    margin: 0;
  }

  .tally {
    font-family: var(--font-display);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--chart-ink-dim);
    flex: none;
  }
  .tally.live {
    color: var(--vfr);
    text-shadow: 0 0 6px color-mix(in srgb, var(--vfr) 60%, transparent);
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
  }

  li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    border-radius: 4px;
    font-size: 13px;
    color: var(--chart-ink);
  }
  li.closed {
    color: var(--chart-ink-dim);
  }
  li.open {
    background: color-mix(in srgb, var(--vfr) 12%, transparent);
    box-shadow: inset 2px 0 0 var(--vfr);
  }

  .badge {
    font-family: var(--font-display);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.14em;
    padding: 1px 5px;
    border-radius: 3px;
    color: var(--panel-black);
    background: var(--vfr);
    flex: none;
  }

  .icon {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    flex: none;
  }

  .mono-fallback {
    color: var(--phosphor);
    font-size: 12px;
  }

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .note {
    font-size: 10px;
    color: var(--chart-ink-dim);
    white-space: nowrap;
  }

  .range {
    margin-left: auto;
    font-size: 11px;
    color: var(--chart-ink-dim);
    flex: none;
    white-space: nowrap;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
    background: var(--chart-ink-dim);
  }
  .dot.open {
    background: var(--vfr);
    box-shadow: 0 0 5px var(--vfr);
  }

  .source {
    align-self: flex-end;
    margin-top: 6px;
    font-family: var(--font-display);
    font-size: 9px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--chart-ink-dim);
  }
  .source:hover {
    color: var(--phosphor);
    text-decoration: none;
  }
</style>
