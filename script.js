require.config({
  paths: { vs: 'https://unpkg.com/monaco-editor@0.34.1/min/vs' }
});

let examplesData = [];
let editors = [];

const container     = document.getElementById('examples');
const searchInput   = document.getElementById('search');
const chapterSelect = document.getElementById('chapter-select');
const selected      = chapterSelect.querySelector('.selected');
const optionsCont   = chapterSelect.querySelector('.options-container');
const optionEls     = optionsCont.querySelectorAll('.option');

function clearExamples() {
  editors.forEach(ed => ed.dispose());
  editors = [];
  container.innerHTML = '';
}

function renderExamples() {
  clearExamples();
  const savedFavs = JSON.parse(localStorage.getItem('favorites') || '[]');

  examplesData.forEach((ex, i) => {
    const block = document.createElement('div');
    block.className = 'script-block';
    block.id = `block-${i}`;
    if (savedFavs.includes(block.id)) block.classList.add('favorite');

    const h2 = document.createElement('h2');
    h2.textContent = ex.title;
    block.appendChild(h2);

    const p = document.createElement('p');
    p.textContent = ex.description;
    p.style.whiteSpace = 'pre-wrap';
    block.appendChild(p);

    const editorDiv = document.createElement('div');
    editorDiv.className = 'editor-container';
    editorDiv.id = `editor-${i}`;
    block.appendChild(editorDiv);

    let outputDiv;
    if (ex.canRun) {
      outputDiv = document.createElement('div');
      outputDiv.className = 'output-container';
      block.appendChild(outputDiv);
    }

    const btnContainer = document.createElement('div');
    btnContainer.className = 'button-container';
    block.appendChild(btnContainer);

    container.appendChild(block);

    const ed = monaco.editor.create(editorDiv, {
      value: ex.code,
      language: 'lua',
      theme: 'vs-dark',
      automaticLayout: true,
      scrollBeyondLastLine: false,
      readOnly: true
    });
    editors.push(ed);

    if (ex.canRun) {
      const toggleBtn = document.createElement('button');
      toggleBtn.textContent = 'Edit';
      toggleBtn.className = 'edit-button';
      btnContainer.appendChild(toggleBtn);

      const runBtn = document.createElement('button');
      runBtn.textContent = 'Run';
      runBtn.className = 'run-button';
      btnContainer.appendChild(runBtn);

      const clearBtn = document.createElement('button');
      clearBtn.textContent = 'Clear';
      clearBtn.className = 'clear-button';
      btnContainer.appendChild(clearBtn);

      const resetBtn = document.createElement('button');
      resetBtn.textContent = 'Reset';
      resetBtn.className = 'reset-button';
      btnContainer.appendChild(resetBtn);

      toggleBtn.addEventListener('click', () => {
        const isRO = ed.getRawOptions().readOnly;
        ed.updateOptions({ readOnly: !isRO });
        editorDiv.classList.toggle('edit-mode', isRO);
        ed.layout();
        toggleBtn.textContent = isRO ? 'Done' : 'Edit';
      });

      clearBtn.addEventListener('click', () => {
        outputDiv.textContent = '';
      });

      resetBtn.addEventListener('click', () => {
        ed.setValue(ex.code);
        outputDiv.textContent = '';
      });

      runBtn.addEventListener('click', () => {
        let output = '';
        const L = fengari.lauxlib.luaL_newstate();
        fengari.lualib.luaL_openlibs(L);
        fengari.lua.lua_pushjsfunction(L, () => {
          const top = fengari.lua.lua_gettop(L);
          const parts = [];
          for (let idx = 1; idx <= top; idx++) {
            const tp = fengari.lua.lua_type(L, idx);
            let str;
            if (tp === fengari.lua.LUA_TSTRING) {
              const v = fengari.lua.lua_tolstring(L, idx);
              str = fengari.to_jsstring(v);
            } else if (tp === fengari.lua.LUA_TNUMBER) {
              str = fengari.lua.lua_tonumber(L, idx).toString();
            } else if (tp === fengari.lua.LUA_TBOOLEAN) {
              str = fengari.lua.lua_toboolean(L, idx) ? 'true' : 'false';
            } else if (tp === fengari.lua.LUA_TNIL) {
              str = 'nil';
            } else {
              str = `<${tp}>`;
            }
            parts.push(str);
          }
          output += parts.join('\t') + '\n';
          return 0;
        });
        fengari.lua.lua_setglobal(L, fengari.to_luastring('print'));
        const code = ed.getValue();
        const status = fengari.lauxlib.luaL_loadstring(L, fengari.to_luastring(code));
        if (status === fengari.lua.LUA_OK) {
          const res = fengari.lua.lua_pcall(L, 0, fengari.lua.LUA_MULTRET, 0);
          if (res !== fengari.lua.LUA_OK) {
            let err = fengari.lua.lua_tolstring(L, -1);
            if (err instanceof Uint8Array) err = fengari.to_jsstring(err);
            output += err + '\n';
          }
        } else {
          let err = fengari.lua.lua_tolstring(L, -1);
          if (err instanceof Uint8Array) err = fengari.to_jsstring(err);
          output += err + '\n';
        }
        outputDiv.textContent = output || '[ no output ]';
      });
    } else {
      const toggleBtn = document.createElement('button');
      toggleBtn.textContent = 'Show';
      toggleBtn.className = 'show-button';
      btnContainer.appendChild(toggleBtn);

      toggleBtn.addEventListener('click', () => {
        const isExpanded = editorDiv.classList.toggle('expanded');
        toggleBtn.textContent = isExpanded ? 'Hide' : 'Show';
        ed.layout();
      });
    }

    const favBtn = document.createElement('button');
    favBtn.textContent = 'Favorite';
    favBtn.className = 'favorite-button';
    btnContainer.appendChild(favBtn);

    favBtn.addEventListener('click', () => {
      const favs = JSON.parse(localStorage.getItem('favorites') || '[]');
      const idx2 = favs.indexOf(block.id);
      if (idx2 >= 0) {
        favs.splice(idx2, 1);
        block.classList.remove('favorite');
      } else {
        favs.push(block.id);
        block.classList.add('favorite');
      }
      localStorage.setItem('favorites', JSON.stringify(favs));
    });
  });

  filterExamples();
}

function loadChapter(chapterNumber) {
  fetch(`chapter${chapterNumber}.json`)
    .then(res => {
      if (!res.ok) throw new Error(`chapter${chapterNumber}.json not found`);
      return res.json();
    })
    .then(json => {
      examplesData = Object.entries(json).map(([key, ex]) => ({
        chapter: chapterNumber,
        title: ex.title,
        description: ex.description,
        code: Array.isArray(ex.code) ? ex.code.join('\n') : ex.code,
        canRun: ex.canRun || false
      }));
      renderExamples();
    })
    .catch(err => {
      console.error(err);
      container.innerHTML = `<p style="color: red;">Error: ${err.message}</p>`;
    });
}

function filterExamples() {
  const term    = searchInput.value.toLowerCase();
  const chapVal = selected.getAttribute('data-value');
  const favs    = JSON.parse(localStorage.getItem('favorites') || '[]');

  examplesData.forEach((ex, i) => {
    const block = document.getElementById(`block-${i}`);
    const matchSearch = (ex.title + ex.code).toLowerCase().includes(term);

    let show;
    if (chapVal === 'favorite') {
      show = matchSearch && favs.includes(block.id);
    } else {
      const matchChapter = !chapVal || ex.chapter.toString() === chapVal;
      show = matchSearch && matchChapter;
    }

    block.style.display = show ? 'block' : 'none';
  });
}

require(['vs/editor/editor.main'], () => {
  loadChapter(1);

  selected.addEventListener('click', () => {
    chapterSelect.classList.toggle('open');
  });

  optionEls.forEach(opt => {
    opt.addEventListener('click', () => {
      const v = opt.getAttribute('data-value');
      selected.textContent = opt.textContent;
      selected.setAttribute('data-value', v);
      chapterSelect.classList.remove('open');

      if (v === 'favorite') {
        renderExamples();
      } else {
        loadChapter(v);
      }
    });
  });

  searchInput.addEventListener('input', filterExamples);
});

document.addEventListener("keydown", function (e) {
  if (
    e.key === "F12" || 
    (e.ctrlKey && e.shiftKey && e.key === "I") || 
    (e.ctrlKey && e.key === "U")
  ) {
    e.preventDefault();
    return false;
  }
});

document.addEventListener("contextmenu", function (e) {
  e.preventDefault();
});
