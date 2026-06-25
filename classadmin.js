/* Fit Pit — Class Admin.
   Manage the class-type library (with images) and a dated weekly
   timetable that drives the public schedule on fitpitznz.com.
   Weeks can be duplicated forward. Reads/writes /api/classes and
   uploads images via /api/upload. */

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

const COLORS = ['#8B7BF7', '#0fb5ad', '#f7794b', '#f7c948', '#4b9bf7', '#e85d9b', '#34c759', '#ff5d5d'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---- date helpers (anchored to gym-local time, East Africa) ------------- */
function eatTodayISO() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
const ymd = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const isoOf = (dt) => dt.toISOString().slice(0, 10);
function addDays(iso, n) {
  const dt = ymd(iso);
  dt.setUTCDate(dt.getUTCDate() + n);
  return isoOf(dt);
}
const dow = (iso) => ymd(iso).getUTCDay(); // 0=Sun
const weekdayMon = (iso) => (dow(iso) + 6) % 7; // 0=Mon
const mondayOf = (iso) => addDays(iso, -weekdayMon(iso));
const dayNum = (iso) => Number(iso.slice(8, 10));
const monthShort = (iso) => MON[Number(iso.slice(5, 7)) - 1];

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
      status('Schedule storage is not configured yet. You can build the timetable below, but saving needs storage configured.', 'info');
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
  renderWeeks();
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
    let badge;
    if (t.image) {
      badge = el('span', 'ca-tpl-img');
      badge.style.backgroundImage = `url("${encodeURI(t.image)}")`;
    } else {
      badge = el('span', 'ca-sw');
      badge.style.background = t.color || '#8B7BF7';
    }
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
    row.append(badge, meta, actions);
    elTemplates.append(row);
  });
  elTemplates.append(buildTemplateForm());
}

function buildTemplateForm() {
  const editing = state.editingId ? state.templates.find((t) => t.id === state.editingId) : null;
  const chosen = { color: editing?.color || COLORS[0], image: editing?.image || null };
  const form = el('form', 'ca-form');
  form.innerHTML = `
    <h3>${editing ? 'Edit class type' : 'Add a class type'}</h3>
    <div class="ca-field"><label>Name</label><input name="name" maxlength="80" required value="${esc(editing?.name || '')}" placeholder="e.g. HIIT The Beat" /></div>
    <div class="ca-field"><label>Instructor <span>(optional)</span></label><input name="instructor" maxlength="80" value="${esc(editing?.instructor || '')}" placeholder="e.g. With G" /></div>
    <div class="ca-field"><label>Description <span>(optional)</span></label><textarea name="description" maxlength="400" rows="2" placeholder="Shown on the website">${esc(editing?.description || '')}</textarea></div>
    <div class="ca-field"><label>Image <span>(optional, shown on the website)</span></label>
      <div class="ca-img-row">
        <div class="ca-img-preview"></div>
        <div class="ca-img-actions">
          <label class="ca-btn ca-img-btn">Upload image<input type="file" name="imgfile" accept="image/jpeg,image/png,image/webp" hidden /></label>
          <button type="button" class="ca-link ca-link-danger ca-img-remove">Remove</button>
          <p class="ca-img-hint">JPG, PNG or WebP</p>
        </div>
      </div>
    </div>
    <div class="ca-row">
      <div class="ca-field"><label>Default start</label><input type="time" name="start_time" value="${esc(editing?.start_time || '')}" /></div>
      <div class="ca-field"><label>Default end</label><input type="time" name="end_time" value="${esc(editing?.end_time || '')}" /></div>
      <div class="ca-field ca-field-cap"><label>Capacity</label><input type="number" name="max_capacity" min="0" max="999" value="${editing?.max_capacity ?? 20}" /></div>
    </div>
    <div class="ca-field"><label>Colour</label><div class="ca-swatches"></div></div>
    <div class="ca-form-actions"></div>
  `;

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

  // ---- image upload wiring (does not re-render the form mid-edit) ----
  const preview = $('.ca-img-preview', form);
  const removeBtn = $('.ca-img-remove', form);
  const fileInput = $('input[name="imgfile"]', form);
  const imgBtn = $('.ca-img-btn', form);
  const refreshPreview = () => {
    preview.innerHTML = chosen.image ? `<img src="${esc(chosen.image)}" alt="preview" />` : '';
    preview.classList.toggle('has-img', !!chosen.image);
    removeBtn.hidden = !chosen.image;
  };
  refreshPreview();
  removeBtn.onclick = () => {
    chosen.image = null;
    refreshPreview();
  };
  fileInput.onchange = async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    imgBtn.classList.add('busy');
    imgBtn.firstChild && (imgBtn.childNodes[0].nodeValue = 'Uploading…');
    try {
      const dataUrl = await downscale(file, 1280, 0.85);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': state.pin },
        body: JSON.stringify({ contentType: 'image/jpeg', data: dataUrl }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) throw new Error(d.message || d.error || `Upload failed (${res.status})`);
      chosen.image = d.url;
      refreshPreview();
      status('Image uploaded — remember to Save.', 'success');
    } catch (err) {
      status('Image upload failed: ' + err.message, '');
    } finally {
      imgBtn.classList.remove('busy');
      imgBtn.childNodes[0].nodeValue = 'Upload image';
    }
  };

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
      image: chosen.image || null,
      start_time: f.start_time.value || null,
      end_time: f.end_time.value || null,
      max_capacity: Math.max(0, Math.min(999, parseInt(f.max_capacity.value, 10) || 20)),
    };
    if (editing) {
      state.templates = state.templates.map((t) => (t.id === editing.id ? tpl : t));
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

// Load a file, downscale on a canvas, return a JPEG data-URL.
function downscale(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth || img.width;
      let h = img.naturalHeight || img.height;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      w = Math.round(w * scale);
      h = Math.round(h * scale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      try {
        resolve(c.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('Could not read image'));
    const r = new FileReader();
    r.onload = () => (img.src = r.result);
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

/* --------------------------- weekly timetable --------------------------- */

function renderWeeks() {
  elGrid.innerHTML = '';
  if (!state.templates.length) {
    elGrid.append(el('div', 'empty', 'Add a class type first, then place it on the days it runs.'));
    return;
  }
  const today = eatTodayISO();
  const curMon = mondayOf(today);
  const weeks = new Set([curMon]);
  state.schedule.forEach((e) => {
    const m = mondayOf(e.date);
    if (m >= curMon) weeks.add(m);
  });
  [...weeks].sort().forEach((wkMon, i) => elGrid.append(buildWeek(wkMon, today, i === 0)));
}

function buildWeek(wkMon, today, isCurrent) {
  const sun = addDays(wkMon, 6);
  const block = el('div', 'ca-week-block');

  const bar = el('div', 'ca-week-bar');
  bar.append(
    el('div', 'ca-week-title', `${isCurrent ? 'This week' : 'Week of'} · ${dayNum(wkMon)} ${monthShort(wkMon)} – ${dayNum(sun)} ${monthShort(sun)}`)
  );
  const acts = el('div', 'ca-week-actions');
  const dup = el('button', 'ca-btn ca-btn-sm', 'Duplicate to next week →');
  dup.onclick = () => duplicateWeek(wkMon);
  acts.append(dup);
  if (state.schedule.some((e) => mondayOf(e.date) === wkMon)) {
    const clr = el('button', 'ca-link ca-link-danger', 'Clear week');
    clr.onclick = () => clearWeek(wkMon);
    acts.append(clr);
  }
  bar.append(acts);
  block.append(bar);

  const grid = el('div', 'ca-week-grid');
  for (let i = 0; i < 7; i++) {
    const dayIso = addDays(wkMon, i);
    const col = el('div', 'ca-day' + (dayIso === today ? ' ca-day-today' : ''));
    col.append(
      el('div', 'ca-day-head', `<span class="ca-day-dow">${DOW[dow(dayIso)]}</span><span class="ca-day-date">${dayNum(dayIso)} ${monthShort(dayIso)}</span>`)
    );
    const list = el('div', 'ca-day-list');
    const entries = state.schedule
      .filter((e) => e.date === dayIso)
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    if (!entries.length) list.append(el('div', 'ca-day-empty', '—'));
    entries.forEach((e) => {
      const tpl = state.templates.find((t) => t.id === e.templateId);
      const chip = el('div', 'ca-slot');
      chip.style.borderLeftColor = (tpl && tpl.color) || '#8B7BF7';
      chip.append(
        el('div', 'ca-slot-name', esc(e.name)),
        el('div', 'ca-slot-time', `${fmtTime(e.start_time)}${e.end_time ? '–' + fmtTime(e.end_time) : ''}`)
      );
      const x = el('button', 'ca-slot-x', '×');
      x.title = 'Remove';
      x.onclick = () => {
        state.schedule = state.schedule.filter((z) => z !== e);
        markDirty();
      };
      chip.append(x);
      list.append(chip);
    });
    col.append(list, buildAddSlot(dayIso));
    grid.append(col);
  }
  block.append(grid);
  return block;
}

function buildAddSlot(dayIso) {
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
      date: dayIso,
      templateId: t.id,
      name: t.name,
      start_time: start.value,
      end_time: end.value || null,
      recurrence_group_id: uuid(),
    });
    markDirty();
  };

  const fields = el('div', 'ca-add-fields');
  fields.append(sel, el('span', 'ca-add-at', 'at'), start, el('span', 'ca-add-dash', '–'), end, add);
  panel.append(fields);
  wrap.append(btn, panel);
  return wrap;
}

function duplicateWeek(wkMon) {
  const src = state.schedule.filter((e) => mondayOf(e.date) === wkMon);
  if (!src.length) {
    status('Add some classes to this week first, then duplicate it.', 'info');
    return;
  }
  let added = 0;
  src.forEach((e) => {
    const nd = addDays(e.date, 7);
    const dupe = state.schedule.some(
      (x) => x.date === nd && x.templateId === e.templateId && x.start_time === e.start_time
    );
    if (dupe) return;
    state.schedule.push({
      id: uuid(),
      date: nd,
      templateId: e.templateId,
      name: e.name,
      start_time: e.start_time,
      end_time: e.end_time,
      recurrence_group_id: uuid(),
    });
    added++;
  });
  markDirty();
  status(
    added ? `Copied ${added} class${added > 1 ? 'es' : ''} into the following week.` : 'The following week already matches this one.',
    'success'
  );
}

function clearWeek(wkMon) {
  const n = state.schedule.filter((e) => mondayOf(e.date) === wkMon).length;
  if (!n) return;
  if (!confirm(`Remove all ${n} class${n > 1 ? 'es' : ''} from this week?`)) return;
  state.schedule = state.schedule.filter((e) => mondayOf(e.date) !== wkMon);
  markDirty();
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
    if (!res.ok || !data.ok) throw new Error(data.message || data.error || `Save failed (${res.status})`);
    state.templates = data.templates || state.templates;
    state.schedule = data.schedule || state.schedule;
    state.dirty = false;
    renderAll();
    const m = data.materialised;
    if (data.warning) status('Timetable saved. (Ops-app sync skipped: ' + data.warning + ')', 'info');
    else if (m) status(`Saved. The website timetable is live${m.inserted || m.deleted ? ` · ${m.inserted} added, ${m.deleted} removed in Gym Manager` : ''}.`, 'success');
    else status('Saved. The website timetable is live.', 'success');
  } catch (err) {
    status('Could not save: ' + err.message, '');
    elSave.disabled = false;
    elSave.textContent = 'Save changes';
  }
}
