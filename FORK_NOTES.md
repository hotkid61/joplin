# Fork Notes: BAH Joplin

This repository is a fork of Joplin, maintained as a Booz Allen Hamilton branded distribution.

## Scope of Divergence

- Rebrand of user-facing names and metadata to "Booz Allen Notes".
- Platform identifier migration for desktop, Android, iOS, and clipper surfaces.
- Release pipeline namespace migration for fork-owned repositories and Docker images.
- Server/web default URL and copy updates for BAH-operated domains.

## Upstream Attribution and License

- Upstream project attribution is intentionally preserved in git history and retained legal files.
- AGPL licensing and bundled third-party notices remain in place.
- This fork does not remove or rewrite required attribution records.

## Branding assets

- Demo branding kit (colors, interim product SVG/PNG, official CDN logos for demo, packaging notes): `Assets/BahNotes/README.md`
- Demo packaging is wired for desktop electron-builder + mobile Android/iOS/web icons (see `Assets/BahNotes/docs/packaging_apply.md`).
- Production/store releases still need Brand Portal–approved masters and legal review before external distribution.

## Update Policy

- Periodically rebase/merge from upstream Joplin after compatibility review.
- Re-run `yarn verifyRebrand` after every upstream sync to catch identifier regressions.
- Keep this document current when divergence grows beyond branding and namespace changes.

## Note Graph LLM enrichment (demo / local LLM)

The installed Note Graph plugin can call the **chat** model (`joplin.ai` → `/v1/chat/completions`) to label notes and edges. That competes with AI Chat for GPU time in LM Studio.

**Keep demos quiet (recommended):**

1. **Tools → Options → Note Graph** (or **Settings → Note Graph**)
2. Turn **off** **Enable LLM analysis** / enriching notes (`noteGraph.llmEnrichmentEnabled`)
3. Leave **Enable AI-based semantic analysis** on if you still want local e5 similarity edges (those do **not** hit LM Studio)

**Manual labels only:** use **Retry AI enrichment** in Note Graph settings when you explicitly want labels. Do not leave LLM enrichment enabled during chat-heavy demos.

Dev profile: the Joplin desktop config dir under `~/.config/` for this fork’s dev build; plugin setting key ends with `noteGraph.llmEnrichmentEnabled`.
