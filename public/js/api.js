// api.js — all fetch() wrappers for the backend API
'use strict';

const Api = (() => {
  async function request(method, path, body) {
    const opts = {
      method,
      headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = body instanceof FormData ? body : JSON.stringify(body);
    const res = await fetch(path, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  return {
    // Ensure today's daily note exists (runs carry-over logic)
    ensureToday() {
      return request('POST', '/api/today');
    },

    // List all notes (optionally filtered by search query)
    getNotes(q) {
      const url = q ? `/api/notes?q=${encodeURIComponent(q)}` : '/api/notes';
      return request('GET', url);
    },

    // Get full note by slug
    getNote(slug) {
      return request('GET', `/api/notes/${encodeURIComponent(slug)}`);
    },

    // Save (create or update) a note
    saveNote(slug, frontmatter, body) {
      return request('PUT', `/api/notes/${encodeURIComponent(slug)}`, { frontmatter, body });
    },

    // Create a new ad-hoc note
    createNote(title) {
      return request('POST', '/api/notes', { title });
    },

    // Delete a note
    deleteNote(slug) {
      return request('DELETE', `/api/notes/${encodeURIComponent(slug)}`);
    },

    // Toggle pin
    pinNote(slug, pinned) {
      return request('PATCH', `/api/notes/${encodeURIComponent(slug)}/pin`, { pinned });
    },

    // Upload an image for a note
    async uploadImage(slug, file) {
      const form = new FormData();
      form.append('image', file);
      return request('POST', `/api/images/${encodeURIComponent(slug)}`, form);
    },
  };
})();

window.Api = Api;
