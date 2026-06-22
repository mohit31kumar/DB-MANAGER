document.addEventListener('DOMContentLoaded', function() {
  // CodeMirror setup
  const textarea = document.getElementById('queryInput');
  let editor = null;
  if (textarea && typeof CodeMirror !== 'undefined') {
    editor = CodeMirror.fromTextArea(textarea, {
      mode: 'text/x-mysql',
      theme: 'monokai',
      lineNumbers: true,
      matchBrackets: true,
      indentWithTabs: false,
      smartIndent: true,
      tabSize: 2,
      lineWrapping: true
    });
    editor.setSize(null, 200);
  }

  const runBtn = document.getElementById('runQuery');
  const explainBtn = document.getElementById('explainQuery');
  const formatBtn = document.getElementById('formatQuery');
  const exportBtn = document.getElementById('exportBtn');
  const dbSelect = document.getElementById('database');
  const resultsDiv = document.getElementById('queryResults');
  const messageDiv = document.getElementById('queryMessage');
  const infoDiv = document.getElementById('queryInfo');

  function getQuery() {
    return editor ? editor.getValue().trim() : (textarea ? textarea.value.trim() : '');
  }

  function setQuery(q) {
    if (editor) editor.setValue(q);
    else if (textarea) textarea.value = q;
  }

  // Run Query
  if (runBtn) {
    runBtn.addEventListener('click', function() {
      executeQuery(getQuery());
    });
  }

  // EXPLAIN
  if (explainBtn) {
    explainBtn.addEventListener('click', function() {
      const q = getQuery();
      if (q) executeQuery('EXPLAIN ' + q);
    });
  }

  // Format SQL
  if (formatBtn) {
    formatBtn.addEventListener('click', async function() {
      const q = getQuery();
      if (!q) return;
      try {
        const resp = await fetch('/query/format', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q })
        });
        const data = await resp.json();
        if (data.formatted) {
          setQuery(data.formatted);
        } else if (data.error) {
          showMessage(data.error, 'warning');
        }
      } catch (err) {
        showMessage('Format error: ' + err.message, 'danger');
      }
    });
  }

  // Export dropdown
  if (exportBtn) {
    document.querySelectorAll('.dropdown-item[data-format]').forEach(item => {
      item.addEventListener('click', function(e) {
        e.preventDefault();
        exportQuery(this.dataset.format);
      });
    });
  }

  // Keyboard shortcut
  if (editor) {
    editor.setOption('extraKeys', {
      'Ctrl-Enter': function() { executeQuery(getQuery()); },
      'Cmd-Enter': function() { executeQuery(getQuery()); }
    });
  } else if (textarea) {
    textarea.addEventListener('keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        executeQuery(getQuery());
      }
    });
  }

  async function executeQuery(query) {
    if (!query) {
      showMessage('Please enter a query.', 'warning');
      return;
    }

    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Running...';
    messageDiv.className = 'd-none';
    resultsDiv.innerHTML = '';

    try {
      const resp = await fetch('/query/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, database: dbSelect.value })
      });
      const data = await resp.json();

      if (data.error) {
        showMessage(data.error, 'danger');
        infoDiv.textContent = '';
        exportBtn.disabled = true;
      } else {
        showMessage(data.results.message || 'Query executed successfully.', 'success');
        infoDiv.textContent = data.results.affectedRows + ' row(s) returned in ' + data.results.elapsed + 'ms';
        exportBtn.disabled = false;
        renderResults(data.results);
        addToHistory(query);
      }
    } catch (err) {
      showMessage('Network error: ' + err.message, 'danger');
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = '<i class="bi bi-play"></i> Run Query';
    }
  }

  async function exportQuery(format) {
    const query = getQuery();
    if (!query) return;

    try {
      const resp = await fetch('/query/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, database: dbSelect.value, format })
      });

      if (resp.ok) {
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'query_results.' + format;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const text = await resp.text();
        showMessage('Export failed: ' + text, 'danger');
      }
    } catch (err) {
      showMessage('Export error: ' + err.message, 'danger');
    }
  }

  function showMessage(msg, type) {
    messageDiv.className = 'alert alert-' + type;
    messageDiv.textContent = msg;
  }

  function renderResults(results) {
    if (!results.columns || results.columns.length === 0) {
      resultsDiv.innerHTML = '';
      return;
    }

    let html = '<table class="table table-bordered table-striped table-sm"><thead class="table-dark"><tr>';
    results.columns.forEach(col => {
      html += '<th>' + escapeHtml(col) + '</th>';
    });
    html += '</tr></thead><tbody>';

    if (results.rows.length === 0) {
      html += '<tr><td colspan="' + results.columns.length + '" class="text-center text-muted">Empty result set</td></tr>';
    } else {
      results.rows.forEach(row => {
        html += '<tr>';
        results.columns.forEach(col => {
          const val = row[col];
          const display = val === null ? '<NULL>' : String(val);
          const cls = val === null ? 'text-muted fst-italic' : '';
          html += '<td class="cell-overflow ' + cls + '" title="' + escapeHtml(display) + '">' + escapeHtml(display) + '</td>';
        });
        html += '</tr>';
      });
    }

    html += '</tbody></table>';
    resultsDiv.innerHTML = html;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Query History (localStorage)
  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem('queryHistory') || '[]');
    } catch { return []; }
  }

  function addToHistory(query) {
    let history = getHistory();
    history = history.filter(h => h !== query);
    history.unshift(query);
    if (history.length > 20) history = history.slice(0, 20);
    localStorage.setItem('queryHistory', JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    const list = document.getElementById('queryHistoryList');
    if (!list) return;
    const history = getHistory();
    list.innerHTML = '';
    history.forEach((q, i) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#';
      a.className = 'text-decoration-none';
      a.style.fontSize = '12px';
      a.textContent = q.length > 40 ? q.substring(0, 40) + '...' : q;
      a.title = q;
      a.addEventListener('click', function(e) {
        e.preventDefault();
        setQuery(q);
      });
      li.appendChild(a);
      list.appendChild(li);
    });
  }

  renderHistory();
});
