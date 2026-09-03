# Friday Meeting Prep — Booz Allen Notes (Director Demo)

**Audience:** You (briefing) → PM / Deputy PM / Director  
**Story:** OMIS / Global Defense / EUCOM multi-contract **central notes repository**  
**Build note:** Default plugins are **not** preloaded (except Simple Backup + Freehand Drawing). A **BAH Notes Demo** notebook is seeded on first launch. Install Outline / Note Overview / YesYouKan / Quick Links from Plugins before the meeting. **Markmap is optional** — the Friday Brief works as a scrollable Markdown outline; install Markmap only if you want a mind-map view.

---

## 1. Plugins to install

| Plugin | Joplin plugin ID | Store page |
| --- | --- | --- |
| **Markmap** (optional) | `de.fomin.markmap` | https://joplinapp.org/plugins/plugin/de.fomin.markmap/ |
| **Note Overview** | `io.github.jackgruber.note-overview` | https://joplinapp.org/plugins/plugin/io.github.jackgruber.note-overview/ |
| **Outline** | `outline` | https://joplinapp.org/plugins/plugin/outline/ |
| **YesYouKan** | `org.joplinapp.plugins.YesYouKan` | https://joplinapp.org/plugins/plugin/org.joplinapp.plugins.YesYouKan/ |
| **Quick Links** | `com.whatever.quick-links` | https://joplinapp.org/plugins/plugin/com.whatever.quick-links/ |
| **Simple Backup** | `io.github.jackgruber.backup` | Bundled by default in Booz Allen Notes / Joplin desktop — confirm under Tools → Options → Plugins. Usually no install needed. |

Optional already-bundled companion: **Freehand Drawing** (`io.github.personalizedrefrigerator.js-draw`) — not required for the Friday story.

---

## 2. Exact install steps (in the app)

1. Open **Booz Allen Notes**.
2. **Tools → Options → Plugins** (macOS: also available via app menu → Preferences → Plugins).
3. In the search box, type the plugin name (e.g. `Markmap`).
4. Click **Install** on the matching result.
5. Repeat for Note Overview, Outline, YesYouKan, and Quick Links.
6. **Restart the app** when prompted (or quit and relaunch) so plugins load.
7. Confirm each plugin shows as enabled under Plugins (and that Simple Backup is already listed).

If search fails (air-gapped / offline): download the `.jpl` from the store links above, quit the app, copy into the profile `plugins` folder, then restart.

---

## 3. Recommended notebook structure for the demo

On a **fresh profile**, this layout is created automatically as **BAH Notes Demo** (Friday Brief, Actions, dashboard, inbox stubs, OMIS/EUCOM context). No Markmap required — scroll the Friday Brief by headings; install Outline for side navigation.

If the seeded notebook is missing (existing profile), create a root notebook and nest as follows:

```
BAH Notes Demo
├── _Inbox                          ← email / SharePoint / meeting stubs land here
├── OMIS / Global Defense           ← durable program context
├── EUCOM (context)                 ← theater / adjacent context
├── Program Office / Friday Briefs  ← leadership-facing narrative
└── _Dashboards                     ← Note Overview rollups
```

**Seed notes (minimum):**

| Notebook | Note | Purpose |
| --- | --- | --- |
| Program Office / Friday Briefs | **Friday Brief — Director Demo** | Primary talking note (scroll headings / Outline; Markmap optional) |
| Program Office / Friday Briefs | **Actions — YesYouKan** | Kanban board for open asks |
| _Dashboards | **Open Asks / Recently Updated** | Note Overview search block |
| _Inbox | 2–3 stubs tagged `[Email]`, `[SharePoint]`, `[Meeting]` | Show ingest → brief flow |
| OMIS / Global Defense | One short context note | Link from Friday Brief via Quick Links (`@@`) |
| EUCOM (context) | One short context note | Same |

**Friday Brief body outline (copy into Markdown mode):**

```markdown
# Friday Brief — Director Demo

**Booz Allen Notes** · OMIS / Global Defense · Multi-contract central repository
*Audience: PM · Deputy PM · Director*

## Situation
### Why this exists
### Operating model
### Demo focus today

## Contracts
### OMIS / Global Defense
### Adjacent context — EUCOM
### Ingest sources (this week)

## Risks
### Knowledge fragmentation
### Dual-source of truth
### Leadership bandwidth

## Asks
### From Program Office
### From delivery teams
### From leadership

## Roadmap
### Near term
### Next
### Success signal
```

Heading levels (`#` / `##` / `###`) matter — Markmap and Outline both key off them.

---

## 4. How to use Markmap on the Friday Brief

1. Open **Friday Brief — Director Demo**.
2. Switch to **Markdown** editor mode (not Rich Text / WYSIWYG) if the toolbar icon is missing.
3. Trigger Markmap:
   - Toolbar **diagram / mind map** icon, or
   - Shortcut: **Cmd+Shift+M** (macOS) / Ctrl+Shift+M (Windows/Linux).
4. Walk the map: Situation → Contracts → Risks → Asks → Roadmap. Click nodes to collapse/expand.

### Caveats (be honest in the room)

- Markmap is a **manual install** on this build — it is not preloaded.
- On macOS, some Markmap versions have shown a **blank mind-map window** (iframe / `file://` quirks). If that happens:
  - Close the dialog, ensure Markdown mode, retry **Cmd+Shift+M**.
  - Close DevTools if open (known to interfere).
  - Fall back: walk the note with **Outline** sidebar + headings — same story, no mind map.
- Do not depend on Markmap as the only visual; Outline + the brief itself are the backup path.

---

## 5. Demo talking points (honest)

1. **Central repo (today):** One searchable workspace for program knowledge across contracts — not another SharePoint site, a working notes system of record for the Friday narrative.
2. **Ingest model:** Stubs in `_Inbox` (email / SharePoint / meeting) → durable notebooks → Friday Brief as the leadership story.
3. **Plugins as force multipliers (installed for demo):** Markmap for Director-level map; Outline for long notes; Note Overview for dashboards; YesYouKan for asks; Quick Links (`@@`) to wire notes together; Simple Backup already on.
4. **SharePoint / email next:** Integration is the roadmap, not a finished connector. Today we show the **shape** of ingest (stubs + tags), not live sync.
5. **Local LLM next:** AI assist (summarize briefs, draft asks) is intentional follow-on — call it out as next, not shipped for this meeting.
6. **Ask of leadership:** Confirm Friday Brief cadence/owners and notebook taxonomy so new contracts land in the same pattern.

---

## 6. Checklists

### Night before

- [ ] Booz Allen Notes launches; branding / welcome notes look correct.
- [ ] Plugins installed and enabled: Markmap, Note Overview, Outline, YesYouKan, Quick Links; Simple Backup present.
- [ ] Notebook tree + seed notes created; Friday Brief headings look good in Markdown mode.
- [ ] Markmap opens on Friday Brief (**or** Outline fallback rehearsed).
- [ ] YesYouKan Actions board opens; Quick Links `@@` inserts a link.
- [ ] Screen sharing / projector resolution checked; font size readable.
- [ ] Backup profile or export if you will wipe a test profile afterward.

### Day of

- [ ] Quit other noisy apps; open only Booz Allen Notes + slides if any.
- [ ] Start on Friday Brief; have Outline visible; Markmap hotkey ready.
- [ ] 60-second cold open: “central notes repo for OMIS / Global Defense / EUCOM — Friday story lives here.”
- [ ] Demo path: Brief → Markmap (or Outline) → Inbox stub → linked context note → Actions board → Dashboard.
- [ ] Close with asks + roadmap (SharePoint/email next, local LLM next) — no overclaim.
- [ ] Capture follow-ups in the Actions board before leaving the room.

---

## Launch (rebuild after code changes)

From the repo root (`BAH_Joplin`):

```bash
yarn install   # if needed
cd packages/app-desktop
yarn dist      # produces dist/mac-arm64/Booz Allen Notes.app
```

Open the rebuilt app:

```bash
open "packages/app-desktop/dist/mac-arm64/Booz Allen Notes.app"
```

Dev-mode launch (faster iteration, not the packaged binary):

```bash
cd packages/app-desktop
yarn start
```
