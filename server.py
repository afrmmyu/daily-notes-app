#!/usr/bin/env python3
"""Daily Notes — Flask backend server."""
from __future__ import annotations

import os
import glob
import shutil
import time
import webbrowser
import threading
from datetime import date
from pathlib import Path
from werkzeug.utils import secure_filename

import re

import frontmatter
from flask import Flask, jsonify, request, send_from_directory, abort

# Slugs must only contain alphanumerics, hyphens, and underscores.
# This prevents path traversal via the slug parameter.
_SLUG_RE = re.compile(r'^[a-zA-Z0-9_-]+$')

BASE_DIR = Path(__file__).parent
NOTES_DIR = BASE_DIR / "notes"
IMAGES_DIR = BASE_DIR / "images"
PUBLIC_DIR = BASE_DIR / "public"
PORT = 3000
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB

NOTES_DIR.mkdir(exist_ok=True)
IMAGES_DIR.mkdir(exist_ok=True)

app = Flask(__name__, static_folder=str(PUBLIC_DIR), static_url_path="")
# Hard limit on incoming request bodies (covers image uploads).
app.config["MAX_CONTENT_LENGTH"] = MAX_IMAGE_BYTES


# ── Helpers ───────────────────────────────────────────────────────────────────

def today_slug() -> str:
    return date.today().isoformat()  # "2026-03-05"


def validate_slug(slug: str):
    """Abort with 400 if slug contains anything other than [a-zA-Z0-9_-]."""
    if not _SLUG_RE.fullmatch(slug):
        abort(400, description="Invalid slug")


def note_path(slug: str) -> Path:
    return NOTES_DIR / f"{slug}.md"


def read_note(slug: str) -> dict:
    path = note_path(slug)
    if not path.exists():
        abort(404, description="Note not found")
    post = frontmatter.load(str(path))
    fm = {
        "title": post.metadata.get("title", slug),
        "date": post.metadata.get("date", slug),
        "type": post.metadata.get("type", "daily"),
        "pinned": bool(post.metadata.get("pinned", False)),
        "todos": post.metadata.get("todos", []) or [],
    }
    return {"slug": slug, "frontmatter": fm, "body": post.content}


def write_note(slug: str, fm: dict, body: str):
    post = frontmatter.Post(body, **fm)
    with open(note_path(slug), "wb") as f:
        frontmatter.dump(post, f)


def list_slugs() -> list[str]:
    return [Path(p).stem for p in glob.glob(str(NOTES_DIR / "*.md"))]


def all_notes_meta(q: str | None = None) -> list[dict]:
    results = []
    for slug in list_slugs():
        try:
            note = read_note(slug)
            if q:
                ql = q.lower()
                title_match = ql in note["frontmatter"]["title"].lower()
                todo_match = any(ql in t.get("text", "").lower() for t in note["frontmatter"]["todos"])
                body_match = ql in note["body"].lower()
                if not (title_match or todo_match or body_match):
                    continue
            results.append({
                "slug": slug,
                "title": note["frontmatter"]["title"],
                "date": note["frontmatter"]["date"],
                "type": note["frontmatter"]["type"],
                "pinned": note["frontmatter"]["pinned"],
            })
        except Exception:
            pass

    # Sort: pinned first, then slug descending (newest-first for date-named slugs)
    results.sort(key=lambda n: (0 if n["pinned"] else 1, [-ord(c) for c in n["slug"]]))
    return results


def empty_daily_note(slug: str, todos: list) -> dict:
    fm = {
        "title": slug,
        "date": slug,
        "type": "daily",
        "pinned": False,
        "todos": todos,
    }
    body = "\n<!-- TODOS_END -->\n"
    return {"slug": slug, "frontmatter": fm, "body": body}


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/api/today", methods=["POST"])
def ensure_today():
    slug = today_slug()
    path = note_path(slug)

    if path.exists():
        return jsonify(read_note(slug))

    # Find most recent daily note for carry-over
    all_slugs = list_slugs()
    daily_slugs = []
    for s in all_slugs:
        if s == slug:
            continue
        try:
            n = read_note(s)
            if n["frontmatter"]["type"] == "daily":
                daily_slugs.append((s, n))
        except Exception:
            pass

    daily_slugs.sort(key=lambda x: x[0], reverse=True)
    carry_todos = []
    if daily_slugs:
        prev_todos = daily_slugs[0][1]["frontmatter"]["todos"] or []
        carry_todos = [
            {**t, "completed": False}
            for t in prev_todos
            if not t.get("completed", False)
        ]

    note = empty_daily_note(slug, carry_todos)
    write_note(slug, note["frontmatter"], note["body"])
    return jsonify(note)


@app.route("/api/notes", methods=["GET"])
def list_notes():
    q = request.args.get("q", "").strip() or None
    return jsonify(all_notes_meta(q))


@app.route("/api/notes/<slug>", methods=["GET"])
def get_note(slug):
    validate_slug(slug)
    return jsonify(read_note(slug))


@app.route("/api/notes/<slug>", methods=["PUT"])
def save_note(slug):
    validate_slug(slug)
    data = request.get_json(force=True)
    if not data or "frontmatter" not in data or "body" not in data:
        return jsonify({"error": "frontmatter and body required"}), 400
    raw_fm = data["frontmatter"]
    # Only persist known, safe frontmatter fields — reject arbitrary client keys.
    fm = {
        "title": str(raw_fm.get("title", slug))[:200],
        "date": str(raw_fm.get("date", today_slug()))[:20],
        "type": raw_fm.get("type", "daily") if raw_fm.get("type") in ("daily", "adhoc") else "daily",
        "pinned": bool(raw_fm.get("pinned", False)),
        "todos": raw_fm.get("todos", []) or [],
    }
    write_note(slug, fm, data["body"])
    return jsonify({"ok": True})


@app.route("/api/notes", methods=["POST"])
def create_note():
    data = request.get_json(force=True) or {}
    title = data.get("title") or "Untitled"
    slug = f"adhoc-{int(time.time() * 1000)}"
    fm = {
        "title": title,
        "date": today_slug(),
        "type": "adhoc",
        "pinned": False,
        "todos": [],
    }
    body = "\n<!-- TODOS_END -->\n"
    write_note(slug, fm, body)
    return jsonify({"slug": slug, "frontmatter": fm, "body": body})


@app.route("/api/notes/<slug>", methods=["DELETE"])
def delete_note(slug):
    validate_slug(slug)
    path = note_path(slug)
    if not path.exists():
        return jsonify({"error": "Note not found"}), 404
    path.unlink()
    img_dir = IMAGES_DIR / slug
    if img_dir.exists():
        shutil.rmtree(img_dir)
    return jsonify({"ok": True})


@app.route("/api/notes/<slug>/pin", methods=["PATCH"])
def pin_note(slug):
    validate_slug(slug)
    data = request.get_json(force=True) or {}
    note = read_note(slug)
    note["frontmatter"]["pinned"] = bool(data.get("pinned", False))
    write_note(slug, note["frontmatter"], note["body"])
    return jsonify({"ok": True})


ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}

@app.route("/api/images/<slug>", methods=["POST"])
def upload_image(slug):
    validate_slug(slug)
    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400
    file = request.files["image"]
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        return jsonify({"error": "Invalid image type"}), 400
    # Also validate the file extension — content_type is client-controlled and could
    # be spoofed to sneak in an SVG or HTML file that executes scripts when served.
    ext = os.path.splitext(secure_filename(file.filename or ""))[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        return jsonify({"error": "Invalid image extension"}), 400
    # Note: MAX_CONTENT_LENGTH (set on app) enforces the hard size limit server-side;
    # the Content-Length header check below is an early client-friendly rejection.
    if file.content_length and file.content_length > MAX_IMAGE_BYTES:
        return jsonify({"error": "Image too large (max 10 MB)"}), 400

    dest_dir = IMAGES_DIR / slug
    dest_dir.mkdir(parents=True, exist_ok=True)

    original = secure_filename(file.filename or "image.png")
    stem, ext = os.path.splitext(original)
    filename = f"{stem}-{int(time.time() * 1000)}{ext}"
    file.save(str(dest_dir / filename))

    return jsonify({"url": f"/images/{slug}/{filename}"})


@app.route("/images/<slug>/<filename>")
def serve_image(slug, filename):
    validate_slug(slug)
    img_dir = IMAGES_DIR / slug
    if not img_dir.exists():
        abort(404)
    return send_from_directory(str(img_dir), filename)


# Catch-all: serve index.html for any non-API route.
# send_from_directory uses Werkzeug's safe_join internally, so path traversal
# attempts are rejected. We do NOT manually resolve paths against PUBLIC_DIR
# before this call, as doing so could leak file existence outside the public tree.
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    try:
        return send_from_directory(str(PUBLIC_DIR), path or "index.html")
    except Exception:
        return send_from_directory(str(PUBLIC_DIR), "index.html")


# ── Entry point ───────────────────────────────────────────────────────────────

def open_browser():
    """Open browser after a short delay to let Flask start."""
    time.sleep(1.0)
    webbrowser.open(f"http://localhost:{PORT}")


if __name__ == "__main__":
    print(f"Daily Notes running at http://localhost:{PORT}")
    print("Press Ctrl+C to stop.")
    threading.Thread(target=open_browser, daemon=True).start()
    app.run(host="127.0.0.1", port=PORT, debug=False)
