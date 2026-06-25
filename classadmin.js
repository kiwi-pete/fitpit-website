/* Fit Pit — Class Admin.
   Manage the class-type library and the weekly timetable that drives the
   public schedule on fitpitznz.com. Reads/writes /api/classes. */

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const uuid = () =>
  (crypto && crypto.randomUUID && crypto.randomUUID()) ||
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const COLORS = ['#8B7BF7', '#0fb5ad', '#f7794b', '#f7c948', '#4b9bf7', '#e85d9b', '#34c759', '#ff5d5d'];

const fmtTime = (t) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')}${ap}`;
};

const state = { pin: '2026', templates: [], schedule: [], dirty: false, editingId: null };

let elStatus, elTemplates, elGrid, elSave;

export async function initClassAdmin({ pin } = {}) {
  if (pin) state.pin = pin;
  elStatus = $('#ca-status');
  elTemplates = $('#ca-templates');
  elGrid = $('#ca-grid');
  elSave = $('#ca-save');
  elSave.addEventListener('click', save);
  await loadData();
}

function status(msg, kind) {
  if (!msg) {
    elStatus.hidden = true;
    return;
  }
  elStatus.textContent = msg;
  elStatus.className = 'status' + (kind ? ' ' + kind : '');
  elStatus.hidden = false;
}

async function loadData() {
  status('Loading…', 'info');
  try {
    const res = await fetch('/api/classes');
    const data = await res.json();
    if (data.configured === false) {
      status('Schedule storage is not configured yet (SUPABASE_SERVICE_ROLE_KEY missing). You can still build the timetable below, but it can only be saved once storage is configured.', 'info');
    } else {
      status('');
    }
    state.templates = Array.isArray(data.templates) ? data.templates : [];
    state.schedule = Array.isArray(data.schedule) ? data.schedule : [];
  } catch (err) {
    status('Could not load the schedule: ' + err.message, '');
    state.templates = [];
    state.schedule = [];
  }
  state.dirty = false;
  renderAll();
}

function markDirty() {
  state.dirty = true;
  renderAll();
}

function renderAll() {
  renderTemplates();
  renderGrid();
  elSave.disabled = !state.dirty;
  elSave.textContent = state.dirty ? 'Save changes' : 'Saved';
}

/* ----------------------------- class types ------------------------------ */

function renderTemplates() {
  elTemplates.innerHTML = '';
  if (!state.templates.length) {
    elTemplates.append(el('div', 'empty', 'No class types yet — create one below.'));
  }
  state.templates.forEach((t) => {
    const row = el('div', 'ca-tpl');
    const sw = el('span', 'ca-sw');
    sw.style.background = t.color || '#8B7BF7';
    const meta = el('div', 'ca-tpl-meta');
    const times = t.start_time ? `${fmtTime(t.start_time)}${t.end_time ? '–' + fmtTime(t.end_time) : ''}` : 'no default time';
    meta.append(
      el('div', 'ca-tpl-name', esc(t.name)),
      el('div', 'ca-tpl-sub', `${esc(times)}${t.instructor ? ' · ' + esc(t.instructor) : ''}`)
    );
    const actions = el('div', 'ca-tpl-actions');
    const edit = el('button', 'ca-link', 'Edit');
    edit.onclick = () => startEdit(t.id);
    const del = el('button', 'ca-link ca-link-danger', 'Delete');
    del.onclick = () => deleteTemplate(t.id);
    actions.append(edit, del);
    row.append(sw, meta, actions);
    elTemplates.append(row);
  });
  elTemplates.append(buildTemplateForm());
}

function buildTemplateForm() {
  const editing = state.editingId ? state.templates.find((t) => t.id === state.editingId) : null;
  const form = el('form', 'ca-form');
  form.innerHTML = `
    <h3>${editing ? 'Edit class type' : 'Add a class type'}</h3>
    <div class="ca-field"><label>Name</label><input name="name" maxlength="80" required value="${esc(editing?.name || '')}" placeholder="e.g. HIIT The Beat" /></div>
    <div class="ca-field"><label>Instructor <span>(optional)</span></label><input name="instructor" maxlength="80" value="${esc(editing?.instructor || '')}" placeholder="e.g. With G" /></div>
    <div class="ca-field"><label>Description <span>(optional)</span></label><textarea name="description" maxlength="400" rows="2" placeholder="Shown on the website">${esc(editing?.description || '')}</textarea></div>
    <div class="ca-row">
      <div class="ca-field"><label>Default start</label><input type="time" name="start_time" value="${esc(editing?.start_time || '')}" /></div>
      <div class="ca-field"><label>Default end</label><input type="time" name="end_time" value="${esc(editing?.end_time || '')}" /></div>
      <div class="ca-field ca-field-cap"><label>Capacity</label><input type="number" name="max_capacity" min="0" max="999" value="${editing?.max_capacity ?? 20}" /></div>
    </div>
    <div class="ca-field"><label>Colour</label><div class="ca-swatches"></div></div>
    <div class="ca-form-actions"></div>
  `;
  const chosen = { color: editing?.color || COLORS[0] };
  const swWrap = $('.ca-swatches', form);
  COLORS.forEach((c) => {
    const b = el('button', 'ca-swatch' + (c === chosen.color ? ' on' : ''));
    b.type = 'button';
    b.style.background = c;
    b.onclick = () => {
      chosen.color = c;
      swWrap.querySelectorAll('.ca-swatch').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
    };
    swWrap.append(b);
  });

  const actions = $('.ca-form-actions', form);
  const submit = el('button', 'ca-btn ca-btn-primary', editing ? 'Update' : 'Add class type');
  submit.type = 'submit';
  actions.append(submit);
  if (editing) {
    const cancel = el('button', 'ca-btn', 'Cancel');
    cancel.type = 'button';
    cancel.onclick = () => {
      state.editingId = null;
      renderTemplates();
    };
    actions.append(cancel);
  }

  form.onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    const name = f.name.value.trim();
    if (!name) return;
    const tpl = {
      id: editing ? editing.id : `template-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name,
      instructor: f.instructor.value.trim() || null,
      description: f.description.value.trim() || null,
      color: chosen.color,
      start_time: f.start_time.value || null,
      end_time: f.end_time.value || null,
      max_capacity: Math.max(0, Math.min(999, parseInt(f.max_capacity.value, 10) || 20)),
    };
    if (editing) {
      state.templates = state.templates.map((t) => (t.id === editing.id ? tpl : t));
      // keep timetable labels in sync with the renamed type
      state.schedule = state.schedule.map((s) => (s.templateId === tpl.id ? { ...s, name: tpl.name } : s));
      state.editingId = null;
    } else {
      state.templates.push(tpl);
    }
    markDirty();
  };
  return form;
}

function startEdit(id) {
  state.editingId = id;
  renderTemplates();
  elTemplates.querySelector('.ca-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function deleteTemplate(id) {
  const used = state.schedule.filter((s) => s.templateId === id).length;
  const msg = used
    ? `Delete this class type? It is used in ${used} timetable slot${used > 1 ? 's' : ''}, which will also be removed.`
    : 'Delete this class type?';
  if (!confirm(msg)) return;
  state.templates = state.templates.filter((t) => t.id !== id);
  state.schedule = state.schedule.filter((s) => s.templateId !== id);
  if (state.editingId === id) state.editingId = null;
  markDirty();
}

/* ----------------------------- weekly grid ------------------------------ */

function renderGrid() {
  elGrid.innerHTML = '';
  if (!state.templates.length) {
    elGrid.append(el('div', 'empty', 'Add a class type first, then place it on the days it runs.'));
    return;
  }
  const grid = el('div', 'ca-week-grid');
  DAYS.forEach((day, di) => {
    const col = el('div', 'ca-day');
    col.append(el('div', 'ca-day-head', `${esc(day)}<span>${SHORT[di]}</span>`));
    const list = el('div', 'ca-day-list');
    const slots = state.schedule
      .filter((s) => s.weekday === di)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    if (!slots.length) list.append(el('div', 'ca-day-empty', 'No classes'));
    slots.forEach((s) => {
      const tpl = state.templates.find((t) => t.id === s.templateId);
      const chip = el('div', 'ca-slot');
      chip.style.borderLeftColor = (tpl && tpl.color) || '#8B7BF7';
      chip.append(
        el('div', 'ca-slot-name', esc(s.name)),
        el('div', 'ca-slot-time', `${fmtTime(s.start_time)}${s.end_time ? '–' + fmtTime(s.end_time) : ''}`)
      );
      const x = el('button', 'ca-slot-x', '×');
      x.title = 'Remove';
      x.onclick = () => {
        state.schedule = state.schedule.filter((z) => z !== s);
        markDirty();
      };
      chip.append(x);
      list.append(chip);
    });
    col.append(list);
    col.append(buildAddSlot(di));
    grid.append(col);
  });
  elGrid.append(grid);
}

function buildAddSlot(weekday) {
  const wrap = el('div', 'ca-add');
  const btn = el('button', 'ca-add-btn', '+ Add class');
  const panel = el('div', 'ca-add-panel');
  panel.hidden = true;
  btn.onclick = () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) $('select', panel)?.focus();
  };

  const sel = el('select', 'ca-add-sel');
  state.templates.forEach((t) => {
    const o = el('option', null, esc(t.name));
    o.value = t.id;
    sel.append(o);
  });
  const start = el('input', 'ca-add-time');
  start.type = 'time';
  const end = el('input', 'ca-add-time');
  end.type = 'time';
  const syncTimes = () => {
    const t = state.templates.find((x) => x.id === sel.value);
    start.value = (t && t.start_time) || '';
    end.value = (t && t.end_time) || '';
  };
  sel.onchange = syncTimes;
  syncTimes();

  const add = el('button', 'ca-btn ca-btn-primary ca-add-go', 'Add');
  add.onclick = () => {
    const t = state.templates.find((x) => x.id === sel.value);
    if (!t || !start.value) {
      start.focus();
      return;
    }
    state.schedule.push({
      id: uuid(),
      weekday,
      templateId: t.id,
      name: t.name,
      start_time: start.value,
      end_time: end.value || null,
      recurrence_group_id: uuid(),
    });
    markDirty();
  };

  const labels = el('div', 'ca-add-fields');
  labels.append(sel, el('span', 'ca-add-at', 'at'), start, el('span', 'ca-add-dash', '–'), end, add);
  panel.append(labels);
  wrap.append(btn, panel);
  return wrap;
}

/* -------------------------------- save ---------------------------------- */

async function save() {
  if (!state.dirty) return;
  elSave.disabled = true;
  elSave.textContent = 'Saving…';
  status('');
  try {
    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': state.pin },
      body: JSON.stringify({ templates: state.templates, schedule: state.schedule }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.message || data.error || `Save failed (${res.status})`);
    }
    state.templates = data.templates || state.templates;
    state.schedule = data.schedule || state.schedule;
    state.dirty = false;
    renderAll();
    const m = data.materialised;
    if (data.warning) {
      status('Timetable saved. (Ops-app sync was skipped: ' + data.warning + ')', 'info');
    } else if (m) {
      status(`Saved. The website timetable is live${m.inserted || m.deleted ? ` · ${m.inserted} class dates added, ${m.deleted} removed in Gym Manager` : ''}.`, 'success');
    } else {
      status('Saved. The website timetable is live.', 'success');
    }
  } catch (err) {
    status('Could not save: ' + err.message, '');
    elSave.disabled = false;
    elSave.textContent = 'Save changes';
  }
}
