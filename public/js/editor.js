// editor.js — TipTap WYSIWYG editor wrapper
'use strict';

const EditorModule = (() => {
  let _editor = null;
  let _currentSlug = null;
  let _onChangeCallback = null;

  function waitForTipTap() {
    return new Promise(resolve => {
      if (window._TipTap) return resolve(window._TipTap);
      window.addEventListener('tiptap-ready', () => resolve(window._TipTap), { once: true });
    });
  }

  async function init(container, onChange) {
    _onChangeCallback = onChange;
    const { Editor, StarterKit, Image, Markdown } = await waitForTipTap();

    _editor = new Editor({
      element: container,
      extensions: [
        StarterKit,
        Image.configure({ inline: false }),
        Markdown.configure({
          html: false,
          transformPastedText: true,
          transformCopiedText: true,
        }),
      ],
      content: '',
      editorProps: {
        attributes: {
          class: 'tiptap',
          'data-placeholder': 'start writing...',
          spellcheck: 'false',
        },
        handlePaste(view, event) {
          const items = event.clipboardData && event.clipboardData.items;
          if (!items) return false;
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) uploadAndInsertImage(file);
              return true;
            }
          }
          return false;
        },
        handleDrop(view, event, slice, moved) {
          const files = event.dataTransfer && event.dataTransfer.files;
          if (!files || !files.length) return false;
          for (const file of files) {
            if (file.type.startsWith('image/')) {
              event.preventDefault();
              uploadAndInsertImage(file);
              return true;
            }
          }
          return false;
        },
      },
      onUpdate() {
        if (_onChangeCallback) _onChangeCallback();
      },
    });
  }

  async function uploadAndInsertImage(file) {
    if (!_currentSlug) return;
    try {
      const { url } = await Api.uploadImage(_currentSlug, file);
      _editor.chain().focus().setImage({ src: url, alt: file.name }).run();
    } catch (err) {
      console.error('Image upload failed:', err);
    }
  }

  function setSlug(slug) {
    _currentSlug = slug;
  }

  function setMarkdown(md) {
    if (!_editor) return;
    // Strip everything up to and including <!-- TODOS_END -->
    const sentinel = '<!-- TODOS_END -->';
    const idx = md.indexOf(sentinel);
    const content = idx >= 0 ? md.slice(idx + sentinel.length).trimStart() : md;
    _editor.commands.setContent(content || '');
  }

  function getMarkdown() {
    if (!_editor) return '';
    return _editor.storage.markdown.getMarkdown();
  }

  function insertTimestampedEntry() {
    if (!_editor) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timestamp = `${hh}:${mm}:${ss}`;

    // Move cursor to end, insert heading + empty paragraph
    _editor
      .chain()
      .focus('end')
      .insertContent(`\n\n### ${timestamp}\n\n`)
      .run();
  }

  function focus() {
    if (_editor) _editor.commands.focus();
  }

  function destroy() {
    if (_editor) {
      _editor.destroy();
      _editor = null;
    }
  }

  return { init, setSlug, setMarkdown, getMarkdown, insertTimestampedEntry, focus, destroy };
})();

window.EditorModule = EditorModule;
