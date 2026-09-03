import Note from './models/Note';
import Folder from './models/Folder';
import Setting from './models/Setting';
import { Dispatch } from 'redux';
import { FolderIconType } from './services/database/types';

interface DemoFolderSpec {
	key: string;
	title: string;
	parentKey?: string;
	emoji: string;
	selectByDefault?: boolean;
}

interface DemoNoteSpec {
	title: string;
	folderKey: string;
	body: string;
	selectByDefault?: boolean;
}

const folderSpecs: DemoFolderSpec[] = [
	{ key: 'root', title: 'BAH Notes Demo', emoji: '🗂️', selectByDefault: true },
	{ key: 'inbox', title: '_Inbox', parentKey: 'root', emoji: '📥' },
	{ key: 'omis', title: 'OMIS / Global Defense', parentKey: 'root', emoji: '🛡️' },
	{ key: 'eucom', title: 'EUCOM (context)', parentKey: 'root', emoji: '🌍' },
	{ key: 'friday', title: 'Program Office / Friday Briefs', parentKey: 'root', emoji: '📋' },
	{ key: 'dashboards', title: '_Dashboards', parentKey: 'root', emoji: '📊' },
];

const fridayBriefBody = `# Friday Brief — Director Demo

**Booz Allen Notes** · OMIS / Global Defense · Multi-contract central repository
*Audience: PM · Deputy PM · Director*

---

## Situation

### Why this exists
- One searchable workspace for program knowledge across contracts
- Replace scattered email / SharePoint / meeting notes with a durable record
- Give leadership a repeatable Friday narrative: Situation → Contracts → Risks → Asks → Roadmap

### Operating model
- **Ingest** stubs land in \`_Inbox\` (email | SharePoint | meeting)
- **Program notebooks** hold durable context (OMIS / Global Defense, EUCOM)
- **Friday Briefs** are the leadership-facing story
- **Dashboards** roll up status with Note Overview

### Demo focus today
- Plugins (install from Tools → Options → Plugins if needed): Note Overview, Outline, YesYouKan, Quick Links; Simple Backup is bundled
- Scroll this note by # / ## / ### headings; keep **Outline** open for navigation
- Optional: install Markmap later from Plugins if you want a mind-map view

## Contracts

### OMIS / Global Defense
- Central repository thesis for multi-contract delivery
- Shared vocabulary for risks, asks, and milestones
- See notebook: **OMIS / Global Defense**

### Adjacent context — EUCOM
- Theater context that informs sequencing and dependencies
- See notebook: **EUCOM (context)**

### Ingest sources (this week)
- Email → \`[Email] EUCOM RFI — logistics window\`
- SharePoint → \`[SharePoint] OMIS CDRL register excerpt\`
- Meeting → \`[Meeting] Global Defense sync — 29 Aug\`

## Risks

### Knowledge fragmentation
- Decisions trapped in inboxes and slide decks
- Mitigation: inbox stubs + Friday Brief as the system of record

### Dual-source of truth
- SharePoint registers vs. working notes diverge
- Mitigation: link out from stubs; keep narrative here

### Leadership bandwidth
- Directors need the map, not the archive
- Mitigation: Outline plugin + clear heading structure on this brief

## Asks

### From Program Office
- Confirm Friday Brief cadence and owners
- Approve notebook taxonomy for new contracts

### From delivery teams
- Route ingest to \`_Inbox\` with source tags
- Keep YesYouKan actions current before Friday

### From leadership
- Review this brief via headings / Outline in Director reviews
- One ask list per brief — no side channels

## Roadmap

### Near term
- Seed contracts with inbox → brief workflow
- Dashboards via Note Overview for open asks / updated notes

### Next
- Sync profile (when approved) for PM / Deputy / Director
- Expand EUCOM and OMIS context notes from real artifacts

### Success signal
- Friday review runs from **this note** + Outline + Actions board
`;

const actionsBoardBody = `# Actions — YesYouKan

Leadership and program actions for the Friday Brief cycle.

# ⏰ To Do

## Confirm Friday Brief owners
PM / Deputy PM assign who drafts vs. who briefs the Director.

## Route this week's ingest
Move email / SharePoint / meeting stubs from \`_Inbox\` into program notebooks after triage.

## Refresh Note Overview dashboard
Open \`_Dashboards\` and update search scopes if notebook titles change.

# 🚀 In Progress

## OMIS repository narrative
Align contract language in the Friday Brief Situation and Contracts sections.

## EUCOM context stub
Capture theater dependencies that affect Global Defense sequencing.

# 🎉 Done

## Seed BAH Notes Demo notebooks
Inbox, OMIS, EUCOM, Friday Briefs, and Dashboards created for Director demo.

## Bundle default plugins
Note Overview, Outline, YesYouKan, Quick Links, Simple Backup (Markmap optional via Plugins).

\`\`\`kanban-settings
# Do not remove this block
\`\`\`
`;

const dashboardBody = `# Note Overview — Demo Dashboard

Use the **Note Overview** built-in plugin to refresh the tables below (command palette → Note Overview, or the plugin toolbar action).

## Open items across the demo

\`\`\`
<!-- note-overview-plugin
search: notebook:"BAH Notes Demo"
fields: title, updated_time, notebook
alias: updated_time AS Updated, title AS Title, notebook AS Notebook
sort: updated_time DESC
limit: 25
-->
\`\`\`

## Inbox ingest stubs only

\`\`\`
<!-- note-overview-plugin
search: notebook:"_Inbox"
fields: title, updated_time
alias: updated_time AS Updated, title AS Title
sort: title ASC
-->
\`\`\`

## How to present
1. Open **Friday Brief — Director Demo** (Markdown editor — not Rich Text)
2. Scroll the brief by section headings (# / ## / ###)
3. Keep **Outline** open for heading navigation (install from Plugins if needed)
4. Open **Actions — YesYouKan** and use the eye icon for the kanban board
5. Optional later: install Markmap from Plugins if a mind-map view is useful
`;

const omisContextBody = `# OMIS / Global Defense — context

Working notebook for the **OMIS / Global Defense** multi-contract story in Booz Allen Notes.

## Purpose
- Durable home for contract context that feeds the Friday Brief
- Link out to authoritative SharePoint / email sources from \`_Inbox\` stubs

## Current threads
- Central repository for program knowledge across contracts
- Shared risk / ask language with Program Office
- Dependencies called out from EUCOM context

## Ingest pointers
- SharePoint CDRL excerpt (inbox stub)
- Global Defense sync notes (inbox stub)
`;

const eucomContextBody = `# EUCOM operating picture (stub)

Theater context that informs OMIS / Global Defense sequencing.

## Why it sits beside OMIS
- External dependencies and logistics windows
- RFI traffic that should not live only in email

## This week
- See \`[Email] EUCOM RFI — logistics window\` in \`_Inbox\`
`;

const emailStubBody = `# [Email] EUCOM RFI — logistics window

**Source:** email
**From:** EUCOM J4 (simulated)
**Received:** 2026-08-28
**Status:** Ingest stub — triage into EUCOM / Friday Brief

## Summary
Request for updated logistics window affecting Global Defense movement planning.

## Why it is here
Demonstrates email → \`_Inbox\` → program notebook → Friday Brief flow in Booz Allen Notes.

## Next
- [ ] Tag owner
- [ ] Link into Friday Brief Risks / Asks if still open by Friday
`;

const sharepointStubBody = `# [SharePoint] OMIS CDRL register excerpt

**Source:** sharepoint
**Library:** OMIS Program / CDRLs (simulated)
**Captured:** 2026-08-27
**Status:** Ingest stub

## Excerpt
CDRL items relevant to knowledge management and deliverable tracking for Global Defense.

## Why it is here
Shows SharePoint register → Notes ingest without replacing the authoritative register.

## Next
- [ ] Confirm which CDRLs belong in the Friday Brief Contracts section
`;

const meetingStubBody = `# [Meeting] Global Defense sync — 29 Aug

**Source:** meeting
**Attendees:** PM, Deputy PM, OMIS leads (simulated)
**Date:** 2026-08-29
**Status:** Ingest stub

## Decisions
- Friday Brief remains the Director-facing narrative
- Actions tracked in YesYouKan board under Program Office

## Follow-ups
- Publish asks before COB Thursday
- Fold EUCOM RFI into Risks if unanswered

## Why it is here
Meeting notes as first-class ingest alongside email and SharePoint.
`;

const noteSpecs: DemoNoteSpec[] = [
	{ title: 'Friday Brief — Director Demo', folderKey: 'friday', body: fridayBriefBody, selectByDefault: true },
	{ title: 'Actions — YesYouKan', folderKey: 'friday', body: actionsBoardBody },
	{ title: 'Note Overview — Demo Dashboard', folderKey: 'dashboards', body: dashboardBody },
	{ title: 'OMIS / Global Defense — context', folderKey: 'omis', body: omisContextBody },
	{ title: 'EUCOM operating picture (stub)', folderKey: 'eucom', body: eucomContextBody },
	{ title: '[Email] EUCOM RFI — logistics window', folderKey: 'inbox', body: emailStubBody },
	{ title: '[SharePoint] OMIS CDRL register excerpt', folderKey: 'inbox', body: sharepointStubBody },
	{ title: '[Meeting] Global Defense sync — 29 Aug', folderKey: 'inbox', body: meetingStubBody },
];

class DemoNotebookUtils {

	public static async install(dispatch: Dispatch) {
		if (Setting.value('demo.wasBuilt')) return;

		const folderIds: Record<string, string> = {};
		let selectedFolderId: string = null;
		let selectedNoteId: string = null;

		for (const spec of folderSpecs) {
			const folder = await Folder.save({
				title: spec.title,
				parent_id: spec.parentKey ? folderIds[spec.parentKey] : '',
				icon: Folder.serializeIcon({
					emoji: spec.emoji,
					name: '',
					dataUrl: '',
					type: FolderIconType.Emoji,
				}),
			});
			folderIds[spec.key] = folder.id;
			if (spec.selectByDefault) selectedFolderId = folder.id;
		}

		for (const spec of noteSpecs) {
			const note = await Note.save({
				parent_id: folderIds[spec.folderKey],
				title: spec.title,
				body: spec.body,
			});
			if (spec.selectByDefault) {
				selectedNoteId = note.id;
				selectedFolderId = folderIds[spec.folderKey];
			}
		}

		Setting.setValue('demo.wasBuilt', true);

		if (selectedFolderId) {
			dispatch({ type: 'FOLDER_SELECT', id: selectedFolderId });
			Setting.setValue('activeFolderId', selectedFolderId);
		}
		if (selectedNoteId) {
			dispatch({ type: 'NOTE_SELECT', id: selectedNoteId });
		}
	}
}

export default DemoNotebookUtils;
