(function () {
  'use strict';

  const G = window.G,
    $ = s => document.querySelector(s),
    E = G.esc,
    N = G.n,
    F = G.fmt,
    KEY = 'genshin-bitacora-v2',
    OLD = 'genshin-bitacora-v1',
    HKEY = 'genshin-bitacora-history-v2',
    IMG_CACHE_KEY = 'genshin-bitacora-images-v1';

  let chars = [],
    active = null,
    selected = new Set(),
    history = {},
    loadFailed = false,
    editorDraft = null,
    previewRaf = null;

  function toast(s) {
    $('#toast').textContent = s;
    $('#toast').classList.add('show');
    setTimeout(() => $('#toast').classList.remove('show'), 2800);
  }

  /* ---------- Imágenes Híbridas (Caché Local + Cloud) ---------- */

  function getCachedImages() {
    try {
      return JSON.parse(localStorage.getItem(IMG_CACHE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function saveCachedImage(nombre, url) {
    if (!nombre || !url) return;
    try {
      const map = getCachedImages();
      map[String(nombre).trim().toLowerCase()] = url;
      localStorage.setItem(IMG_CACHE_KEY, JSON.stringify(map));
    } catch {
      toast('Caché local de imágenes llena; se usará en esta sesión');
    }
  }

  function removeCachedImage(nombre) {
    if (!nombre) return;
    try {
      const map = getCachedImages();
      delete map[String(nombre).trim().toLowerCase()];
      localStorage.setItem(IMG_CACHE_KEY, JSON.stringify(map));
    } catch {}
  }

  function resolveCharacterImage(c) {
    if (!c) return '';
    if (c.imagen) return c.imagen;
    const key = String(c.nombre || '').trim().toLowerCase();
    const cached = getCachedImages()[key];
    if (cached) return cached;
    if (window.BitacoraCloud?.getImageUrl) {
      const cloudUrl = window.BitacoraCloud.getImageUrl(c.nombre);
      if (cloudUrl) return cloudUrl;
    }
    return '';
  }

  function avatarMarkup(c, big = false) {
    const el = c?.elemento || 'Anemo';
    const img = resolveCharacterImage(c);
    const cls = `avatar ${big ? 'big ' : ''}${E(el.toLowerCase())}`;
    return `<span class="${cls}">${img ? `<img src="${E(img)}" alt="${E(c?.nombre || 'Personaje')}">` : icon(el)}</span>`;
  }

  /* ---------- Renderizado de Bonos de Set (con fallback seguro) ---------- */

  function renderSetBonusesMarkup(c, opts = {}) {
    const Sets = G.conjuntos || window.GSets;
    if (Sets?.renderHTML) return Sets.renderHTML(c, opts);
    if (Sets?.summary) {
      const estado = c?.conjuntosActivos || Sets.compute?.(c?.artefactos || []);
      return `<div class="set-bonus-card"><div class="set-bonus-top"><span class="set-bonus-name">${E(Sets.summary(estado))}</span></div></div>`;
    }
    return '';
  }

  function resolveExportFilename(pattern, target, ext) {
    if (typeof G.formatExportFilename === 'function') {
      return G.formatExportFilename(pattern, target, ext);
    }
    const list = Array.isArray(target) ? target : target ? [target] : [];
    const base = list.length === 1 ? (list[0].nombre || 'Personaje') : 'genshin-bitacora';
    const fecha = new Date().toISOString().slice(0, 10);
    return `${base.replace(/[^\w-]+/g, '_')}_${fecha}.${ext}`;
  }

  /* ---------- Carga y Guardado Local ---------- */

  function load() {
    let source, sourceKey = null;
    try {
      const raw = localStorage.getItem(KEY),
        old = localStorage.getItem(OLD);
      sourceKey = raw !== null ? KEY : old !== null ? OLD : null;
      const sourceText = raw !== null ? raw : old;
      try {
        source = sourceKey ? JSON.parse(sourceText) : [window.RAZOR_SEED].filter(Boolean);
      } catch (error) {
        loadFailed = true;
        const backupKey = 'genshin-corrupt-' + Date.now();
        try {
          localStorage.setItem(backupKey, sourceText);
        } catch (storageError) {
          console.warn('No se pudo conservar la copia corrupta', storageError);
        }
        toast('Los datos no se pudieron leer; se conservó una copia en ' + backupKey);
        source = [];
      }
      if (!Array.isArray(source)) source = [];
      const invalid = [];
      chars = source
        .map(x => {
          try {
            const norm = G.normalize(x);
            if (x?.imagen) norm.imagen = String(x.imagen);
            return norm;
          } catch {
            invalid.push(x);
            return null;
          }
        })
        .filter(Boolean);
      if (invalid.length) {
        const invalidKey = 'genshin-invalid-' + Date.now();
        try {
          localStorage.setItem(invalidKey, JSON.stringify(invalid));
        } catch (error) {
          console.warn('No se pudieron conservar fichas inválidas', error);
        }
        toast('Se conservaron ' + invalid.length + ' fichas inválidas en ' + invalidKey);
      }
      try {
        history = JSON.parse(localStorage.getItem(HKEY) || '{}') || {};
      } catch (error) {
        history = {};
        console.warn('Historial inválido', error);
      }
      if (!chars.length && !loadFailed && !sourceKey && window.RAZOR_SEED) {
        chars = [G.normalize(window.RAZOR_SEED)];
      }
    } catch (error) {
      console.warn(error);
      chars = window.RAZOR_SEED ? [G.normalize(window.RAZOR_SEED)] : [];
    }
    active = chars[0]?.id || null;
  }

  function save() {
    if (window.BitacoraCloud) window.BitacoraCloud.onLocalSave(chars);
    try {
      localStorage.setItem(KEY, JSON.stringify(chars));
      localStorage.setItem(HKEY, JSON.stringify(history));
    } catch {
      toast('Error de almacenamiento local: exporta una copia de seguridad');
    }
    render();
  }

  function icon(el) {
    return (
      {
        Electro: 'ϟ',
        Pyro: '♨',
        Hydro: '◉',
        Cryo: '❄',
        Dendro: '❀',
        Geo: '⬡',
        Anemo: '✧'
      }[el] || '✦'
    );
  }

  function levelOf(c) {
    return N(String(c.nivel).split('/')[0]);
  }

  function filtered() {
    const q = $('#search').value.toLocaleLowerCase(),
      e = $('#elementFilter').value,
      r = $('#rarityFilter').value,
      l = $('#levelFilter').value;
    return chars.filter(
      c =>
        c.nombre.toLocaleLowerCase().includes(q) &&
        (!e || c.elemento === e) &&
        (!r || String(c.rareza) === r) &&
        (!l ||
          (l === '1'
            ? levelOf(c) < 40
            : l === '40'
            ? levelOf(c) >= 40 && levelOf(c) < 70
            : l === '70'
            ? levelOf(c) >= 70 && levelOf(c) < 90
            : levelOf(c) >= 90))
    );
  }

  function stat(label, value, sub = '') {
    return `<div class="stat"><small>${E(label)}</small><strong>${E(value)}</strong><span>${sub}</span></div>`;
  }

  /* ---------- Vista Principal ---------- */

  function render() {
    const visible = filtered(),
      c = chars.find(x => x.id === active);
    $('#count').textContent = chars.length;
    $('#list').innerHTML =
      visible
        .map(
          x =>
            `<div class="char-row ${x.id === active ? 'active' : ''}">` +
            `<input type="checkbox" aria-label="Seleccionar ${E(x.nombre)}" data-check="${E(x.id)}" ${selected.has(x.id) ? 'checked' : ''}>` +
            `<button class="char-choice" data-open="${E(x.id)}">${avatarMarkup(x)}<span><b>${E(x.nombre)}</b><small>Nv. ${E(x.nivel)} · ${E(x.elemento)} · <i>${'★'.repeat(x.rareza)}</i></small></span></button>` +
            `</div>`
        )
        .join('') || '<p class="muted pad">No hay resultados.</p>';
    $('#selectionInfo').textContent = `${selected.size} seleccionados`;
    $('#allCheck').checked = visible.length > 0 && visible.every(x => selected.has(x.id));
    $('#allCheck').indeterminate =
      visible.some(x => selected.has(x.id)) && !$('#allCheck').checked;
    $('#exportBtn').disabled = !selected.size;
    $('#compareBtn').disabled = selected.size !== 2;
    $('#snapshotBtn').disabled = !c;
    $('#historyBtn').disabled = !c;

    if (!c) {
      $('#detail').innerHTML =
        '<div class="panel empty"><h2>✦ Comienza tu bitácora</h2><p>Añade un personaje o importa un archivo JSON.</p></div>';
      return;
    }

    const a = c.atributos,
      d = G.derived(c),
      w = c.arma || {},
      setsHtml = renderSetBonusesMarkup(c);

    $('#detail').innerHTML =
      `<div id="captureArea">` +
      `<div class="hero ${E(c.elemento.toLowerCase())}">` +
      `<div class="hero-main">${avatarMarkup(c, true)}<div><span class="eyebrow">${E(c.elemento.toUpperCase())} · ${c.rareza} ESTRELLAS</span><h2>${E(c.nombre)}</h2><p>✦ ${'★'.repeat(c.rareza)} · Nivel ${E(c.nivel)}</p></div></div>` +
      `<div class="hero-meta"><span>C${c.constelacion} · Constelación</span><span>♡ Amistad ${c.amistad}</span><button id="editBtn" class="ghost">✎ Editar</button><button id="deleteBtn" class="danger">Eliminar</button></div>` +
      `</div>` +
      `<div class="section-title">◈ Atributos del personaje</div>` +
      `<div class="stat-grid">` +
      `${stat('VIDA MÁX.', F(d.vida), `${F(a.vida?.base)} base + ${F(a.vida?.extra)} extra`)}` +
      `${stat('ATQ', F(d.ataque), `${F(a.ataque?.base)} base + ${F(a.ataque?.extra)} extra`)}` +
      `${stat('DEF', F(d.defensa), `${F(a.defensa?.base)} base + ${F(a.defensa?.extra)} extra`)}` +
      `${stat('MAESTRÍA ELEMENTAL', F(a.maestria))}` +
      `${stat('PROB. CRIT', F(a.probCrit) + '%')}` +
      `${stat('DAÑO CRIT', F(a.danoCrit) + '%')}` +
      `${stat('RECARGA', F(a.recarga) + '%')}` +
      `${(a.bonos || []).map(b => stat('BONO ' + b.tipo, F(b.valor) + '%')).join('')}` +
      `</div>` +
      `<div class="section-title">✧ Build Analyzer <span class="hint">Métricas descriptivas, no simulación de daño</span></div>` +
      `<div class="stat-grid analyzer">` +
      `${stat('CV SUBSTATS', F(d.cv), 'Sin estadísticas principales')}` +
      `${stat('CRIT ESPERADO', F((d.critExpected - 1) * 100) + '%', 'Bonificación media relativa de críticos')}` +
      `${stat('RATIO DAÑO / PROB.', d.ratio === null ? '—' : F(d.ratio), 'Referencial')}` +
      `</div>` +
      `<div class="section-title">⚔ Arma y talentos</div>` +
      `<div class="two-col">` +
      `<article class="panel"><h3>${E(w.nombre || 'Sin arma')}</h3><p>Nv. ${E(w.nivel || '—')} · R${N(w.refinamiento)} · ATQ base ${F(w.ataqueBase)}</p><p>${E(w.subestadistica?.tipo || 'Subestadística')}: ${F(w.subestadistica?.valor)}</p></article>` +
      `<article class="panel"><h3>Talentos de combate</h3><p>Ataque normal ${N(c.talentos?.normal)} · Elemental ${N(c.talentos?.elemental)} · Definitiva ${N(c.talentos?.definitiva)}</p></article>` +
      `</div>` +
      `${c.aquelarres.length ? `<div class="section-title">✦ Aquelarre / talentos especiales</div>${c.aquelarres.map(t => `<article class="panel witch"><h3>${E(t.nombre)} · Nv. ${N(t.nivel)}</h3><p>${E(t.descripcion)}</p></article>`).join('')}` : ''}` +
      `<div class="section-title">⬡ Artefactos y bonos de conjunto <span class="hint">CV = 2 × Prob. CRIT + Daño CRIT de substats</span></div>` +
      `${setsHtml ? `<div id="cardSetBonuses" class="set-bonuses-summary">${setsHtml}</div>` : ''}` +
      `<div class="artifacts">${c.artefactos.map(t => `<article class="panel artifact"><div class="artifact-top"><span>${E(t.ranura)}</span><span>+${N(t.nivel)}</span></div><h3>${E(t.nombre || 'Sin equipar')}</h3><small>${E(t.conjunto || 'Sin conjunto')}</small><p class="mainstat">${E(t.principal.tipo || '—')} +${F(t.principal.valor)}${/%/.test(t.principal.tipo) ? '%' : ''}</p><ul>${t.secundarias.map(s => `<li>${E(s.tipo)} +${F(s.valor)}${/%/.test(s.tipo) ? '%' : ''}</li>`).join('')}</ul><div class="artifact-score">CV ${F(G.cv(t))} · Puntuación ${F(G.quality(t, c.perfil))}</div></article>`).join('')}</div>` +
      `<p class="disclaimer">La puntuación ponderada depende del perfil seleccionado; no representa una nota universal de calidad ni sustituye un cálculo de daño.</p>` +
      `</div>`;

    $('#editBtn').onclick = () => editor(c);
    $('#deleteBtn').onclick = () => {
      if (confirm(`¿Eliminar a ${c.nombre}?`)) {
        chars = chars.filter(x => x.id !== c.id);
        selected.delete(c.id);
        active = chars[0]?.id || null;
        save();
      }
    };
  }

  /* ---------- Editor por Pestañas + Vista Previa en Tiempo Real ---------- */

  function field(label, path, value = '', type = 'text', options) {
    const v = E(value ?? '');
    return (
      `<label class="field"><span>${E(label)}</span>` +
      `${
        options
          ? `<select data-path="${path}">${(value !== '' &&
            value != null &&
            !options.includes(String(value)) &&
            !options.includes(value)
              ? [String(value), ...options]
              : options
            )
              .map(
                o =>
                  `<option value="${E(o)}" ${String(o) === String(value) ? 'selected' : ''}>${E(o)}</option>`
              )
              .join('')}</select>`
          : type === 'textarea'
          ? `<textarea rows="3" data-path="${path}">${v}</textarea>`
          : `<input type="${type}" ${type === 'number' ? 'step="any"' : ''} data-path="${path}" value="${v}">`
      }</label>`
    );
  }

  function group(title, html) {
    return `<fieldset><legend>${title}</legend><div class="fields">${html}</div></fieldset>`;
  }

  function witchFields(t, i) {
    return (
      `<div class="witch-edit"><div class="fields">` +
      `${field('Nombre', `aquelarres.${i}.nombre`, t.nombre)}` +
      `${field('Nivel', `aquelarres.${i}.nivel`, t.nivel, 'number')}` +
      `${field('Descripción', `aquelarres.${i}.descripcion`, t.descripcion, 'textarea')}` +
      `</div><button type="button" class="danger remove-witch">Quitar talento</button></div>`
    );
  }

  function setPath(obj, path, v) {
    const parts = path.split('.');
    let x = obj;
    parts.slice(0, -1).forEach((p, i) => {
      if (x[p] == null) x[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      x = x[p];
    });
    x[parts.at(-1)] = v;
  }

  function switchEditorTab(tabKey) {
    document.querySelectorAll('#editorTabs .tab-btn').forEach(btn => {
      const isTarget = btn.dataset.tab === tabKey;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', String(isTarget));
    });
    document.querySelectorAll('#formFields .tab-panel').forEach(panel => {
      const isTarget = panel.dataset.tabPanel === tabKey;
      panel.classList.toggle('active', isTarget);
      panel.hidden = !isTarget;
    });
  }

  function syncDraftFromForm() {
    if (!editorDraft) return;
    editorDraft.aquelarres = [];
    $('#formFields')
      .querySelectorAll('[data-path]')
      .forEach(el => {
        setPath(
          editorDraft,
          el.dataset.path,
          el.type === 'number' ? N(el.value) : el.value.trim()
        );
      });
    editorDraft.artefactos.forEach((a, i) => {
      a.ranura = G.slots[i];
    });
    const Sets = G.conjuntos || window.GSets;
    if (Sets?.compute) {
      editorDraft.conjuntosActivos = Sets.compute(editorDraft.artefactos, G.slots);
    }
  }

  function renderEditorLiveUI() {
    if (!editorDraft) return;
    const d = G.derived(editorDraft),
      a = editorDraft.atributos || {},
      w = editorDraft.arma || {},
      nombre = editorDraft.nombre || 'Nuevo personaje',
      setsHtml = renderSetBonusesMarkup(editorDraft),
      setsCompactHtml = renderSetBonusesMarkup(editorDraft, { compact: true });

    const bonusBox = $('#editorSetBonuses');
    if (bonusBox) bonusBox.innerHTML = setsHtml;

    const thumbBox = $('#editorImgThumb');
    if (thumbBox) {
      const imgSrc = resolveCharacterImage(editorDraft);
      thumbBox.innerHTML = imgSrc
        ? `<img src="${E(imgSrc)}" alt="${E(nombre)}">`
        : icon(editorDraft.elemento);
    }

    const previewPane = $('#editorLivePreview');
    if (previewPane) {
      previewPane.innerHTML =
        `<div class="live-card">` +
        `<div class="live-card-head">${avatarMarkup(editorDraft)}<div><span class="eyebrow">${E(editorDraft.elemento)} · ${editorDraft.rareza}★</span><h3>${E(nombre)}</h3><small>Nv. ${E(editorDraft.nivel)} · C${N(editorDraft.constelacion)} · Amistad ${N(editorDraft.amistad)}</small></div></div>` +
        `<div class="live-stats-mini">` +
        `<div class="live-stat-pill"><span>Vida</span><strong>${F(d.vida)}</strong></div>` +
        `<div class="live-stat-pill"><span>ATQ</span><strong>${F(d.ataque)}</strong></div>` +
        `<div class="live-stat-pill"><span>DEF</span><strong>${F(d.defensa)}</strong></div>` +
        `<div class="live-stat-pill"><span>Maestría</span><strong>${F(a.maestria)}</strong></div>` +
        `<div class="live-stat-pill"><span>Prob / Daño</span><strong>${F(a.probCrit)}% / ${F(a.danoCrit)}%</strong></div>` +
        `<div class="live-stat-pill"><span>CV Substats</span><strong>${F(d.cv)}</strong></div>` +
        `</div>` +
        `<div class="live-stat-pill"><span>Arma / Talentos</span><strong>${E(w.nombre || 'Sin arma')} · ${N(editorDraft.talentos?.normal)}/${N(editorDraft.talentos?.elemental)}/${N(editorDraft.talentos?.definitiva)}</strong></div>` +
        `${setsCompactHtml ? `<div><span class="eyebrow">BONOS DE CONJUNTO ACTIVOS</span><div class="set-bonuses-summary" style="margin-top:6px;margin-bottom:0">${setsCompactHtml}</div></div>` : ''}` +
        `</div>`;
    }
  }

  function scheduleEditorLiveUpdate() {
    if (previewRaf) return;
    previewRaf = requestAnimationFrame(() => {
      previewRaf = null;
      syncDraftFromForm();
      renderEditorLiveUI();
    });
  }

  function editor(c) {
    const d = c ? G.clone(c) : G.defaults();
    editorDraft = d;
    $('#characterForm').dataset.id = d.id;
    $('#editorTitle').textContent = c ? 'Editar ' + c.nombre : 'Nuevo personaje';

    // Pestaña 1: General y Atributos
    $('[data-tab-panel="general"]').innerHTML =
      group(
        'Datos generales',
        field('Nombre *', 'nombre', d.nombre) +
          field('Nivel', 'nivel', d.nivel) +
          field('Elemento', 'elemento', d.elemento, 'text', G.elements) +
          field('Rareza', 'rareza', d.rareza, 'number', [4, 5]) +
          field('Constelación', 'constelacion', d.constelacion, 'number') +
          field('Amistad', 'amistad', d.amistad, 'number') +
          field('Perfil de evaluación', 'perfil', d.perfil || 'personalizado', 'text', [
            'personalizado',
            'fisico',
            'elemental',
            'soporte'
          ])
      ) +
      group(
        'Atributos',
        ['vida', 'ataque', 'defensa']
          .map(
            k =>
              field(k + ' base', `atributos.${k}.base`, d.atributos[k]?.base, 'number') +
              field(k + ' extra', `atributos.${k}.extra`, d.atributos[k]?.extra, 'number')
          )
          .join('') +
          [
            ['Maestría', 'maestria'],
            ['Prob. CRIT %', 'probCrit'],
            ['Daño CRIT %', 'danoCrit'],
            ['Recarga %', 'recarga']
          ]
            .map(([t, k]) => field(t, 'atributos.' + k, d.atributos[k], 'number'))
            .join('') +
          Array.from(
            { length: 3 },
            (_, i) =>
              field(`Bono ${i + 1} · tipo`, `atributos.bonos.${i}.tipo`, d.atributos.bonos?.[i]?.tipo) +
              field(
                `Bono ${i + 1} · valor`,
                `atributos.bonos.${i}.valor`,
                d.atributos.bonos?.[i]?.valor,
                'number'
              )
          ).join('')
      );

    // Pestaña 2: Arma y Talentos
    $('[data-tab-panel="weapon"]').innerHTML =
      group(
        'Arma',
        field('Nombre', 'arma.nombre', d.arma.nombre) +
          field('Nivel', 'arma.nivel', d.arma.nivel) +
          field('Refinamiento', 'arma.refinamiento', d.arma.refinamiento, 'number', [1, 2, 3, 4, 5]) +
          field('ATQ base', 'arma.ataqueBase', d.arma.ataqueBase, 'number') +
          field('Subestadística · tipo', 'arma.subestadistica.tipo', d.arma.subestadistica?.tipo) +
          field(
            'Subestadística · valor',
            'arma.subestadistica.valor',
            d.arma.subestadistica?.valor,
            'number'
          )
      ) +
      group(
        'Talentos',
        field('Ataque normal', 'talentos.normal', d.talentos.normal, 'number') +
          field('Habilidad elemental', 'talentos.elemental', d.talentos.elemental, 'number') +
          field('Definitiva', 'talentos.definitiva', d.talentos.definitiva, 'number')
      ) +
      `<fieldset><legend>Talentos de Aquelarre <button type="button" id="addWitch" class="ghost">＋ Añadir</button></legend><div id="witchFields">${d.aquelarres.map((t, i) => witchFields(t, i)).join('')}</div></fieldset>`;

    // Pestaña 3: Artefactos (mantiene #editorSetBonuses arriba y renderiza los 5 slots en #editorArtifactsList)
    $('#editorArtifactsList').innerHTML = `<fieldset><legend>Artefactos equipados</legend>${G.slots
      .map((slot, i) => {
        const t = d.artefactos[i];
        return (
          `<div class="artifact-edit"><h3>${slot}</h3><div class="fields">` +
          `${field('Nombre', `artefactos.${i}.nombre`, t.nombre)}` +
          `${field('Nivel', `artefactos.${i}.nivel`, t.nivel, 'number')}` +
          `${field('Conjunto', `artefactos.${i}.conjunto`, t.conjunto)}` +
          `${field(
            'Principal · tipo',
            `artefactos.${i}.principal.tipo`,
            t.principal.tipo,
            'text',
            G.mainTypes.filter(type =>
              slot === 'Flor'
                ? type === 'Vida'
                : slot === 'Pluma'
                ? type === 'ATQ'
                : slot === 'Reloj'
                ? ['Vida %', 'DEF %', 'ATQ %', 'Maestría Elemental', 'Recarga de Energía %'].includes(type)
                : slot === 'Tiara'
                ? [
                    'Vida %',
                    'DEF %',
                    'ATQ %',
                    'Maestría Elemental',
                    'Prob. CRIT %',
                    'Daño CRIT %',
                    'Bono de Curación %'
                  ].includes(type)
                : true
            )
          )}` +
          `${field('Principal · valor', `artefactos.${i}.principal.valor`, t.principal.valor, 'number')}` +
          `${Array.from(
            { length: 4 },
            (_, j) =>
              field(
                `Sub ${j + 1} · tipo`,
                `artefactos.${i}.secundarias.${j}.tipo`,
                t.secundarias[j]?.tipo,
                'text',
                ['', ...G.subtypes]
              ) +
              field(
                `Sub ${j + 1} · valor`,
                `artefactos.${i}.secundarias.${j}.valor`,
                t.secundarias[j]?.valor,
                'number'
              )
          ).join('')}` +
          `</div></div>`
        );
      })
      .join('')}</fieldset>`;

    // Pestaña 4: Personalización e Imágenes Híbridas
    const currentImg = resolveCharacterImage(d);
    $('#editorImageControls').innerHTML = `
      <span class="eyebrow">IMAGEN DEL PERSONAJE (SISTEMA HÍBRIDO)</span>
      <div class="hybrid-image-row">
        <div id="editorImgThumb" class="hybrid-thumb-preview">
          ${currentImg ? `<img src="${E(currentImg)}" alt="Vista previa">` : icon(d.elemento)}
        </div>
        <div class="hybrid-image-actions">
          <label class="ghost" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
            ⇧ Subir imagen
            <input type="file" id="editorCustomImgFile" accept="image/png,image/jpeg,image/webp" hidden>
          </label>
          <button type="button" id="editorOpenGalleryBtn" class="ghost">▦ Gestor híbrido</button>
          <button type="button" id="editorClearImgBtn" class="ghost">↺ Usar icono elemental</button>
        </div>
      </div>
      <p id="editorImgStatus" class="hint" style="margin:6px 0 0">Catálogo automático, caché local o subida personalizada a Storage.</p>
    `;

    $('#editorCustomFields').innerHTML = group(
      'Ajustes de ficha',
      field('URL o ruta de imagen personalizada', 'imagen', currentImg)
    );

    $('#editorCustomImgFile').onchange = async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 3 * 1024 * 1024) {
        toast('La imagen supera el máximo de 3 MB');
        return;
      }
      const charName = $('[data-path="nombre"]')?.value.trim() || d.nombre;
      const statusEl = $('#editorImgStatus');
      if (statusEl) statusEl.textContent = 'Procesando imagen en caché local...';

      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = String(reader.result || '');
        const urlInput = $('[data-path="imagen"]');
        if (urlInput) urlInput.value = dataUrl;
        editorDraft.imagen = dataUrl;
        if (charName) saveCachedImage(charName, dataUrl);
        renderEditorLiveUI();

        const cloudUpload =
          window.BitacoraCloud?.saveCharacterImage || window.BitacoraCloud?.uploadCharacterImage;
        if (cloudUpload && charName) {
          try {
            if (statusEl) statusEl.textContent = 'Sincronizando con Firebase Storage...';
            const savedUrl = await cloudUpload(charName, file);
            if (savedUrl) {
              if (urlInput) urlInput.value = savedUrl;
              editorDraft.imagen = savedUrl;
              saveCachedImage(charName, savedUrl);
              renderEditorLiveUI();
            }
            if (statusEl) statusEl.textContent = '✓ Imagen guardada en caché y Storage';
          } catch (err) {
            if (statusEl) statusEl.textContent = '✓ Guardada localmente (' + err.message + ')';
          }
        } else if (charName && $('#imageCharacter') && $('#imageFile') && $('#saveImage')) {
          $('#imageCharacter').value = charName;
          const dt = new DataTransfer();
          dt.items.add(file);
          $('#imageFile').files = dt.files;
          $('#saveImage').click();
          if (statusEl) statusEl.textContent = '✓ Enviada al gestor híbrido de imágenes';
        } else if (statusEl) {
          statusEl.textContent = '✓ Imagen aplicada desde caché local';
        }
      };
      reader.readAsDataURL(file);
    };

    $('#editorOpenGalleryBtn').onclick = () => {
      const charName = $('[data-path="nombre"]')?.value.trim() || d.nombre;
      if ($('#imageCharacter')) $('#imageCharacter').value = charName;
      $('#imageDialog')?.showModal();
    };

    $('#editorClearImgBtn').onclick = () => {
      const charName = $('[data-path="nombre"]')?.value.trim() || d.nombre;
      const urlInput = $('[data-path="imagen"]');
      if (urlInput) urlInput.value = '';
      delete editorDraft.imagen;
      if (charName) removeCachedImage(charName);
      const statusEl = $('#editorImgStatus');
      if (statusEl) statusEl.textContent = 'Icono elemental restaurado.';
      renderEditorLiveUI();
    };

    $('#addWitch').onclick = () => {
      const i = $('#witchFields').children.length;
      $('#witchFields').insertAdjacentHTML(
        'beforeend',
        witchFields({ nombre: '', nivel: 1, descripcion: '' }, i)
      );
      scheduleEditorLiveUpdate();
    };

    switchEditorTab('general');
    renderEditorLiveUI();
    $('#editor').showModal();
  }

  $('#editorTabs')?.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn) switchEditorTab(btn.dataset.tab);
  });

  $('#formFields').addEventListener('input', scheduleEditorLiveUpdate);
  $('#formFields').addEventListener('change', scheduleEditorLiveUpdate);
  $('#formFields').addEventListener('click', e => {
    if (e.target.matches('.remove-witch')) {
      e.target.closest('.witch-edit').remove();
      scheduleEditorLiveUpdate();
    }
  });

  $('#characterForm').onsubmit = e => {
    e.preventDefault();
    const id = e.currentTarget.dataset.id,
      old = chars.find(x => x.id === id),
      d = old ? G.clone(old) : G.defaults();

    d.id = id;
    d.aquelarres = [];
    $('#formFields')
      .querySelectorAll('[data-path]')
      .forEach(el =>
        setPath(d, el.dataset.path, el.type === 'number' ? N(el.value) : el.value.trim())
      );

    d.aquelarres = (d.aquelarres || []).filter(t => t?.nombre);
    d.atributos.bonos = (d.atributos.bonos || []).filter(b => b?.tipo);
    d.artefactos.forEach((a, i) => {
      a.ranura = G.slots[i];
      a.secundarias = (a.secundarias || []).filter(s => s?.tipo).slice(0, 4);
    });

    try {
      const valid = G.normalize(d);
      if (d.imagen) {
        valid.imagen = d.imagen;
        if (valid.nombre) saveCachedImage(valid.nombre, d.imagen);
      } else {
        delete valid.imagen;
      }

      if (old) {
        (history[id] ??= []).unshift({ fecha: new Date().toISOString(), data: old });
        history[id] = history[id].slice(0, 20);
        chars = chars.map(x => (x.id === id ? valid : x));
      } else {
        chars.push(valid);
      }
      active = id;
      editorDraft = null;
      save();
      $('#editor').close();
      toast('Personaje guardado');
    } catch (err) {
      toast(err.message);
    }
  };

  /* ---------- Exportación Personalizada ---------- */

  function exportPayload() {
    const subset = chars.filter(c => selected.has(c.id));
    return $('#format').value === 'json'
      ? JSON.stringify(
          {
            schema: 'genshin-bitacora',
            version: 3,
            exportedAt: new Date().toISOString(),
            personajes: subset.map(c => ({ ...c, analisis: G.derived(c) }))
          },
          null,
          2
        )
      : subset.map(G.markdown).join('\n\n---\n\n');
  }

  function refreshExportFilename() {
    const subset = chars.filter(c => selected.has(c.id));
    const ext = $('#format').value === 'json' ? 'json' : 'md';
    const pattern =
      $('#exportPattern')?.value ||
      (typeof G.getExportPattern === 'function' ? G.getExportPattern() : '{Personaje}_Nv{Nivel}_{Fecha}');
    const filename = resolveExportFilename(pattern, subset, ext);
    if ($('#exportFilenamePreview')) $('#exportFilenamePreview').textContent = filename;
    return filename;
  }

  function download(text, name, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  $('#exportBtn').onclick = () => {
    $('#format').value = 'json';
    if ($('#exportPattern') && typeof G.getExportPattern === 'function') {
      $('#exportPattern').value = G.getExportPattern();
    }
    $('#exportText').value = exportPayload();
    refreshExportFilename();
    $('#exportDialog').showModal();
  };

  $('#format').onchange = () => {
    $('#exportText').value = exportPayload();
    refreshExportFilename();
  };

  $('#exportPattern')?.addEventListener('input', e => {
    if (typeof G.setExportPattern === 'function') G.setExportPattern(e.target.value);
    refreshExportFilename();
  });

  document.querySelectorAll('#exportDialog .token-chip').forEach(chip => {
    chip.onclick = () => {
      const input = $('#exportPattern');
      if (!input) return;
      const token = chip.dataset.token || '';
      input.value = input.value ? `${input.value}_${token}` : token;
      if (typeof G.setExportPattern === 'function') G.setExportPattern(input.value);
      refreshExportFilename();
    };
  });

  $('#downloadBtn').onclick = () => {
    const filename = refreshExportFilename();
    download(exportPayload(), filename, 'text/plain');
  };

  $('#copyBtn').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('#exportText').value);
      toast('Copiado al portapapeles');
    } catch {
      $('#exportText').select();
      toast(document.execCommand('copy') ? 'Copiado' : 'Selecciona y copia el texto manualmente');
    }
  };

  /* ---------- Importación, Comparador, Historial y Captura PNG ---------- */

  $('#importBtn').onclick = () => {
    $('#importFeedback').textContent = '';
    $('#importDialog').showModal();
  };

  $('#importFile').onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5e6) {
      toast('Archivo demasiado grande (máx. 5 MB)');
      return;
    }
    $('#importText').value = await f.text();
  };

  $('#confirmImport').onclick = () => {
    try {
      const raw = $('#importText').value;
      if (raw.length > 5e6) throw Error('El JSON supera el límite de 5 MB');
      const obj = JSON.parse(raw);
      if (obj && obj.schema && obj.schema !== 'genshin-bitacora')
        throw Error('Esquema JSON no reconocido');
      const arr = Array.isArray(obj) ? obj : Array.isArray(obj?.personajes) ? obj.personajes : [obj];
      if (!arr.length) throw Error('No hay personajes en el archivo');
      if (arr.length > 500) throw Error('Máximo 500 personajes por importación');
      const incoming = arr.map(item => {
          const norm = G.normalize(item);
          if (item?.imagen) norm.imagen = String(item.imagen);
          return norm;
        }),
        mode = $('#importMode').value;
      let next = mode === 'replace' ? [] : [...chars];
      incoming.forEach(c => {
        if (mode === 'append') c.id = G.uid();
        const idx = next.findIndex(x => x.id === c.id);
        if (idx >= 0) next[idx] = c;
        else next.push(c);
      });
      chars = next;
      active = incoming[0]?.id || chars[0]?.id || null;
      selected.clear();
      save();
      $('#importFeedback').textContent = `✓ Importados ${incoming.length} personajes`;
      toast('Importación completada');
      $('#importDialog').close();
    } catch (err) {
      $('#importFeedback').textContent = '⚠ ' + err.message;
    }
  };

  $('#compareBtn').onclick = () => {
    const [a, b] = chars.filter(c => selected.has(c.id)),
      da = G.derived(a),
      db = G.derived(b),
      Sets = G.conjuntos || window.GSets;
    const rows = [
      ['Nivel', a.nivel, b.nivel],
      ['Elemento', a.elemento, b.elemento],
      ['Vida', F(da.vida), F(db.vida)],
      ['ATQ', F(da.ataque), F(db.ataque)],
      ['DEF', F(da.defensa), F(db.defensa)],
      ['Maestría', F(a.atributos.maestria), F(b.atributos.maestria)],
      ['Prob. CRIT', F(a.atributos.probCrit) + '%', F(b.atributos.probCrit) + '%'],
      ['Daño CRIT', F(a.atributos.danoCrit) + '%', F(b.atributos.danoCrit) + '%'],
      ['Recarga', F(a.atributos.recarga) + '%', F(b.atributos.recarga) + '%'],
      ['CV substats', F(da.cv), F(db.cv)],
      [
        'Conjuntos',
        Sets?.summary ? Sets.summary(a.conjuntosActivos || Sets.compute?.(a.artefactos)) : '—',
        Sets?.summary ? Sets.summary(b.conjuntosActivos || Sets.compute?.(b.artefactos)) : '—'
      ]
    ];
    $('#compareBody').innerHTML = `<div class="tablewrap"><table><thead><tr><th>Atributo</th><th>${E(a.nombre)}</th><th>${E(b.nombre)}</th></tr></thead><tbody>${rows.map(r => `<tr>${r.map(v => `<td>${E(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    $('#compareDialog').showModal();
  };

  $('#historyBtn').onclick = () => {
    const c = chars.find(x => x.id === active),
      entries = history[c.id] || [];
    $('#historyBody').innerHTML = `<p>Historial de ${E(c.nombre)}. Hasta 20 versiones anteriores.</p><button id="saveSnapshot" class="primary">Guardar snapshot actual</button><div class="history-list">${entries.map((x, i) => `<div class="history-row"><span>${E(new Date(x.fecha).toLocaleString('es-MX'))}</span><button class="ghost" data-restore="${i}">Restaurar</button></div>`).join('') || '<p class="muted">Sin versiones anteriores.</p>'}</div>`;
    $('#saveSnapshot').onclick = () => {
      (history[c.id] ??= []).unshift({ fecha: new Date().toISOString(), data: G.clone(c) });
      history[c.id] = history[c.id].slice(0, 20);
      save();
      $('#historyDialog').close();
      toast('Snapshot guardado');
    };
    $('#historyBody')
      .querySelectorAll('[data-restore]')
      .forEach(
        b =>
          (b.onclick = () => {
            if (!confirm('¿Restaurar esta versión? Se guardará la actual en el historial.'))
              return;
            const old = G.clone(c),
              rawData = entries[Number(b.dataset.restore)].data,
              restored = G.normalize(rawData);
            if (rawData?.imagen) restored.imagen = rawData.imagen;
            chars = chars.map(x => (x.id === c.id ? restored : x));
            history[c.id].unshift({ fecha: new Date().toISOString(), data: old });
            history[c.id] = history[c.id].slice(0, 20);
            save();
            $('#historyDialog').close();
          })
      );
    $('#historyDialog').showModal();
  };

  function snapshot() {
    const c = chars.find(x => x.id === active);
    if (!c) return;
    const d = G.derived(c),
      Sets = G.conjuntos || window.GSets,
      canvas = document.createElement('canvas');
    canvas.width = 1100;
    canvas.height = 820;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#10152c';
    ctx.fillRect(0, 0, 1100, 820);
    ctx.fillStyle = '#1e2548';
    ctx.fillRect(36, 38, 1028, 744);
    ctx.fillStyle = '#b8a1ff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('✦ BITÁCORA GENSHIN 4.6', 72, 94);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(c.nombre.slice(0, 23), 72, 176);
    ctx.font = '25px sans-serif';
    ctx.fillStyle = '#aab7d4';
    ctx.fillText(
      `${c.elemento}  ·  ${c.rareza}★  ·  Nivel ${c.nivel}  ·  C${c.constelacion}`,
      72,
      223
    );
    const stats = [
      ['VIDA', F(d.vida)],
      ['ATQ', F(d.ataque)],
      ['DEF', F(d.defensa)],
      ['MAESTRÍA', F(c.atributos.maestria)],
      ['PROB. CRIT', F(c.atributos.probCrit) + '%'],
      ['DAÑO CRIT', F(c.atributos.danoCrit) + '%'],
      ['RECARGA', F(c.atributos.recarga) + '%'],
      ['CV SUBSTATS', F(d.cv)]
    ];
    stats.forEach(([k, v], i) => {
      const x = 72 + (i % 4) * 245,
        y = 290 + Math.floor(i / 4) * 122;
      ctx.fillStyle = '#30385a';
      ctx.fillRect(x, y, 226, 98);
      ctx.fillStyle = '#b7bed6';
      ctx.font = '16px sans-serif';
      ctx.fillText(k, x + 16, y + 30);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText(v, x + 16, y + 70);
    });
    ctx.fillStyle = '#e2d6ff';
    ctx.font = 'bold 23px sans-serif';
    ctx.fillText('⚔ ' + (c.arma?.nombre || 'Sin arma').slice(0, 46), 72, 584);
    ctx.fillStyle = '#b7bed6';
    ctx.font = '20px sans-serif';
    ctx.fillText(
      `Talentos: ${c.talentos.normal} / ${c.talentos.elemental} / ${c.talentos.definitiva}`,
      72,
      622
    );
    const setText = Sets?.summary
      ? Sets.summary(c.conjuntosActivos || Sets.compute?.(c.artefactos))
      : '';
    if (setText) {
      ctx.fillStyle = '#81d8cf';
      ctx.fillText('⬡ Conjuntos: ' + setText.slice(0, 56), 72, 660);
    }
    ctx.fillStyle = '#b7bed6';
    ctx.fillText('CV = valor crítico de subestadísticas de artefactos · Archivo personal', 72, 725);
    canvas.toBlob(blob => {
      if (!blob) {
        toast('No se pudo generar la imagen');
        return;
      }
      const pattern =
        typeof G.getExportPattern === 'function'
          ? G.getExportPattern()
          : '{Personaje}_Nv{Nivel}_{Fecha}';
      const url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = resolveExportFilename(pattern, c, 'png');
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }, 'image/png');
  }

  $('#snapshotBtn').onclick = snapshot;
  $('#newBtn').onclick = () => editor(null);

  $('#list').onclick = e => {
    const b = e.target.closest('[data-open]');
    if (b) {
      active = b.dataset.open;
      render();
    }
  };

  $('#list').onchange = e => {
    if (e.target.matches('[data-check]')) {
      e.target.checked
        ? selected.add(e.target.dataset.check)
        : selected.delete(e.target.dataset.check);
      render();
    }
  };

  $('#allCheck').onchange = e => {
    filtered().forEach(c => (e.target.checked ? selected.add(c.id) : selected.delete(c.id)));
    render();
  };

  ['search', 'elementFilter', 'rarityFilter', 'levelFilter'].forEach(id =>
    $('#' + id).addEventListener(id === 'search' ? 'input' : 'change', render)
  );

  G.elements.forEach(el =>
    $('#elementFilter').insertAdjacentHTML('beforeend', `<option>${el}</option>`)
  );

  document.querySelectorAll('[data-close]').forEach(b => {
    b.onclick = () => {
      if (b.dataset.close === 'editor') editorDraft = null;
      $('#' + b.dataset.close).close();
    };
  });

  const theme = localStorage.getItem('genshin-theme') || 'hoyolab';
  $('#theme').value = ['hoyolab', 'enkanomiya', 'fontaine', 'natlan'].includes(theme)
    ? theme
    : 'hoyolab';
  document.body.dataset.theme = $('#theme').value;
  $('#theme').onchange = e => {
    document.body.dataset.theme = e.target.value;
    localStorage.setItem('genshin-theme', e.target.value);
  };

  load();
  if (!loadFailed) save();

  window.BitacoraBridge = {
    get: () => G.clone(chars),
    apply: next => {
      chars = next.map(item => {
        const norm = G.normalize(item);
        if (item?.imagen) norm.imagen = String(item.imagen);
        return norm;
      });
      if (!chars.some(c => c.id === active)) active = chars[0]?.id || null;
      selected = new Set([...selected].filter(id => chars.some(c => c.id === id)));
      try {
        localStorage.setItem(KEY, JSON.stringify(chars));
      } catch {
        toast('No se pudo guardar localmente');
      }
      render();
    },
    notify: toast
  };

  window.dispatchEvent(new Event('bitacora-ready'));
})();