// todos.js — todo panel rendering and mutations (frontmatter-backed)
'use strict';

const Todos = (() => {
  const list = document.getElementById('todo-list');
  const addInput = document.getElementById('add-todo-input');

  let _todos = [];
  let _onChange = null; // callback(todos) when todos change

  function init(onChange) {
    _onChange = onChange;

    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = addInput.value.trim();
        if (text) {
          addTodo(text);
          addInput.value = '';
        }
      }
    });
  }

  function render(todos) {
    _todos = todos || [];
    list.innerHTML = '';

    _todos.forEach((todo, idx) => {
      const li = document.createElement('li');
      li.className = 'todo-item' + (todo.completed ? ' completed' : '');
      li.dataset.id = todo.id;

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = todo.completed;
      checkbox.addEventListener('change', () => toggleTodo(todo.id));

      const textSpan = document.createElement('span');
      textSpan.className = 'todo-text';
      textSpan.textContent = todo.text;
      textSpan.contentEditable = 'true';
      textSpan.spellcheck = false;
      textSpan.addEventListener('blur', () => {
        const newText = textSpan.textContent.trim();
        if (newText && newText !== todo.text) {
          _todos[idx].text = newText;
          _onChange(_todos);
        } else if (!newText) {
          textSpan.textContent = todo.text; // revert
        }
      });
      textSpan.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); textSpan.blur(); }
        if (e.key === 'Escape') {
          textSpan.textContent = todo.text;
          textSpan.blur();
        }
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'todo-delete-btn';
      delBtn.textContent = '×';
      delBtn.title = 'Remove todo';
      delBtn.addEventListener('click', () => removeTodo(todo.id));

      li.appendChild(checkbox);
      li.appendChild(textSpan);
      li.appendChild(delBtn);
      list.appendChild(li);
    });
  }

  function addTodo(text) {
    const id = `todo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const todo = { id, text, completed: false };
    _todos.push(todo);
    render(_todos);
    if (_onChange) _onChange(_todos);
  }

  function toggleTodo(id) {
    const todo = _todos.find(t => t.id === id);
    if (!todo) return;
    todo.completed = !todo.completed;
    render(_todos);
    if (_onChange) _onChange(_todos);
  }

  function removeTodo(id) {
    _todos = _todos.filter(t => t.id !== id);
    render(_todos);
    if (_onChange) _onChange(_todos);
  }

  function getTodos() {
    return _todos;
  }

  return { init, render, addTodo, toggleTodo, removeTodo, getTodos };
})();

window.Todos = Todos;
