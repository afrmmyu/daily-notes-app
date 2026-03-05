# daily_notes

A local daily notes application with a hacker/terminal aesthetic. Built on a Python/Flask backend, it stores each note as a plain Markdown file that you can read, edit, and port without the app.

---

## Screenshots

> Dark terminal theme — amber headings, green accents, monospace everywhere.

```
┌─────────────────────────────────────────────────────────────────┐
│  // daily_notes                                                 │
│  ┌──────────────────┐  ┌──────────────────────────────────────┐ │
│  │ [search notes..] │  │ > 2026-03-05                   ▶  ✕ │ │
│  │ + note           │  │ ─────────────────────────────────── │ │
│  │ ─────────────── │  │ [ todo ]                             │ │
│  │ ▶ Q1 Planning   │  │  ☐ Review PRs                   ×   │ │
│  │ ─────────────── │  │  ☑ Write tests (struck through)      │ │
│  │ · 2026-03-05    │  │  [+ add todo...]                     │ │
│  │ · 2026-03-04    │  │ ─────────────────────────────────── │ │
│  │ · 2026-03-03    │  │ [ notes ]                            │ │
│  └──────────────── │  │ [+ add entry]                        │ │
│                    │  │                                      │ │
│                    │  │ ### 15:32:07                         │ │
│                    │  │ Started debugging the websocket...   │ │
│                    └──┴──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

### Daily Notes
- One note per day, auto-created on first open each morning
- **To-do list** at the top — add items by typing and pressing Enter
- **Uncompleted todos carry forward** automatically to the next day's note
- Completed todos stay archived in the day they were finished

### Rich Text Notes Section
- WYSIWYG editor powered by [TipTap](https://tiptap.dev/) (ProseMirror-based)
- Click **+ add entry** to insert a timestamped block (`### HH:MM:SS`)
- Paste or drag-and-drop images directly into the editor
- Bold, italic, code, code blocks, lists, blockquotes, links — full rich text

### Ad-hoc Notes
- Create freeform notes at any time with **+ note**
- No to-do section — just a rich text canvas
- Rename them inline by clicking the title
- Pin any ad-hoc note to keep it at the top of the sidebar

### Sidebar
- All notes listed by date (newest first), pinned notes float to the top
- **Live search** across note titles, todo text, and body content (250 ms debounce)
- Visual distinction between daily notes and ad-hoc notes
- Pin/unpin and delete from the note header

### File System
- Every note is a `.md` file in `notes/` — open them in any text editor
- Images stored under `images/{note-slug}/`
- Human-readable YAML frontmatter + Markdown body (no proprietary format)
- The app is just a viewer/editor — your data is always yours

---

## Note Format

Each note is a Markdown file with YAML frontmatter:

```markdown
---
title: "2026-03-05"
date: "2026-03-05"
type: daily
pinned: false
todos:
  - id: "todo-1741234567-abc"
    text: "Review PRs"
    completed: false
  - id: "todo-1741234568-def"
    text: "Write deployment script"
    completed: true
---

<!-- TODOS_END -->

### 15:32:07

Started debugging the websocket reconnect logic. The timeout was set too low —
bumping to 30s and adding exponential backoff.

### 16:04:55

Merged the image upload PR. Images now land in `images/{slug}/` with
timestamp-suffixed filenames to avoid collisions.
```

### Frontmatter fields

| Field | Type | Description |
|---|---|---|
| `title` | string | Display name; defaults to `YYYY-MM-DD` for daily notes |
| `date` | string | ISO date of creation |
| `type` | `daily` or `adhoc` | Controls whether the todo section appears |
| `pinned` | boolean | Whether the note is pinned to the top of the sidebar |
| `todos` | array | Todo items (only meaningful for daily notes) |
| `todos[].id` | string | Unique ID: `todo-{timestamp}-{random}` |
| `todos[].text` | string | The todo text |
| `todos[].completed` | boolean | `true` = checked off; never carries to the next day |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.9+ · Flask |
| Frontend | Vanilla HTML / CSS / JavaScript (no build step) |
| Rich text | [TipTap v2](https://tiptap.dev/) via [esm.sh](https://esm.sh) CDN |
| Markdown serialization | [tiptap-markdown](https://github.com/aguingand/tiptap-markdown) |
| Note parsing | [python-frontmatter](https://github.com/eyeseast/python-frontmatter) |
| Image uploads | Flask + Werkzeug (`secure_filename`) |

---

## Project Structure

```
daily_notes_app/
├── server.py               # Flask server — all API routes + static file serving
├── requirements.txt        # Python dependencies
├── notes/                  # Flat .md note files (auto-created)
│   ├── 2026-03-05.md
│   └── adhoc-1741234567890.md
├── images/                 # Uploaded images, one subdirectory per note slug
│   └── 2026-03-05/
│       └── screenshot-1741234567890.png
└── public/                 # Browser frontend (no build step)
    ├── index.html
    ├── css/
    │   └── theme.css       # Hacker terminal theme
    └── js/
        ├── app.js          # Central state, init, auto-save
        ├── api.js          # fetch() wrappers for all API endpoints
        ├── editor.js       # TipTap wrapper (Markdown in/out, image drop)
        ├── todos.js        # Todo panel (frontmatter-backed, not in editor)
        ├── sidebar.js      # Sidebar rendering, search, pin events
        └── notes-section.js  # "Add Entry" button
```

---

## API Reference

All routes are served on `http://localhost:3000`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/today` | Ensure today's daily note exists; runs todo carry-over. Called on app init. |
| `GET` | `/api/notes` | List all notes (metadata). Accepts `?q=` for full-text search. |
| `GET` | `/api/notes/:slug` | Get a note's full content (frontmatter + body). |
| `PUT` | `/api/notes/:slug` | Save a note (create or update). |
| `POST` | `/api/notes` | Create a new ad-hoc note. |
| `DELETE` | `/api/notes/:slug` | Delete a note and its images. |
| `PATCH` | `/api/notes/:slug/pin` | Toggle pin status. |
| `POST` | `/api/images/:slug` | Upload an image (multipart/form-data, 10 MB max). |
| `GET` | `/images/:slug/:filename` | Serve a stored image. |

---

## Installation

### Requirements
- Python 3.9 or later
- pip

### Setup

```bash
git clone https://github.com/afrmmyu/daily-notes-app.git
cd daily-notes-app

pip install -r requirements.txt

python3 server.py
```

The app opens automatically in your default browser at `http://localhost:3000`.
Press `Ctrl+C` to stop the server.

### First run

On first open, the server creates:
- `notes/` — directory for note files
- `images/` — directory for uploaded images
- `notes/YYYY-MM-DD.md` — today's daily note (empty, no todos yet)

### Daily use

Just run `python3 server.py` each time. The app will:
1. Check if today's daily note exists
2. If not, create it and carry over any uncompleted todos from the most recent previous day
3. Open in your browser and show today's note

---

## Usage Guide

### Writing daily notes

1. The to-do list is at the top. Type in the input field and press **Enter** to add an item.
2. Check off a todo to mark it done — it will stay in today's note but won't appear tomorrow.
3. Click **+ add entry** to append a timestamped block to the notes section. Start typing.
4. Notes auto-save 1 second after you stop typing.

### Adding images

Paste an image from your clipboard (`Cmd+V`) or drag and drop a file directly into the notes editor. The image is uploaded to the server and embedded inline.

### Ad-hoc notes

Click **+ note** in the sidebar. The new note opens with the title selected — type a name and press Enter to rename it. Ad-hoc notes have no todo section, just a rich text area.

### Pinning notes

Click the **▶** button in the note header to pin it. Pinned notes appear at the top of the sidebar above all daily notes.

### Searching

Type in the search bar at the top of the sidebar. Results filter live across note titles, todo text, and note body content.

---

## Theme

The UI uses a terminal/hacker aesthetic inspired by classic TTY interfaces:

- **Background**: near-black `#0a0a0a`
- **Body text**: warm off-white `#e8d5a3`
- **Headings / dates**: amber `#f5a623`
- **Accents / active states**: terminal green `#4af626`
- **Font**: JetBrains Mono (with Fira Code, Cascadia Code, Courier New as fallbacks)
- No rounded corners, no gradients, no shadows — just flat, minimal, monospace

---

## License

MIT
