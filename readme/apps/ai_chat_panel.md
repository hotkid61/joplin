# AI chat panel

The AI chat panel is a sidebar attached to the note editor that lets you ask questions about the note you're working on, or ask for changes to be made to it. Replies appear in the panel; requested edits are applied directly to the note.

The panel is built on top of [AI chat](https://github.com/laurent22/joplin/blob/dev/readme/apps/ai_chat.md) — once that's set up, the panel works automatically.

## Opening the panel

There are three ways to open it:

- Click the chat icon in the note toolbar (top-right, above the editor).
- Press **Cmd+Shift+I** on macOS or **Ctrl+Alt+I** on Linux / Windows.
- Drag the right edge to resize, like any other Joplin panel.

The panel opens on the right of the editor. Its width and visibility are remembered across sessions.

The toolbar icon only appears when **Enable AI features** is on in Settings → AI.

## Asking about the open note

Type a question in the input box and press **Enter** (or click the send button). The model answers in the chat. For example:

- *"Summarise this in three bullet points."*
- *"What is this note saying about pricing?"*
- *"Are there any open questions I haven't answered?"*

The whole note is sent as context. If the note is too large for the model, you'll get a message asking you to select the relevant part instead.

## Asking for changes

You can also ask for edits to the note itself:

- *"Rewrite this paragraph in a more formal tone."*
- *"Add a heading above this and a one-line summary below it."*
- *"Fix the typos."*
- *"Add a short paragraph about how bees navigate."*

The model replies with a short message in the chat and applies the edits to the note. A small note under the assistant's reply tells you how many edits were applied. To undo, use **Ctrl/Cmd+Z** in the editor — chat-applied edits go on the normal editor undo stack.

If an edit can't be placed automatically (for example, the model tried to replace some text that you'd already changed), the chat tells you how many edits were skipped. You can ask the model to try again, or apply the change manually.

## Working on a selection

To scope a request to part of the note, select that part in the editor first, then send your message. Examples:

- Select a sentence and ask *"reword this"*.
- Select a code block and ask *"add comments"*.
- Select a heading and ask *"add a short intro paragraph below"*.

When you have a selection, the model only sees that selection — the rest of the note is not sent. This is the recommended way to work on long notes.

## Sticky conversations and switching notes

The conversation stays open as you move between notes. When you switch notes, a small marker appears in the chat (*"— now viewing: New Note —"*) so you can see the context shifted. The model is told about the *currently active* note on each new message, never a previous one.

This is useful when you're working through several related notes in a notebook — you can keep one conversation going across them.

To start fresh, click **Reset** in the panel header. Closing and reopening the panel keeps the conversation. Restarting Joplin clears it.

## Privacy

The panel only ever sends the **currently open note** (or your selection within it). It never reads or sends any other note.

The first time you send a message to a remote provider (anything other than Joplin Cloud AI), the panel shows a one-time notice telling you which provider your note is about to be sent to. Click *"Don't show again"* to dismiss it.

Encrypted notes can't be used with the panel — it tells you so when you try.

For more on what counts as remote and how to control that, see [AI chat → Local vs remote](https://github.com/laurent22/joplin/blob/dev/readme/apps/ai_chat.md).

## Agent mode (desktop)

Settings → AI → **Agent: can search and edit notes** lets the chat call workspace tools (search, read, create, update — never delete).

When Agent mode is on, the chat header shows an **Agent** badge and a **Tools** menu. Open Tools to toggle which tools the model may call (preferences are saved). Write tools (`create_note`, `update_note`) are labeled clearly. Only enabled tools are sent to the model.

Use the **Model** control in the chat header (next to Agent / Tools / Reset) to switch models. For OpenAI-compatible endpoints it loads `GET /v1/models` (e.g. LM Studio). If listing fails, type a custom model id. The choice is saved to Settings → AI → Model.

Tool calling must be supported by the model. In **LM Studio**, some models fail with a server-side **Channel Error** when `tools` are present (prompt-template / function-calling incompatibility). The app retries once without tools and shows a notice in the chat. Prefer a tool-capable model, or turn Agent mode off for models that reject tools.

Long `create_note` bodies can take several minutes on local models. The app uses an extended request timeout for chat completions and, if a write succeeded but the final reply failed, still shows a local success line such as `Created note: {title} (id …)`.

The agent must not claim create/update/revert success without a successful tool result in that turn. If it narrates success without calling a write tool, the app nudges it to call the tool, and if it still claims success, replaces the reply with a clear "not applied" message and a warning in the panel.

<!-- cSpell:disable -->
Example that often works for tools in LM Studio: `qwen3.6-27b`. Models such as `gemma-4-31b-it` commonly hit Channel Error when `tools` are included.
<!-- cSpell:enable -->

## Conversation persistence

Completed chat turns are auto-appended to a note under the **`_AI Chats`** notebook in your vault (created on first send). Each Reset starts a new transcript note. Transcripts are searchable, included in backups, and local — recommended for OMIS demos over in-memory-only chat.

The live panel conversation is still kept in memory while the app is running (survives panel hide/show). Restarting the app clears the panel UI, but transcript notes remain in the vault.

## Limitations of the current version

- **Markdown editor only.** The rich text (WYSIWYG) editor doesn't support the chat panel's automatic edits yet.
- **No streaming.** Long replies appear all at once when the model has finished, not progressively.
- **Panel UI history is in-memory.** The sidebar conversation clears on restart; vault transcripts under `_AI Chats` persist.
- **Very large notes.** Notes that exceed the model's context window can't be sent in full; select the relevant section and ask about that.
