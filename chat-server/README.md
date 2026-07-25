# Driverse chat server

A tiny local server that serves a chat UI and answers questions about this
repo (Supabase schema, content pipeline, etc.) using the `claude` CLI.

## Run

```bash
node chat-server/server.js
```

Then open http://localhost:3131.

Set `PORT` to use a different port.

## How it works

- `GET /` serves the chat UI (`chat-server/public/index.html`), a scrollable
  message list plus a text input.
- `POST /ask` takes `{ message, history }`, folds `history` into a single
  prompt, and runs `claude -p <prompt>` with the repo root as the working
  directory, so `claude` picks up the root `CLAUDE.md` (Supabase schema +
  content repo context) automatically. The CLI is restricted to read-only
  tools (`Read,Grep,Glob`) so it can look things up in the repo but never
  edits anything.
- The reply is returned as plain text and rendered client-side as Markdown
  (see `public/markdown.js`), so tables and lists in the response display
  cleanly.
- Conversation history is kept in `sessionStorage` in the browser (per tab);
  it's sent back on each request so follow-up questions have context from
  earlier in the chat. "Clear conversation" wipes it.

## Requirements

- Node.js (no npm dependencies).
- The `claude` CLI installed and authenticated on your machine.
