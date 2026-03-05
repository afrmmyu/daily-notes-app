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

  function buildResizableImage(Image) {
    return Image.extend({
      // Add a `width` attribute that round-trips through HTML <img style="width: Xpx">
      addAttributes() {
        return {
          ...this.parent?.(),
          width: {
            default: null,
            parseHTML: el => {
              const sw = el.style.width;
              if (sw) return parseInt(sw) || null;
              const w = el.getAttribute('width');
              return w ? parseInt(w) : null;
            },
            renderHTML: attrs => {
              if (!attrs.width) return {};
              return { style: `width: ${attrs.width}px; max-width: 100%;` };
            },
          },
        };
      },

      // Custom node view: image wrapped in a div with a drag-resize handle
      addNodeView() {
        return ({ node, updateAttributes }) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'image-wrapper';
          if (node.attrs.width) wrapper.style.width = node.attrs.width + 'px';

          const img = document.createElement('img');
          img.src = node.attrs.src || '';
          img.alt = node.attrs.alt || '';
          if (node.attrs.title) img.title = node.attrs.title;

          const handle = document.createElement('div');
          handle.className = 'image-resize-handle';
          handle.title = 'Drag to resize';

          wrapper.appendChild(img);
          wrapper.appendChild(handle);

          // Drag-to-resize using pointer capture so the drag ends cleanly even
          // if the pointer leaves the browser window (no dangling document listeners).
          let startX, startW;

          handle.addEventListener('pointerdown', e => {
            e.preventDefault();
            e.stopPropagation();
            handle.setPointerCapture(e.pointerId);
            startX = e.clientX;
            startW = wrapper.offsetWidth;
          });

          handle.addEventListener('pointermove', e => {
            if (!handle.hasPointerCapture(e.pointerId)) return;
            const newW = Math.max(50, startW + e.clientX - startX);
            wrapper.style.width = newW + 'px';
          });

          handle.addEventListener('pointerup', e => {
            if (!handle.hasPointerCapture(e.pointerId)) return;
            const newW = Math.max(50, startW + e.clientX - startX);
            updateAttributes({ width: newW });
            handle.releasePointerCapture(e.pointerId);
          });

          handle.addEventListener('pointercancel', e => {
            handle.releasePointerCapture(e.pointerId);
          });

          return {
            dom: wrapper,
            update(updatedNode) {
              if (updatedNode.type !== node.type) return false;
              img.src = updatedNode.attrs.src || '';
              img.alt = updatedNode.attrs.alt || '';
              wrapper.style.width = updatedNode.attrs.width
                ? updatedNode.attrs.width + 'px'
                : '';
              return true;
            },
          };
        };
      },
    });
  }

  async function init(container, onChange) {
    _onChangeCallback = onChange;
    const { Editor, StarterKit, Image, Markdown } = await waitForTipTap();
    const ResizableImage = buildResizableImage(Image);

    _editor = new Editor({
      element: container,
      extensions: [
        StarterKit,
        ResizableImage.configure({ inline: false }),
        Markdown.configure({
          // html: true allows <img style="width: Xpx"> to round-trip through .md files
          html: true,
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
    const md = _editor.storage.markdown.getMarkdown();

    // Collect width overrides from the live ProseMirror document.
    // For images that have been resized we emit <img> HTML so the width
    // persists in the .md file; unsized images stay as clean ![](src) Markdown.
    const widths = {};
    _editor.state.doc.descendants(node => {
      if (node.type.name === 'image' && node.attrs.width && node.attrs.src) {
        widths[node.attrs.src] = node.attrs.width;
      }
    });

    if (!Object.keys(widths).length) return md;

    // Replace ![alt](src) with <img> for any image that has a width set.
    return md.replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g, (match, alt, src) => {
      const w = widths[src];
      if (!w) return match;
      const altAttr = alt ? ` alt="${alt.replace(/"/g, '&quot;')}"` : '';
      return `<img src="${src}"${altAttr} style="width: ${w}px; max-width: 100%;">`;
    });
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
