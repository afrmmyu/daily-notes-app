// sidebar.js — sidebar rendering, search, pin events
'use strict';

const Sidebar = (() => {
  const notesList = document.getElementById('notes-list');
  const searchInput = document.getElementById('search-input');
  const newAdhocBtn = document.getElementById('new-adhoc-btn');

  let _activeSlug = null;
  let _onSelect = null;
  let _onNewNote = null;
  let _searchTimer = null;

  let _onPin = null;

  function init({ onSelect, onNewNote, onPin }) {
    _onSelect = onSelect;
    _onNewNote = onNewNote;
    _onPin = onPin;

    searchInput.addEventListener('input', () => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        const q = searchInput.value.trim();
        loadAndRender(q || undefined);
      }, 250);
    });

    newAdhocBtn.addEventListener('click', () => {
      if (_onNewNote) _onNewNote();
    });
  }

  function render(notes, activeSlug) {
    if (activeSlug !== undefined) _activeSlug = activeSlug;
    notesList.innerHTML = '';

    if (!notes || notes.length === 0) {
      const li = document.createElement('li');
      li.className = 'note-item';
      li.style.color = 'var(--text-dim)';
      li.style.fontSize = '11px';
      li.style.padding = '12px';
      li.textContent = searchInput.value.trim() ? 'no results' : 'no notes yet';
      notesList.appendChild(li);
      return;
    }

    const pinned = notes.filter(n => n.pinned);
    const unpinned = notes.filter(n => !n.pinned);

    pinned.forEach(note => notesList.appendChild(buildItem(note)));

    if (pinned.length && unpinned.length) {
      const sep = document.createElement('li');
      sep.className = 'notes-list-separator';
      notesList.appendChild(sep);
    }

    unpinned.forEach(note => notesList.appendChild(buildItem(note)));
  }

  function buildItem(note) {
    const li = document.createElement('li');
    li.className = 'note-item' +
      (note.pinned ? ' pinned' : '') +
      (note.slug === _activeSlug ? ' active' : '');
    li.dataset.slug = note.slug;

    const textWrap = document.createElement('span');
    textWrap.className = 'note-item-text';

    const title = document.createElement('div');
    title.className = 'note-item-title';
    title.textContent = note.title;

    const date = document.createElement('div');
    date.className = 'note-item-date';
    date.textContent = note.date || '';

    textWrap.appendChild(title);
    if (note.date && note.title !== note.date) textWrap.appendChild(date);

    const type = document.createElement('span');
    type.className = 'note-item-type';
    type.textContent = note.type === 'adhoc' ? 'note' : '';

    // Pin toggle button — always visible when pinned, appears on hover otherwise
    const pinBtn = document.createElement('button');
    pinBtn.className = 'note-item-pin-btn' + (note.pinned ? ' is-pinned' : '');
    pinBtn.textContent = note.pinned ? '[*]' : '[ ]';
    pinBtn.title = note.pinned ? 'Unpin' : 'Pin to top';
    pinBtn.addEventListener('click', async (e) => {
      e.stopPropagation(); // don't select the note
      if (_onPin) await _onPin(note.slug, !note.pinned);
    });

    li.appendChild(textWrap);
    li.appendChild(type);
    li.appendChild(pinBtn);

    li.addEventListener('click', () => {
      if (_onSelect) _onSelect(note.slug);
    });

    return li;
  }

  async function loadAndRender(q) {
    try {
      const notes = await Api.getNotes(q);
      render(notes);
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
  }

  function setActive(slug) {
    _activeSlug = slug;
    notesList.querySelectorAll('.note-item').forEach(el => {
      el.classList.toggle('active', el.dataset.slug === slug);
    });
  }

  async function refresh(activeSlug) {
    const q = searchInput.value.trim() || undefined;
    const notes = await Api.getNotes(q);
    render(notes, activeSlug);
    return notes;
  }

  return { init, render, setActive, loadAndRender, refresh };
})();

window.Sidebar = Sidebar;
