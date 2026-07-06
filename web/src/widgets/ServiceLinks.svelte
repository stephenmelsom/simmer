<script lang="ts">
  import { api } from "../lib/api";
  import type { Cached, LinkHealth } from "../lib/types";

  interface LinkItem {
    name: string;
    url: string;
    icon?: string;
    healthcheck?: boolean;
  }
  interface LinkGroup {
    name: string;
    items: LinkItem[];
  }

  let { settings, placementId }: { settings: Record<string, any>; placementId: number } = $props();

  let groups = $derived<LinkGroup[]>(Array.isArray(settings.groups) ? settings.groups : []);
  let hasHealthchecks = $derived(groups.some((g) => (g.items ?? []).some((i) => i.healthcheck)));

  let health = $state<Map<string, LinkHealth>>(new Map());

  async function refresh() {
    if (!hasHealthchecks) return;
    try {
      const res = await api<Cached<LinkHealth[]>>(`/api/widgets/links/health?placement=${placementId}`);
      health = new Map(res.data.map((h) => [h.url, h]));
    } catch {
      // Dots simply stay unknown; the links themselves still work.
    }
  }

  $effect(() => {
    refresh();
    const t = setInterval(refresh, 60_000);
    return () => clearInterval(t);
  });

  function isImageIcon(icon: string | undefined): boolean {
    return !!icon && (icon.startsWith("http") || icon.startsWith("/"));
  }
</script>

<section class="panel">
  <p class="eyebrow">SERVICES</p>

  {#if !groups.length}
    <p class="state-msg">No services yet — add link groups to this widget's settings to build your panel.</p>
  {:else}
    <div class="groups">
      {#each groups as group (group.name)}
        <div class="group">
          <p class="group-name">{group.name}</p>
          <ul>
            {#each group.items ?? [] as item (item.url)}
              {@const h = item.healthcheck ? health.get(item.url) : undefined}
              <li>
                <a href={item.url} target="_blank" rel="noreferrer">
                  <span class="icon">
                    {#if isImageIcon(item.icon)}
                      <img src={item.icon} alt="" />
                    {:else if item.icon}
                      {item.icon}
                    {:else}
                      <span class="mono-fallback data">{item.name.slice(0, 1).toUpperCase()}</span>
                    {/if}
                  </span>
                  <span class="name">{item.name}</span>
                  {#if item.healthcheck}
                    <span
                      class="dot"
                      class:up={h?.up}
                      class:down={h && !h.up}
                      title={h ? (h.up ? `Up · ${h.ms} ms` : `Down${h.status ? ` · HTTP ${h.status}` : ""}`) : "Checking…"}
                    ></span>
                  {/if}
                </a>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 14px;
    overflow-y: auto;
  }

  .group-name {
    font-family: var(--font-display);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--phosphor);
    margin: 0 0 6px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  a {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    border-radius: 4px;
    color: var(--chart-ink);
    font-size: 13px;
  }

  a:hover {
    background: color-mix(in srgb, var(--bezel-line) 55%, transparent);
    text-decoration: none;
    color: var(--phosphor);
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

  .icon img {
    max-width: 100%;
    max-height: 100%;
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
  }

  .dot {
    margin-left: auto;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
    background: var(--chart-ink-dim);
  }
  .dot.up {
    background: var(--vfr);
    box-shadow: 0 0 5px var(--vfr);
  }
  .dot.down {
    background: var(--ifr);
    box-shadow: 0 0 5px var(--ifr);
  }
</style>
