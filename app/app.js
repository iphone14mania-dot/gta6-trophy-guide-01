// Leonida Trophy Guide: an offline tracker for the 55 GTA VI trophies.
// Loads its data from local JSON files only, saves progress in localStorage,
// and never makes a network request. Views: tracker, roadmap, missables,
// sources. Deep links: #view=, #trophy=<id>, #demo=1, #scroll=<px>,
// #detailScroll=<px>.
const STORE_KEY = 'leonida-trophy-guide-v1';
const DEMO_EARNED = [2, 3, 8, 16, 21, 35, 53];
const KIND_LABELS = {
  story: 'Story', collectibles: 'Collectibles', activities: 'Activities',
  side: 'Side Quests', robberies: 'Robberies', other: 'Other',
};
const GRADE_ORDER = { platinum: 0, gold: 1, silver: 2, bronze: 3 };
const DIFFICULTY = {
  story: 1, activities: 2, collectibles: 3, robberies: 4, side: 5, other: 6,
};
const $ = (id) => document.getElementById(id);

const state = {
  trophies: [],
  roadmap: null,
  earned: new Set(),
  selected: null,
  view: 'tracker',
  spoiler: true,
};

function loadEarned() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
    if (Array.isArray(saved)) return new Set(saved.filter((n) => Number.isInteger(n)));
  } catch { /* a corrupt save starts fresh */ }
  return new Set();
}

function saveEarned() {
  localStorage.setItem(STORE_KEY, JSON.stringify([...state.earned].sort((a, b) => a - b)));
}

function readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  return {
    view: params.get('view'),
    trophy: params.get('trophy'),
    demo: params.get('demo') === '1',
    scroll: params.get('scroll'),
    detailScroll: params.get('detailScroll'),
  };
}

function writeHash() {
  const params = new URLSearchParams();
  if (state.view !== 'tracker') params.set('view', state.view);
  if (state.selected != null) params.set('trophy', String(state.selected));
  const next = params.toString();
  history.replaceState(null, '', next ? `#${next}` : location.pathname);
}

function isHidden(trophy) {
  return state.spoiler && trophy.kind === 'story' && !state.earned.has(trophy.id);
}

function gradeChip(grade) {
  const earned = state.trophies.filter((t) => t.grade === grade && state.earned.has(t.id)).length;
  const total = state.trophies.filter((t) => t.grade === grade).length;
  return `${grade[0].toUpperCase()} ${earned}/${total}`;
}

function renderProgress() {
  const total = state.trophies.length;
  const done = state.earned.size;
  $('progressCount').textContent = `${done} of ${total} earned`;
  $('progressFill').style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
  $('gradeChips').textContent = ['platinum', 'gold', 'silver', 'bronze'].map(gradeChip).join('  ·  ');
}

function filteredTrophies() {
  const query = $('search').value.trim().toLowerCase();
  const kind = $('kind').value;
  const grade = $('grade').value;
  const hideEarned = $('hideEarned').checked;
  let list = state.trophies.filter((t) => {
    if (kind === 'missable' && !t.missable) return false;
    if (kind === 'online') return false;
    if (kind !== 'all' && kind !== 'missable' && t.kind !== kind) return false;
    if (grade !== 'all' && t.grade !== grade) return false;
    if (hideEarned && state.earned.has(t.id)) return false;
    if (query) {
      const hay = `${t.name} ${t.description} ${t.guide} ${t.kind}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
  const sort = $('sort').value;
  const byName = (a, b) => a.name.localeCompare(b.name);
  if (sort === 'name') list.sort(byName);
  else if (sort === 'grade') list.sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || byName(a, b));
  else if (sort === 'difficulty') {
    list.sort((a, b) => {
      const da = a.id === 14 ? 10 : a.id === 1 ? 11 : DIFFICULTY[a.kind];
      const db = b.id === 14 ? 10 : b.id === 1 ? 11 : DIFFICULTY[b.kind];
      return da - db || byName(a, b);
    });
  } else list.sort((a, b) => a.stage - b.stage || a.id - b.id);
  return list;
}

function renderList() {
  const list = filteredTrophies();
  const ol = $('trophyList');
  ol.replaceChildren();
  for (const t of list) {
    const li = document.createElement('li');
    li.className = `trophy-row${state.selected === t.id ? ' selected' : ''}${state.earned.has(t.id) ? ' earned' : ''}`;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = state.earned.has(t.id);
    box.setAttribute('aria-label', `Earned: ${t.name}`);
    box.addEventListener('change', () => {
      if (box.checked) state.earned.add(t.id);
      else state.earned.delete(t.id);
      saveEarned();
      renderProgress();
      renderList();
      renderDetail();
    });
    const body = document.createElement('button');
    body.type = 'button';
    body.className = 'trophy-body';
    const hidden = isHidden(t);
    const name = document.createElement('span');
    name.className = 'trophy-name';
    name.textContent = hidden ? 'Hidden story trophy' : t.name;
    const desc = document.createElement('span');
    desc.className = 'trophy-desc';
    desc.textContent = hidden ? 'Complete the story to reveal it.' : t.description;
    const meta = document.createElement('span');
    meta.className = 'trophy-meta';
    meta.textContent = `${t.grade} · ${KIND_LABELS[t.kind]} · stage ${t.stage}${t.missable ? ' · MISSABLE' : ''}`;
    body.append(name, desc, meta);
    body.addEventListener('click', () => {
      state.selected = t.id;
      writeHash();
      renderList();
      renderDetail();
    });
    li.append(box, body);
    ol.append(li);
  }
  const kind = $('kind').value;
  $('resultCount').textContent = kind === 'online'
    ? '0 online trophies: the whole list is single-player.'
    : `${list.length} of ${state.trophies.length} shown`;
}

function sourceList(sources) {
  const ul = document.createElement('ul');
  ul.className = 'sources';
  for (const s of sources) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = s.name;
    li.append(a);
    ul.append(li);
  }
  return ul;
}

function renderDetail() {
  const panel = $('detail');
  panel.replaceChildren();
  const t = state.trophies.find((x) => x.id === state.selected);
  if (!t) {
    const p = document.createElement('p');
    p.className = 'detail-empty';
    p.textContent = 'Select a trophy to read its guide, steps, tip and sources.';
    panel.append(p);
    return;
  }
  if (isHidden(t)) {
    const p = document.createElement('p');
    p.className = 'detail-empty';
    p.textContent = 'Hidden story trophy: its name, description and guide stay hidden until you earn it. Turn spoiler-free mode off to reveal it.';
    panel.append(p);
    return;
  }
  const title = document.createElement('h2');
  title.textContent = t.name;
  const desc = document.createElement('p');
  desc.className = 'detail-desc';
  desc.textContent = t.description;
  const badges = document.createElement('p');
  badges.className = 'badges';
  badges.textContent = `${t.grade} · ${KIND_LABELS[t.kind]} · roadmap stage ${t.stage}${t.missable ? ' · MISSABLE — read the warning' : ''}`;
  const guide = document.createElement('p');
  guide.className = 'detail-guide';
  guide.textContent = t.guide;
  const stepsTitle = document.createElement('h3');
  stepsTitle.textContent = 'Steps';
  const steps = document.createElement('ol');
  steps.className = 'steps';
  for (const s of t.steps) {
    const li = document.createElement('li');
    li.textContent = s;
    steps.append(li);
  }
  const tip = document.createElement('p');
  tip.className = 'tip';
  tip.textContent = `Tip: ${t.tip}`;
  const sourcesTitle = document.createElement('h3');
  sourcesTitle.textContent = 'Sources';
  panel.append(title, desc, badges, guide, stepsTitle, steps, tip, sourcesTitle, sourceList(t.sources));
}

function renderRoadmap() {
  const r = state.roadmap;
  if (!r) return;
  const facts = $('facts');
  facts.replaceChildren();
  for (const f of r.facts) {
    const div = document.createElement('div');
    div.className = 'fact';
    const k = document.createElement('span');
    k.className = 'fact-label';
    k.textContent = f.label;
    const v = document.createElement('span');
    v.className = 'fact-value';
    v.textContent = f.value;
    div.append(k, v);
    facts.append(div);
  }
  const stages = $('stages');
  stages.replaceChildren();
  for (const s of r.stages) {
    const card = document.createElement('article');
    card.className = 'stage';
    const h = document.createElement('h3');
    h.textContent = `Stage ${s.stage}: ${s.name}`;
    const hours = document.createElement('p');
    hours.className = 'stage-hours';
    hours.textContent = `${s.hours} · ${s.trophies} trophies`;
    const summary = document.createElement('p');
    summary.textContent = s.summary;
    const steps = document.createElement('ol');
    for (const step of s.steps) {
      const li = document.createElement('li');
      li.textContent = step;
      steps.append(li);
    }
    const src = document.createElement('p');
    src.className = 'stage-sources';
    src.textContent = 'Sources: ';
    for (const source of s.sources) {
      const a = document.createElement('a');
      a.href = source.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = source.name;
      src.append(a, ' ');
    }
    card.append(h, hours, summary, steps, src);
    stages.append(card);
  }
  const warnings = $('warnings');
  warnings.replaceChildren();
  for (const w of r.warnings) {
    const card = document.createElement('article');
    card.className = 'warning';
    const h = document.createElement('h3');
    h.textContent = w.title;
    const p = document.createElement('p');
    p.textContent = w.text;
    card.append(h, p);
    warnings.append(card);
  }
}

function renderMissables() {
  const hero = $('missableHero');
  hero.replaceChildren();
  const t = state.trophies.find((x) => x.missable);
  if (t) {
    const kicker = document.createElement('p');
    kicker.className = 'hero-kicker';
    kicker.textContent = 'The only missable trophy · 1 of 55';
    const h = document.createElement('h2');
    h.textContent = t.name;
    const desc = document.createElement('p');
    desc.className = 'hero-desc';
    desc.textContent = t.description;
    const guide = document.createElement('p');
    guide.textContent = t.guide;
    const steps = document.createElement('ol');
    for (const s of t.steps) {
      const li = document.createElement('li');
      li.textContent = s;
      steps.append(li);
    }
    const tip = document.createElement('p');
    tip.className = 'tip';
    tip.textContent = `Tip: ${t.tip}`;
    const srcTitle = document.createElement('h3');
    srcTitle.textContent = 'Sources';
    hero.append(kicker, h, desc, guide, steps, tip, srcTitle, sourceList(t.sources));
  }
  const timing = [
    'Chapter 1, after the mission Down to Earth: find Lucia at Jason\'s house in the morning and accept her balcony meditation invitation. This is the only step in the game that can be missed outright.',
    'The last meditation spot needs both characters and only opens after Coffee Break in Chapter 2: do not expect to finish the set in Chapter 1.',
    'There is no mission replay, so a missed story moment cannot be redone: save manually at the start and end of every chapter.',
    'Quests with an hourglass expire, but none of them counts toward a trophy.',
    'The Irredeemable criminal profile cannot be undone: steer clear of it on a trophy run.',
  ];
  const timingList = $('timingWarnings');
  timingList.replaceChildren();
  for (const item of timing) {
    const li = document.createElement('li');
    li.textContent = item;
    timingList.append(li);
  }
  const safe = [
    'All 12 story trophies: they unlock automatically as you play the story.',
    'All stranger strands: quest givers tied to trophies return after the story, so Andy, Kenton, Billy, Randy, Tyrone and Bret can all be finished in free-roam.',
    'Every collectible, activity and robbery: free-roam continues after the story with the whole map open.',
    'The 100% completion checklist and its 70-of-80 challenge allowance: all doable after the story.',
    'Every miscellaneous trophy, including the ones whose methods are still being confirmed.',
  ];
  const safeList = $('notMissable');
  safeList.replaceChildren();
  for (const item of safe) {
    const li = document.createElement('li');
    li.textContent = item;
    safeList.append(li);
  }
}

function renderSources() {
  const list = $('sourceList');
  list.replaceChildren();
  for (const s of state.roadmap.sources) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = s.name;
    li.append(a);
    list.append(li);
  }
}

function showView(view) {
  state.view = view;
  for (const section of document.querySelectorAll('.view')) {
    section.classList.toggle('active', section.id === `view-${view}`);
  }
  for (const button of document.querySelectorAll('#views button')) {
    button.classList.toggle('active', button.dataset.view === view);
  }
  writeHash();
}

function exportProgress() {
  const blob = new Blob([JSON.stringify([...state.earned].sort((a, b) => a - b))], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'leonida-trophy-progress.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importProgress(file) {
  const data = JSON.parse(await file.text());
  if (!Array.isArray(data)) throw new Error('not an array');
  const valid = new Set(state.trophies.map((t) => t.id));
  state.earned = new Set(data.filter((n) => valid.has(n)));
  saveEarned();
  renderProgress();
  renderList();
  renderDetail();
}

async function init() {
  const [trophyDoc, roadmapDoc] = await Promise.all([
    fetch('data/trophies.json').then((r) => r.json()),
    fetch('data/roadmap.json').then((r) => r.json()),
  ]);
  state.trophies = trophyDoc.trophies;
  state.roadmap = roadmapDoc;
  state.earned = loadEarned();
  const hash = readHash();
  if (hash.demo && state.earned.size === 0) {
    state.earned = new Set(DEMO_EARNED);
  }
  if (hash.view && ['tracker', 'roadmap', 'missables', 'sources'].includes(hash.view)) {
    state.view = hash.view;
  }
  if (hash.trophy) {
    const id = Number(hash.trophy);
    if (state.trophies.some((t) => t.id === id)) state.selected = id;
  }
  $('search').addEventListener('input', renderList);
  $('kind').addEventListener('change', renderList);
  $('grade').addEventListener('change', renderList);
  $('sort').addEventListener('change', renderList);
  $('hideEarned').addEventListener('change', renderList);
  $('spoiler').addEventListener('change', () => {
    state.spoiler = $('spoiler').checked;
    renderList();
    renderDetail();
  });
  for (const button of document.querySelectorAll('#views button')) {
    button.addEventListener('click', () => showView(button.dataset.view));
  }
  $('export').addEventListener('click', exportProgress);
  $('import').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      await importProgress(file);
    } catch {
      alert('That file is not a Leonida Trophy Guide progress export.');
    }
    event.target.value = '';
  });
  $('reset').addEventListener('click', () => {
    if (confirm('Clear all earned trophies?')) {
      state.earned = new Set();
      saveEarned();
      renderProgress();
      renderList();
      renderDetail();
    }
  });
  showView(state.view);
  renderProgress();
  renderList();
  renderDetail();
  renderRoadmap();
  renderMissables();
  renderSources();
  if (hash.scroll) window.scrollTo(0, Number(hash.scroll));
  if (hash.detailScroll) $('detail').scrollTop = Number(hash.detailScroll);
}

init();
