(function () {
  'use strict';

  // ==========================================
  // REFERENCIAS Y CONSTANTES GLOBAL
  // ==========================================

  const GenshinCore = window.G;
  const $ = (selector) => document.querySelector(selector);
  
  const escapeHtml = GenshinCore.esc;
  const toNumber = GenshinCore.n;
  const formatNumber = GenshinCore.fmt;

  const STORAGE_KEY = 'genshin-bitacora-v2';
  const STORAGE_OLD_KEY = 'genshin-bitacora-v1';
  const HISTORY_KEY = 'genshin-bitacora-history-v2';
  const THEME_KEY = 'genshin-theme';

  const ELEMENT_ICONS = {
    Electro: 'ϟ',
    Pyro: '♨',
    Hydro: '◉',
    Cryo: '❄',
    Dendro: '❀',
    Geo: '⬡',
    Anemo: '✧'
  };

  // ==========================================
  // ESTADO DE LA APLICACIÓN
  // ==========================================

  let characters = [];
  let activeCharacterId = null;
  let selectedCharacterIds = new Set();
  let characterHistory = {};

  // ==========================================
  // UTILIDADES DOM Y NOTIFICACIONES
  // ==========================================

  /**
   * Muestra un mensaje flotante en pantalla (toast notification).
   */
  function showToast(message) {
    const toastEl = $('#toast');
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  /**
   * Obtiene el ícono representativo de un elemento.
   */
  function getElementIcon(element) {
    return ELEMENT_ICONS[element] || '✦';
  }

  /**
   * Genera el HTML de una tarjeta de estadística individual.
   */
  function renderStatCard(label, value, subtext = '') {
    return `
      <div class="stat">
        <small>${escapeHtml(label)}</small>
        <strong>${escapeHtml(value)}</strong>
        <span>${subtext}</span>
      </div>`;
  }

  // ==========================================
  // PERSISTENCIA Y ALMACENAMIENTO LOCAL
  // ==========================================

  /**
   * Carga los personajes e historial desde LocalStorage con migración de versión anterior.
   */
  function loadData() {
    try {
      const rawData = localStorage.getItem(STORAGE_KEY);
      const oldData = localStorage.getItem(STORAGE_OLD_KEY);

      let source = rawData !== null
        ? JSON.parse(rawData)
        : oldData !== null
        ? JSON.parse(oldData)
        : [window.RAZOR_SEED];

      if (!Array.isArray(source)) source = [];

      characters = source
        .map((item) => {
          try {
            return GenshinCore.normalize(item);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      characterHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}') || {};
    } catch (error) {
      console.warn('Error al cargar datos:', error);
      characters = [GenshinCore.normalize(window.RAZOR_SEED)];
      showToast('No se pudieron leer los datos guardados');
    }

    activeCharacterId = characters[0]?.id || null;
  }

  /**
   * Guarda los personajes e historial actuales en LocalStorage y re-renderiza la interfaz.
   */
  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(characters));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(characterHistory));
    } catch {
      showToast('Error de almacenamiento local: exporta una copia de seguridad');
    }
    renderUI();
  }

  // ==========================================
  // BÚSQUEDA Y FILTRADO
  // ==========================================

  /**
   * Filtra los personajes según los criterios de búsqueda y selectores activos.
   */
  function getFilteredCharacters() {
    const searchQuery = $('#search').value.toLocaleLowerCase();
    const elementFilter = $('#elementFilter').value;
    const rarityFilter = $('#rarityFilter').value;
    const levelFilter = $('#levelFilter').value;

    return characters.filter((char) => {
      const matchesSearch = char.nombre.toLocaleLowerCase().includes(searchQuery);
      const matchesElement = !elementFilter || char.elemento === elementFilter;
      const matchesRarity = !rarityFilter || String(char.rareza) === rarityFilter;

      const levelNumber = toNumber(char.nivel.split('/')[0]);
      let matchesLevel = true;

      if (levelFilter === '1') {
        matchesLevel = levelNumber < 40;
      } else if (levelFilter === '40') {
        matchesLevel = levelNumber >= 40 && levelNumber < 70;
      } else if (levelFilter === '70') {
        matchesLevel = levelNumber >= 70 && levelNumber < 90;
      } else if (levelFilter === '90') {
        matchesLevel = levelNumber >= 90;
      }

      return matchesSearch && matchesElement && matchesRarity && matchesLevel;
    });
  }

  // ==========================================
  // RENDERIZADO DE LA INTERFAZ
  // ==========================================

  /**
   * Renderiza la lista lateral, los controles globales y el panel de detalle.
   */
  function renderUI() {
    const visibleChars = getFilteredCharacters();
    const activeChar = characters.find((char) => char.id === activeCharacterId);

    // Contadores y estado de lista
    $('#count').textContent = characters.length;
    $('#selectionInfo').textContent = `${selectedCharacterIds.size} seleccionados`;

    // Checkbox de selección masiva
    const allChecked = visibleChars.length > 0 && visibleChars.every((char) => selectedCharacterIds.has(char.id));
    const someChecked = visibleChars.some((char) => selectedCharacterIds.has(char.id));
    $('#allCheck').checked = allChecked;
    $('#allCheck').indeterminate = someChecked && !allChecked;

    // Habilitar/deshabilitar botones según selección
    $('#exportBtn').disabled = !selectedCharacterIds.size;
    $('#compareBtn').disabled = selectedCharacterIds.size !== 2;
    $('#snapshotBtn').disabled = !activeChar;
    $('#historyBtn').disabled = !activeChar;

    // Lista de personajes lateral
    if (visibleChars.length === 0) {
      $('#list').innerHTML = '<p class="muted pad">No hay resultados.</p>';
    } else {
      $('#list').innerHTML = visibleChars
        .map((char) => {
          const isActive = char.id === activeCharacterId;
          const isSelected = selectedCharacterIds.has(char.id);

          return `
            <div class="char-row ${isActive ? 'active' : ''}">
              <input type="checkbox" aria-label="Seleccionar ${escapeHtml(char.nombre)}" data-check="${escapeHtml(char.id)}" ${isSelected ? 'checked' : ''}>
              <button class="char-choice" data-open="${escapeHtml(char.id)}">
                <span class="avatar ${escapeHtml(char.elemento.toLowerCase())}">${getElementIcon(char.elemento)}</span>
                <span>
                  <b>${escapeHtml(char.nombre)}</b>
                  <small>Nv. ${escapeHtml(char.nivel)} · ${escapeHtml(char.elemento)} · <i>${'★'.repeat(char.rareza)}</i></small>
                </span>
              </button>
            </div>`;
        })
        .join('');
    }

    // Detalle del personaje seleccionado
    if (!activeChar) {
      $('#detail').innerHTML = `
        <div class="panel empty">
          <h2>✦ Comienza tu bitácora</h2>
          <p>Añade un personaje o importa un archivo JSON.</p>
        </div>`;
      return;
    }

    renderDetailPanel(activeChar);
  }

  /**
   * Renderiza el contenido completo del personaje activo en el panel principal.
   */
  function renderDetailPanel(character) {
    const attributes = character.atributos;
    const derived = GenshinCore.derived(character);
    const weapon = character.arma || {};

    const customBonusesHtml = (attributes.bonos || [])
      .map((b) => renderStatCard(`BONO ${b.tipo}`, `${formatNumber(b.valor)}%`))
      .join('');

    const witchSkillsHtml = character.aquelarres.length
      ? `<div class="section-title">✦ Aquelarre / talentos especiales</div>` +
        character.aquelarres
          .map(
            (t) => `
          <article class="panel witch">
            <h3>${escapeHtml(t.nombre)} · Nv. ${toNumber(t.nivel)}</h3>
            <p>${escapeHtml(t.descripcion)}</p>
          </article>`
          )
          .join('')
      : '';

    const artifactsHtml = character.artefactos
      .map((artifact) => {
        const substatsHtml = artifact.secundarias
          .map(
            (s) => `<li>${escapeHtml(s.tipo)} +${formatNumber(s.valor)}${/%/.test(s.tipo) ? '%' : ''}</li>`
          )
          .join('');

        return `
          <article class="panel artifact">
            <div class="artifact-top">
              <span>${escapeHtml(artifact.ranura)}</span>
              <span>+${toNumber(artifact.nivel)}</span>
            </div>
            <h3>${escapeHtml(artifact.nombre || 'Sin equipar')}</h3>
            <small>${escapeHtml(artifact.conjunto || 'Sin conjunto')}</small>
            <p class="mainstat">${escapeHtml(artifact.principal.tipo || '—')} +${formatNumber(artifact.principal.valor)}${/%/.test(artifact.principal.tipo) ? '%' : ''}</p>
            <ul>${substatsHtml}</ul>
            <div class="artifact-score">
              CV ${formatNumber(GenshinCore.cv(artifact))} · Puntuación ${formatNumber(GenshinCore.quality(artifact, character.perfil))}
            </div>
          </article>`;
      })
      .join('');

    $('#detail').innerHTML = `
      <div id="captureArea">
        <div class="hero ${escapeHtml(character.elemento.toLowerCase())}">
          <div class="hero-main">
            <span class="avatar big">${getElementIcon(character.elemento)}</span>
            <div>
              <span class="eyebrow">${escapeHtml(character.elemento.toUpperCase())} · ${character.rareza} ESTRELLAS</span>
              <h2>${escapeHtml(character.nombre)}</h2>
              <p>✦ ${'★'.repeat(character.rareza)} · Nivel ${escapeHtml(character.nivel)}</p>
            </div>
          </div>
          <div class="hero-meta">
            <span>C${character.constelacion} · Constelación</span>
            <span>♡ Amistad ${character.amistad}</span>
            <button id="editBtn" class="ghost">✎ Editar</button>
            <button id="deleteBtn" class="danger">Eliminar</button>
          </div>
        </div>

        <div class="section-title">◈ Atributos del personaje</div>
        <div class="stat-grid">
          ${renderStatCard('VIDA MÁX.', formatNumber(derived.vida), `${formatNumber(attributes.vida?.base)} base + ${formatNumber(attributes.vida?.extra)} extra`)}
          ${renderStatCard('ATQ', formatNumber(derived.ataque), `${formatNumber(attributes.ataque?.base)} base + ${formatNumber(attributes.ataque?.extra)} extra`)}
          ${renderStatCard('DEF', formatNumber(derived.defensa), `${formatNumber(attributes.defensa?.base)} base + ${formatNumber(attributes.defensa?.extra)} extra`)}
          ${renderStatCard('MAESTRÍA ELEMENTAL', formatNumber(attributes.maestria))}
          ${renderStatCard('PROB. CRIT', `${formatNumber(attributes.probCrit)}%`)}
          ${renderStatCard('DAÑO CRIT', `${formatNumber(attributes.danoCrit)}%`)}
          ${renderStatCard('RECARGA', `${formatNumber(attributes.recarga)}%`)}
          ${customBonusesHtml}
        </div>

        <div class="section-title">✧ Build Analyzer <span class="hint">Métricas descriptivas, no simulación de daño</span></div>
        <div class="stat-grid analyzer">
          ${renderStatCard('CV SUBSTATS', formatNumber(derived.cv), 'Sin estadísticas principales')}
          ${renderStatCard('CRIT ESPERADO', `${formatNumber((derived.critExpected - 1) * 100)}%`, 'Bonificación media relativa de críticos')}
          ${renderStatCard('RATIO DAÑO / PROB.', derived.ratio === null ? '—' : formatNumber(derived.ratio), 'Referencial')}
        </div>

        <div class="section-title">⚔ Arma y talentos</div>
        <div class="two-col">
          <article class="panel">
            <h3>${escapeHtml(weapon.nombre || 'Sin arma')}</h3>
            <p>Nv. ${escapeHtml(weapon.nivel || '—')} · R${toNumber(weapon.refinamiento)} · ATQ base ${formatNumber(weapon.ataqueBase)}</p>
            <p>${escapeHtml(weapon.subestadistica?.tipo || 'Subestadística')}: ${formatNumber(weapon.subestadistica?.valor)}</p>
          </article>
          <article class="panel">
            <h3>Talentos de combate</h3>
            <p>Ataque normal ${toNumber(character.talentos?.normal)} · Elemental ${toNumber(character.talentos?.elemental)} · Definitiva ${toNumber(character.talentos?.definitiva)}</p>
          </article>
        </div>

        ${witchSkillsHtml}

        <div class="section-title">⬡ Artefactos <span class="hint">CV = 2 × Prob. CRIT + Daño CRIT de substats</span></div>
        <div class="artifacts">${artifactsHtml}</div>
        <p class="disclaimer">La puntuación ponderada depende del perfil seleccionado; no representa una nota universal de calidad ni sustituye un cálculo de daño.</p>
      </div>`;

    // Eventos del panel activo
    $('#editBtn').onclick = () => openEditorModal(character);
    $('#deleteBtn').onclick = () => {
      if (confirm(`¿Eliminar a ${character.nombre}?`)) {
        characters = characters.filter((item) => item.id !== character.id);
        selectedCharacterIds.delete(character.id);
        activeCharacterId = characters[0]?.id || null;
        saveData();
      }
    };
  }

  // ==========================================
  // COMPONENTES DEL FORMULARIO Y EDITOR
  // ==========================================

  /**
   * Helper para construir campos de formulario.
   */
  function createFormField(label, path, value = '', type = 'text', options = null) {
    const valString = escapeHtml(value ?? '');

    if (options) {
      const optionList = value !== '' && value != null && !options.map(String).includes(String(value))
        ? [String(value), ...options]
        : options;

      const selectOptionsHtml = optionList
        .map((opt) => `<option value="${escapeHtml(opt)}" ${String(opt) === String(value) ? 'selected' : ''}>${escapeHtml(opt)}</option>`)
        .join('');

      return `
        <label class="field">
          <span>${escapeHtml(label)}</span>
          <select data-path="${path}">${selectOptionsHtml}</select>
        </label>`;
    }

    if (type === 'textarea') {
      return `
        <label class="field">
          <span>${escapeHtml(label)}</span>
          <textarea rows="3" data-path="${path}">${valString}</textarea>
        </label>`;
    }

    return `
      <label class="field">
        <span>${escapeHtml(label)}</span>
        <input type="${type}" ${type === 'number' ? 'step="any"' : ''} data-path="${path}" value="${valString}">
      </label>`;
  }

  /**
   * Helper para agrupar campos con una etiqueta legend.
   */
  function createFieldGroup(title, innerHtml) {
    return `<fieldset><legend>${title}</legend><div class="fields">${innerHtml}</div></fieldset>`;
  }

  /**
   * Genera el bloque de entradas para talentos de aquelarre.
   */
  function createWitchFieldBlock(skill, index) {
    return `
      <div class="witch-edit">
        <div class="fields">
          ${createFormField('Nombre', `aquelarres.${index}.nombre`, skill.nombre)}
          ${createFormField('Nivel', `aquelarres.${index}.nivel`, skill.nivel, 'number')}
          ${createFormField('Descripción', `aquelarres.${index}.descripcion`, skill.descripcion, 'textarea')}
        </div>
        <button type="button" class="danger remove-witch">Quitar talento</button>
      </div>`;
  }

  /**
   * Setea una propiedad anidada en un objeto usando una ruta con notación de puntos ("a.b.c").
   */
  function setPropertyByPath(obj, path, value) {
    const parts = path.split('.');
    let current = obj;

    parts.slice(0, -1).forEach((part, idx) => {
      if (current[part] == null) {
        current[part] = /^\d+$/.test(parts[idx + 1]) ? [] : {};
      }
      current = current[part];
    });

    current[parts.at(-1)] = value;
  }

  /**
   * Abre el modal editor y puebla los campos del personaje especificado (o uno por defecto si es nuevo).
   */
  function openEditorModal(characterToEdit) {
    const data = characterToEdit ? GenshinCore.clone(characterToEdit) : GenshinCore.defaults();

    $('#characterForm').dataset.id = data.id;
    $('#editorTitle').textContent = characterToEdit ? `Editar ${characterToEdit.nombre}` : 'Nuevo personaje';

    let html = createFieldGroup(
      'Datos generales',
      createFormField('Nombre *', 'nombre', data.nombre) +
      createFormField('Nivel', 'nivel', data.nivel) +
      createFormField('Elemento', 'elemento', data.elemento, 'text', GenshinCore.elements) +
      createFormField('Rareza', 'rareza', data.rareza, 'number', [4, 5]) +
      createFormField('Constelación', 'constelacion', data.constelacion, 'number') +
      createFormField('Amistad', 'amistad', data.amistad, 'number') +
      createFormField('Perfil de evaluación', 'perfil', data.perfil || 'personalizado', 'text', ['personalizado', 'fisico', 'elemental', 'soporte'])
    );

    html += createFieldGroup(
      'Atributos',
      ['vida', 'ataque', 'defensa']
        .map((key) => createFormField(`${key} base`, `atributos.${key}.base`, data.atributos[key]?.base, 'number') + createFormField(`${key} extra`, `atributos.${key}.extra`, data.atributos[key]?.extra, 'number'))
        .join('') +
      [['Maestría', 'maestria'], ['Prob. CRIT %', 'probCrit'], ['Daño CRIT %', 'danoCrit'], ['Recarga %', 'recarga']]
        .map(([label, key]) => createFormField(label, `atributos.${key}`, data.atributos[key], 'number'))
        .join('') +
      Array.from({ length: 3 }, (_, i) =>
        createFormField(`Bono ${i + 1} · tipo`, `atributos.bonos.${i}.tipo`, data.atributos.bonos?.[i]?.tipo) +
        createFormField(`Bono ${i + 1} · valor`, `atributos.bonos.${i}.valor`, data.atributos.bonos?.[i]?.valor, 'number')
      ).join('')
    );

    html += createFieldGroup(
      'Arma',
      createFormField('Nombre', 'arma.nombre', data.arma.nombre) +
      createFormField('Nivel', 'arma.nivel', data.arma.nivel) +
      createFormField('Refinamiento', 'arma.refinamiento', data.arma.refinamiento, 'number', [1, 2, 3, 4, 5]) +
      createFormField('ATQ base', 'arma.ataqueBase', data.arma.ataqueBase, 'number') +
      createFormField('Subestadística · tipo', 'arma.subestadistica.tipo', data.arma.subestadistica?.tipo) +
      createFormField('Subestadística · valor', 'arma.subestadistica.valor', data.arma.subestadistica?.valor, 'number')
    );

    html += createFieldGroup(
      'Talentos',
      createFormField('Ataque normal', 'talentos.normal', data.talentos.normal, 'number') +
      createFormField('Habilidad elemental', 'talentos.elemental', data.talentos.elemental, 'number') +
      createFormField('Definitiva', 'talentos.definitiva', data.talentos.definitiva, 'number')
    );

    html += `
      <fieldset>
        <legend>Talentos de Aquelarre <button type="button" id="addWitch" class="ghost">＋ Añadir</button></legend>
        <div id="witchFields">${data.aquelarres.map((skill, index) => createWitchFieldBlock(skill, index)).join('')}</div>
      </fieldset>`;

    html += `
      <fieldset>
        <legend>Artefactos</legend>
        ${GenshinCore.slots
          .map((slot, i) => {
            const artifact = data.artefactos[i];
            const mainTypeOptions = GenshinCore.mainTypes.filter((type) => {
              if (slot === 'Flor') return type === 'Vida';
              if (slot === 'Pluma') return type === 'ATQ';
              if (slot === 'Reloj') return ['Vida %', 'DEF %', 'ATQ %', 'Maestría Elemental', 'Recarga de Energía %'].includes(type);
              if (slot === 'Tiara') return ['Vida %', 'DEF %', 'ATQ %', 'Maestría Elemental', 'Prob. CRIT %', 'Daño CRIT %', 'Bono de Curación %'].includes(type);
              return true;
            });

            const substatsHtml = Array.from({ length: 4 }, (_, j) =>
              createFormField(`Sub ${j + 1} · tipo`, `artefactos.${i}.secundarias.${j}.tipo`, artifact.secundarias[j]?.tipo, 'text', ['', ...GenshinCore.subtypes]) +
              createFormField(`Sub ${j + 1} · valor`, `artefactos.${i}.secundarias.${j}.valor`, artifact.secundarias[j]?.valor, 'number')
            ).join('');

            return `
              <div class="artifact-edit">
                <h3>${slot}</h3>
                <div class="fields">
                  ${createFormField('Nombre', `artefactos.${i}.nombre`, artifact.nombre)}
                  ${createFormField('Nivel', `artefactos.${i}.nivel`, artifact.nivel, 'number')}
                  ${createFormField('Conjunto', `artefactos.${i}.conjunto`, artifact.conjunto)}
                  ${createFormField('Principal · tipo', `artefactos.${i}.principal.tipo`, artifact.principal.tipo, 'text', mainTypeOptions)}
                  ${createFormField('Principal · valor', `artefactos.${i}.principal.valor`, artifact.principal.valor, 'number')}
                  ${substatsHtml}
                </div>
              </div>`;
          })
          .join('')}
      </fieldset>`;

    $('#formFields').innerHTML = html;

    $('#addWitch').onclick = () => {
      const currentCount = $('#witchFields').children.length;
      $('#witchFields').insertAdjacentHTML(
        'beforeend',
        createWitchFieldBlock({ nombre: '', nivel: 1, descripcion: '' }, currentCount)
      );
    };

    $('#editor').showModal();
  }

  // ==========================================
  // EXPORTACIÓN E IMPORTACIÓN
  // ==========================================

  /**
   * Genera el payload de exportación formateado (JSON o Markdown).
   */
  function buildExportPayload() {
    const selectedChars = characters.filter((c) => selectedCharacterIds.has(c.id));
    const format = $('#format').value;

    if (format === 'json') {
      return JSON.stringify(
        {
          schema: 'genshin-bitacora',
          version: 3,
          exportedAt: new Date().toISOString(),
          personajes: selectedChars.map((char) => ({
            ...char,
            analisis: GenshinCore.derived(char)
          }))
        },
        null,
        2
      );
    }

    return selectedChars.map(GenshinCore.markdown).join('\n\n---\n\n');
  }

  /**
   * Descarga una cadena como un archivo local.
   */
  function downloadFile(content, fileName, mimeType) {
    const blobUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const downloadLink = document.createElement('a');
    downloadLink.href = blobUrl;
    downloadLink.download = fileName;
    document.body.append(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
  }

  // ==========================================
  // GENERACIÓN DE CAPTURAS DE PANTALLA (CANVAS)
  // ==========================================

  /**
   * Genera e imparte la descarga de un snapshot gráfico en PNG del personaje seleccionado.
   */
  function generateSnapshot() {
    const activeChar = characters.find((c) => c.id === activeCharacterId);
    if (!activeChar) return;

    const derived = GenshinCore.derived(activeChar);
    const canvas = document.createElement('canvas');
    canvas.width = 1100;
    canvas.height = 780;

    const ctx = canvas.getContext('2d');

    // Fondos
    ctx.fillStyle = '#10152c';
    ctx.fillRect(0, 0, 1100, 780);
    ctx.fillStyle = '#1e2548';
    ctx.fillRect(36, 38, 1028, 704);

    // Cabecera
    ctx.fillStyle = '#b8a1ff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('✦ BITÁCORA GENSHIN 2.0', 72, 94);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(activeChar.nombre.slice(0, 23), 72, 176);

    ctx.font = '25px sans-serif';
    ctx.fillStyle = '#aab7d4';
    ctx.fillText(
      `${activeChar.elemento}  ·  ${activeChar.rareza}★  ·  Nivel ${activeChar.nivel}  ·  C${activeChar.constelacion}`,
      72,
      223
    );

    // Cuadrícula de estadísticas
    const statsList = [
      ['VIDA', formatNumber(derived.vida)],
      ['ATQ', formatNumber(derived.ataque)],
      ['DEF', formatNumber(derived.defensa)],
      ['MAESTRÍA', formatNumber(activeChar.atributos.maestria)],
      ['PROB. CRIT', `${formatNumber(activeChar.atributos.probCrit)}%`],
      ['DAÑO CRIT', `${formatNumber(activeChar.atributos.danoCrit)}%`],
      ['RECARGA', `${formatNumber(activeChar.atributos.recarga)}%`],
      ['CV SUBSTATS', formatNumber(derived.cv)]
    ];

    statsList.forEach(([label, val], idx) => {
      const posX = 72 + (idx % 4) * 245;
      const posY = 290 + Math.floor(idx / 4) * 122;

      ctx.fillStyle = '#30385a';
      ctx.fillRect(posX, posY, 226, 98);

      ctx.fillStyle = '#b7bed6';
      ctx.font = '16px sans-serif';
      ctx.fillText(label, posX + 16, posY + 30);

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText(val, posX + 16, posY + 70);
    });

    // Info inferior
    ctx.fillStyle = '#e2d6ff';
    ctx.font = 'bold 23px sans-serif';
    ctx.fillText(`⚔ ${(activeChar.arma?.nombre || 'Sin arma').slice(0, 46)}`, 72, 584);

    ctx.fillStyle = '#b7bed6';
    ctx.font = '20px sans-serif';
    ctx.fillText(
      `Talentos: ${activeChar.talentos.normal} / ${activeChar.talentos.elemental} / ${activeChar.talentos.definitiva}`,
      72,
      622
    );
    ctx.fillText('CV = valor crítico de subestadísticas de artefactos · Archivo personal', 72, 695);

    // Descarga de imagen PNG
    canvas.toBlob((blob) => {
      if (!blob) {
        showToast('No se pudo generar la imagen');
        return;
      }
      const fileSafeName = activeChar.nombre.replace(/[^\w-]/g, '_');
      downloadFile(blob, `${fileSafeName}-bitacora.png`, 'image/png');
    }, 'image/png');
  }

  // ==========================================
  // VINCULACIÓN DE EVENTOS E INICIALIZACIÓN
  // ==========================================

  function bindEvents() {
    // Formulario de edición
    $('#formFields').addEventListener('click', (e) => {
      if (e.target.matches('.remove-witch')) {
        e.target.closest('.witch-edit').remove();
      }
    });

    $('#characterForm').onsubmit = (e) => {
      e.preventDefault();
      const targetId = e.currentTarget.dataset.id;
      const existingChar = characters.find((c) => c.id === targetId);

      const draft = existingChar ? GenshinCore.clone(existingChar) : GenshinCore.defaults();
      draft.id = targetId;
      draft.aquelarres = [];

      $('#formFields')
        .querySelectorAll('[data-path]')
        .forEach((inputEl) => {
          const val = inputEl.type === 'number' ? toNumber(inputEl.value) : inputEl.value.trim();
          setPropertyByPath(draft, inputEl.dataset.path, val);
        });

      // Filtros de limpieza
      draft.aquelarres = (draft.aquelarres || []).filter((t) => t?.nombre);
      draft.atributos.bonos = (draft.atributos.bonos || []).filter((b) => b?.tipo);
      draft.artefactos.forEach((art, idx) => {
        art.ranura = GenshinCore.slots[idx];
        art.secundarias = (art.secundarias || []).filter((s) => s?.tipo).slice(0, 4);
      });

      try {
        const validatedChar = GenshinCore.normalize(draft);

        if (existingChar) {
          (characterHistory[targetId] ??= []).unshift({
            fecha: new Date().toISOString(),
            data: existingChar
          });
          characterHistory[targetId] = characterHistory[targetId].slice(0, 20);

          characters = characters.map((c) => (c.id === targetId ? validatedChar : c));
        } else {
          characters.push(validatedChar);
        }

        activeCharacterId = targetId;
        saveData();
        $('#editor').close();
        showToast('Personaje guardado');
      } catch (err) {
        showToast(err.message);
      }
    };

    // Botones globales principales
    $('#newBtn').onclick = () => openEditorModal(null);
    $('#snapshotBtn').onclick = generateSnapshot;

    // Delegación de selección en la lista
    $('#list').onclick = (e) => {
      const choiceBtn = e.target.closest('[data-open]');
      if (choiceBtn) {
        activeCharacterId = choiceBtn.dataset.open;
        renderUI();
      }
    };

    $('#list').onchange = (e) => {
      if (e.target.matches('[data-check]')) {
        const charId = e.target.dataset.check;
        if (e.target.checked) {
          selectedCharacterIds.add(charId);
        } else {
          selectedCharacterIds.delete(charId);
        }
        renderUI();
      }
    };

    $('#allCheck').onchange = (e) => {
      const isChecked = e.target.checked;
      getFilteredCharacters().forEach((c) => {
        if (isChecked) {
          selectedCharacterIds.add(c.id);
        } else {
          selectedCharacterIds.delete(c.id);
        }
      });
      renderUI();
    };

    // Filtros de búsqueda
    ['search', 'elementFilter', 'rarityFilter', 'levelFilter'].forEach((id) => {
      $('#' + id).addEventListener(id === 'search' ? 'input' : 'change', renderUI);
    });

    // Llenar opciones de elementos en el filtro
    GenshinCore.elements.forEach((el) => {
      $('#elementFilter').insertAdjacentHTML('beforeend', `<option>${el}</option>`);
    });

    // Modales: Exportación
    $('#exportBtn').onclick = () => {
      $('#format').value = 'json';
      $('#exportText').value = buildExportPayload();
      $('#exportDialog').showModal();
    };

    $('#format').onchange = () => {
      $('#exportText').value = buildExportPayload();
    };

    $('#downloadBtn').onclick = () => {
      const isJson = $('#format').value === 'json';
      downloadFile(
        buildExportPayload(),
        `genshin-bitacora.${isJson ? 'json' : 'md'}`,
        'text/plain'
      );
    };

    $('#copyBtn').onclick = async () => {
      try {
        await navigator.clipboard.writeText($('#exportText').value);
        showToast('Copiado al portapapeles');
      } catch {
        $('#exportText').select();
        showToast(document.execCommand('copy') ? 'Copiado' : 'Selecciona y copia el texto manualmente');
      }
    };

    // Modales: Importación
    $('#importBtn').onclick = () => {
      $('#importFeedback').textContent = '';
      $('#importDialog').showModal();
    };

    $('#importFile').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5e6) {
        showToast('Archivo demasiado grande (máx. 5 MB)');
        return;
      }
      $('#importText').value = await file.text();
    };

    $('#confirmImport').onclick = () => {
      try {
        const rawText = $('#importText').value;
        if (rawText.length > 5e6) throw new Error('El JSON supera el límite de 5 MB');

        const parsedJson = JSON.parse(rawText);
        if (parsedJson && parsedJson.schema && parsedJson.schema !== 'genshin-bitacora') {
          throw new Error('Esquema JSON no reconocido');
        }

        const rawList = Array.isArray(parsedJson)
          ? parsedJson
          : Array.isArray(parsedJson?.personajes)
          ? parsedJson.personajes
          : [parsedJson];

        if (!rawList.length) throw new Error('No hay personajes en el archivo');
        if (rawList.length > 500) throw new Error('Máximo 500 personajes por importación');

        const incomingChars = rawList.map(GenshinCore.normalize);
        const importMode = $('#importMode').value;

        let nextCharacters = importMode === 'replace' ? [] : [...characters];

        incomingChars.forEach((char) => {
          if (importMode === 'append') char.id = GenshinCore.uid();
          const targetIndex = nextCharacters.findIndex((x) => x.id === char.id);
          if (targetIndex >= 0) {
            nextCharacters[targetIndex] = char;
          } else {
            nextCharacters.push(char);
          }
        });

        characters = nextCharacters;
        activeCharacterId = incomingChars[0]?.id || characters[0]?.id || null;
        selectedCharacterIds.clear();

        saveData();
        $('#importFeedback').textContent = `✓ Importados ${incomingChars.length} personajes`;
        showToast('Importación completada');
        $('#importDialog').close();
      } catch (err) {
        $('#importFeedback').textContent = '⚠ ' + err.message;
      }
    };

    // Modales: Comparación
    $('#compareBtn').onclick = () => {
      const selectedList = characters.filter((c) => selectedCharacterIds.has(c.id));
      const [charA, charB] = selectedList;

      const derivedA = GenshinCore.derived(charA);
      const derivedB = GenshinCore.derived(charB);

      const comparisonRows = [
        ['Nivel', charA.nivel, charB.nivel],
        ['Elemento', charA.elemento, charB.elemento],
        ['Vida', formatNumber(derivedA.vida), formatNumber(derivedB.vida)],
        ['ATQ', formatNumber(derivedA.ataque), formatNumber(derivedB.ataque)],
        ['DEF', formatNumber(derivedA.defensa), formatNumber(derivedB.defensa)],
        ['Maestría', formatNumber(charA.atributos.maestria), formatNumber(charB.atributos.maestria)],
        ['Prob. CRIT', `${formatNumber(charA.atributos.probCrit)}%`, `${formatNumber(charB.atributos.probCrit)}%`],
        ['Daño CRIT', `${formatNumber(charA.atributos.danoCrit)}%`, `${formatNumber(charB.atributos.danoCrit)}%`],
        ['Recarga', `${formatNumber(charA.atributos.recarga)}%`, `${formatNumber(charB.atributos.recarga)}%`],
        ['CV substats', formatNumber(derivedA.cv), formatNumber(derivedB.cv)]
      ];

      const tableRowsHtml = comparisonRows
        .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
        .join('');

      $('#compareBody').innerHTML = `
        <div class="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Atributo</th>
                <th>${escapeHtml(charA.nombre)}</th>
                <th>${escapeHtml(charB.nombre)}</th>
              </tr>
            </thead>
            <tbody>${tableRowsHtml}</tbody>
          </table>
        </div>`;

      $('#compareDialog').showModal();
    };

    // Modales: Historial de versiones
    $('#historyBtn').onclick = () => {
      const activeChar = characters.find((c) => c.id === activeCharacterId);
      const entries = characterHistory[activeChar.id] || [];

      const historyRowsHtml = entries.length
        ? entries
            .map(
              (item, idx) => `
            <div class="history-row">
              <span>${escapeHtml(new Date(item.fecha).toLocaleString('es-MX'))}</span>
              <button class="ghost" data-restore="${idx}">Restaurar</button>
            </div>`
            )
            .join('')
        : '<p class="muted">Sin versiones anteriores.</p>';

      $('#historyBody').innerHTML = `
        <p>Historial de ${escapeHtml(activeChar.nombre)}. Hasta 20 versiones anteriores.</p>
        <button id="saveSnapshot" class="primary">Guardar snapshot actual</button>
        <div class="history-list">${historyRowsHtml}</div>`;

      $('#saveSnapshot').onclick = () => {
        (characterHistory[activeChar.id] ??= []).unshift({
          fecha: new Date().toISOString(),
          data: GenshinCore.clone(activeChar)
        });
        characterHistory[activeChar.id] = characterHistory[activeChar.id].slice(0, 20);
        saveData();
        $('#historyDialog').close();
        showToast('Snapshot guardado');
      };

      $('#historyBody').querySelectorAll('[data-restore]').forEach((btn) => {
        btn.onclick = () => {
          if (!confirm('¿Restaurar esta versión? Se guardará la actual en el historial.')) return;

          const oldChar = GenshinCore.clone(activeChar);
          const restoredChar = GenshinCore.normalize(entries[Number(btn.dataset.restore)].data);

          characters = characters.map((c) => (c.id === activeChar.id ? restoredChar : c));
          characterHistory[activeChar.id].unshift({
            fecha: new Date().toISOString(),
            data: oldChar
          });
          characterHistory[activeChar.id] = characterHistory[activeChar.id].slice(0, 20);

          saveData();
          $('#historyDialog').close();
        };
      });

      $('#historyDialog').showModal();
    };

    // Cierre genérico de diálogos
    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.onclick = () => $('#' + btn.dataset.close).close();
    });

    // Gestión de temas
    const savedTheme = localStorage.getItem(THEME_KEY) || 'hoyolab';
    const validThemes = ['hoyolab', 'enkanomiya', 'fontaine', 'natlan'];

    $('#theme').value = validThemes.includes(savedTheme) ? savedTheme : 'hoyolab';
    document.body.dataset.theme = $('#theme').value;

    $('#theme').onchange = (e) => {
      document.body.dataset.theme = e.target.value;
      localStorage.setItem(THEME_KEY, e.target.value);
    };
  }

  // ==========================================
  // PUNTO DE ENTRADA E INICIALIZACIÓN
  // ==========================================

  loadData();
  bindEvents();
  saveData();
})();
