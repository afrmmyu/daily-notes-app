// notes-section.js — "Add Entry" button wiring
'use strict';

const NotesSection = (() => {
  const addEntryBtn = document.getElementById('add-entry-btn');

  function init() {
    addEntryBtn.addEventListener('click', () => {
      EditorModule.insertTimestampedEntry();
    });
  }

  return { init };
})();

window.NotesSection = NotesSection;
