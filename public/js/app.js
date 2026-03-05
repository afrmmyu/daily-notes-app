// app.js — central state manager, init sequence, auto-save wiring
'use strict';

const App = (() => {
  const state = {
    currentSlug: null,
    currentNote: null,  // { slug, frontmatter, body }
    dirty: false,
  };

  // DOM references
  const noteView = document.getElementById('note-view');
  const emptyState = document.getElementById('empty-state');
  const noteTitle = document.getElementById('note-title');
  const noteDate = document.getElementById('note-date');
  const pinBtn = document.getElementById('pin-btn');
  const deleteBtn = document.getElementById('delete-btn');
  const todosPanel = document.getElementById('todos-panel');
  const notesDivider = document.getElementById('notes-divider');
  const saveIndicator = document.getElementById('save-indicator');
  const editorContainer = document.getElementById('editor');

  let _saveTimer = null;

  // ── Init ──────────────────────────────────────────────────────────

  async function init() {
    // Init sub-modules
    Todos.init(onTodosChange);
    NotesSection.init();
    Sidebar.init({ onSelect: loadNote, onNewNote: createAdhocNote, onPin: pinNoteFromSidebar });

    // Wire header actions
    pinBtn.addEventListener('click', togglePin);
    deleteBtn.addEventListener('click', deleteCurrentNote);
    noteTitle.addEventListener('blur', onTitleBlur);
    noteTitle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); noteTitle.blur(); }
      if (e.key === 'Escape') noteTitle.blur();
    });

    // Init editor (TipTap)
    await EditorModule.init(editorContainer, onEditorChange);

    // Ensure today's note exists (runs carry-over)
    let todayNote;
    try {
      todayNote = await Api.ensureToday();
    } catch (err) {
      console.error('Failed to ensure today:', err);
    }

    // Populate sidebar
    const notes = await Sidebar.refresh();

    // Load today's note
    if (todayNote) {
      await loadNote(todayNote.slug);
    } else if (notes && notes.length) {
      await loadNote(notes[0].slug);
    } else {
      showEmptyState();
    }
  }

  // ── Load a note ───────────────────────────────────────────────────

  async function loadNote(slug) {
    if (state.dirty) await saveNow();

    try {
      const note = await Api.getNote(slug);
      state.currentSlug = slug;
      state.currentNote = note;
      state.dirty = false;

      EditorModule.setSlug(slug);
      renderNoteView(note);
      Sidebar.setActive(slug);
    } catch (err) {
      console.error('Failed to load note:', err);
    }
  }

  function renderNoteView(note) {
    const { frontmatter, body } = note;

    // Show/hide panels
    emptyState.classList.add('hidden');
    noteView.classList.remove('hidden');

    const isDaily = frontmatter.type === 'daily';
    todosPanel.classList.toggle('hidden', !isDaily);
    notesDivider.classList.toggle('hidden', !isDaily);

    // Title — editable only for adhoc notes
    noteTitle.textContent = frontmatter.title;
    noteTitle.contentEditable = isDaily ? 'false' : 'true';
    noteTitle.style.cursor = isDaily ? 'default' : 'text';

    // Date
    noteDate.textContent = frontmatter.date || '';

    // Pin button
    updatePinBtn(frontmatter.pinned);

    // Todos
    Todos.render(frontmatter.todos || []);

    // Editor
    EditorModule.setMarkdown(body || '');
  }

  function showEmptyState() {
    noteView.classList.add('hidden');
    emptyState.classList.remove('hidden');
  }

  // ── Save logic ────────────────────────────────────────────────────

  function onEditorChange() {
    state.dirty = true;
    showSaveIndicator('unsaved');
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(saveNow, 1000);
  }

  function onTodosChange(todos) {
    if (!state.currentNote) return;
    state.currentNote.frontmatter.todos = todos;
    state.dirty = true;
    showSaveIndicator('unsaved');
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(saveNow, 800);
  }

  async function saveNow() {
    if (!state.currentSlug || !state.currentNote) return;
    clearTimeout(_saveTimer);

    const bodyContent = EditorModule.getMarkdown();
    const body = '\n<!-- TODOS_END -->\n\n' + bodyContent;
    const frontmatter = { ...state.currentNote.frontmatter };
    frontmatter.todos = Todos.getTodos();

    try {
      await Api.saveNote(state.currentSlug, frontmatter, body);
      state.currentNote.body = body;
      state.dirty = false;
      showSaveIndicator('saved');
      setTimeout(() => showSaveIndicator(''), 1500);
    } catch (err) {
      console.error('Save failed:', err);
      showSaveIndicator('save failed');
    }
  }

  function showSaveIndicator(msg) {
    saveIndicator.textContent = msg ? `— ${msg}` : '';
  }

  // ── Pin ───────────────────────────────────────────────────────────

  async function togglePin() {
    if (!state.currentNote) return;
    const newPinned = !state.currentNote.frontmatter.pinned;
    try {
      await Api.pinNote(state.currentSlug, newPinned);
      state.currentNote.frontmatter.pinned = newPinned;
      updatePinBtn(newPinned);
      await Sidebar.refresh(state.currentSlug);
    } catch (err) {
      console.error('Pin failed:', err);
    }
  }

  function updatePinBtn(pinned) {
    pinBtn.dataset.active = pinned ? 'true' : 'false';
    pinBtn.title = pinned ? 'Unpin note' : 'Pin note';
    pinBtn.textContent = pinned ? '[*]' : '[ ]';
  }

  // Called when pin is toggled from the sidebar (not necessarily the current note)
  async function pinNoteFromSidebar(slug, newPinned) {
    try {
      await Api.pinNote(slug, newPinned);
      // If the toggled note is the currently open one, sync the header button too
      if (slug === state.currentSlug && state.currentNote) {
        state.currentNote.frontmatter.pinned = newPinned;
        updatePinBtn(newPinned);
      }
      await Sidebar.refresh(state.currentSlug);
    } catch (err) {
      console.error('Pin from sidebar failed:', err);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────

  async function deleteCurrentNote() {
    if (!state.currentSlug) return;
    const title = state.currentNote?.frontmatter?.title || state.currentSlug;
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;

    try {
      await Api.deleteNote(state.currentSlug);
      state.currentSlug = null;
      state.currentNote = null;
      state.dirty = false;
      const notes = await Sidebar.refresh();
      if (notes && notes.length) {
        await loadNote(notes[0].slug);
      } else {
        showEmptyState();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  // ── Title edit (adhoc notes) ───────────────────────────────────────

  async function onTitleBlur() {
    if (!state.currentNote) return;
    if (state.currentNote.frontmatter.type === 'daily') return;
    const newTitle = noteTitle.textContent.trim();
    if (!newTitle || newTitle === state.currentNote.frontmatter.title) return;

    state.currentNote.frontmatter.title = newTitle;
    await saveNow();
    await Sidebar.refresh(state.currentSlug);
  }

  // ── Create ad-hoc note ────────────────────────────────────────────

  async function createAdhocNote() {
    try {
      const note = await Api.createNote('Untitled');
      await Sidebar.refresh(note.slug);
      await loadNote(note.slug);
      // Focus title for immediate rename
      noteTitle.focus();
      // Select all text in the title
      const range = document.createRange();
      range.selectNodeContents(noteTitle);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (err) {
      console.error('Create note failed:', err);
    }
  }

  return { init, loadNote, saveNow };
})();

// Boot when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());

window.App = App;
