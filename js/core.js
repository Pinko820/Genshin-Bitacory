(function () {
  'use strict';

  // --- Constantes ---
  const slots = ['Flor', 'Pluma', 'Reloj', 'Cáliz', 'Tiara'];
  const elements = ['Anemo', 'Geo', 'Electro', 'Dendro', 'Hydro', 'Pyro', 'Cryo'];

  // --- Funciones auxiliares ---
  const esc = (v) =>
    String(v ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }[c])
    );

  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  const fmt = (v) =>
    n(v).toLocaleString('es-MX', { maximumFractionDigits: 1 });

  const uid = () =>
    globalThis.crypto?.randomUUID?.() ||
    `c-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const clone = (v) => JSON.parse(JSON.stringify(v));

  // --- Configuración por defecto ---
  const defaults = () => ({
    id: uid(),
    nombre: '',
    nivel: '1/20',
    elemento: 'Anemo',
    rareza: 4,
    constelacion: 0,
    amistad: 1,
    aquelarres: [],
    atributos: {
      vida: { base: 0, extra: 0 },
      ataque: { base: 0, extra: 0 },
      defensa: { base: 0, extra: 0 },
      maestria: 0,
      probCrit: 5,
      danoCrit: 50,
      recarga: 100,
      bonos: [],
    },
    arma: {
      nombre: '',
      nivel: '1/20',
      refinamiento: 1,
      ataqueBase: 0,
      subestadistica: { tipo: '', valor: 0 },
    },
    talentos: { normal: 1, elemental: 1, definitiva: 1 },
    artefactos: slots.map((ranura) => ({
      ranura,
      nombre: '',
      nivel: 0,
      conjunto: '',
      principal: { tipo: '', valor: 0 },
      secundarias: [],
    })),
    perfil: 'personalizado',
  });

  // --- Normalización de datos ---
  function normalize(input) {
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      !String(input.nombre ?? '').trim()
    ) {
      throw Error('Cada personaje necesita un nombre válido.');
    }

    const d = defaults();
    const x = clone(input);
    Object.assign(d, x);

    d.id = String(x.id || uid());
    d.nombre = String(x.nombre).trim().slice(0, 100);
    d.elemento = elements.includes(x.elemento) ? x.elemento : 'Anemo';
    d.rareza = n(x.rareza) === 5 ? 5 : 4;
    d.constelacion = Math.max(0, Math.min(6, n(x.constelacion)));
    d.amistad = Math.max(0, Math.min(10, n(x.amistad)));

    d.atributos = { ...defaults().atributos, ...(x.atributos || {}) };
    d.arma = { ...defaults().arma, ...(x.arma || {}) };
    d.talentos = { ...defaults().talentos, ...(x.talentos || {}) };

    d.aquelarres = Array.isArray(x.aquelarres)
      ? x.aquelarres
          .filter((t) => t && t.nombre)
          .map((t) => ({
            nombre: String(t.nombre),
            nivel: n(t.nivel),
            descripcion: String(t.descripcion || ''),
          }))
      : x.aquelarre?.nombre
      ? [x.aquelarre]
      : [];

    d.artefactos = slots.map((slot) => {
      const a =
        (Array.isArray(x.artefactos) ? x.artefactos : []).find(
          (t) => t?.ranura === slot
        ) || {};

      return {
        ranura: slot,
        nombre: String(a.nombre || ''),
        nivel: n(a.nivel),
        conjunto: String(a.conjunto || ''),
        principal: {
          tipo: String(a.principal?.tipo || ''),
          valor: n(a.principal?.valor),
        },
        secundarias: (Array.isArray(a.secundarias) ? a.secundarias : [])
          .slice(0, 4)
          .filter((s) => s?.tipo)
          .map((s) => ({
            tipo: String(s.tipo),
            valor: n(s.valor),
          })),
      };
    });

    return d;
  }

  // --- Cálculos de estadísticas y CV ---
  function cv(a) {
    return (a?.secundarias || []).reduce(
      (s, t) =>
        s +
        (/prob\.?\s*crit/i.test(t.tipo)
          ? 2 * n(t.valor)
          : /da[ñn]o\s*crit/i.test(t.tipo)
          ? n(t.valor)
          : 0),
      0
    );
  }

  function derived(c) {
    const a = c.atributos || {};
    const arts = c.artefactos || [];

    return {
      vida: n(a.vida?.base) + n(a.vida?.extra),
      ataque: n(a.ataque?.base) + n(a.ataque?.extra),
      defensa: n(a.defensa?.base) + n(a.defensa?.extra),
      cv: arts.reduce((s, t) => s + cv(t), 0),
      ratio: n(a.probCrit) ? n(a.danoCrit) / n(a.probCrit) : null,
      critExpected: 1 + (n(a.probCrit) * n(a.danoCrit)) / 10000,
    };
  }

  function quality(a, profile = 'personalizado') {
    const weights = {
      fisico: {
        'Prob. CRIT %': 2,
        'Daño CRIT %': 1,
        'ATQ %': 0.8,
        'Recarga de Energía %': 0.35,
      },
      elemental: {
        'Prob. CRIT %': 2,
        'Daño CRIT %': 1,
        'ATQ %': 0.7,
        'Maestría Elemental': 0.12,
        'Recarga de Energía %': 0.4,
      },
      soporte: {
        'Recarga de Energía %': 1.3,
        'Vida %': 0.7,
        'DEF %': 0.6,
        'Maestría Elemental': 0.1,
      },
      personalizado: {
        'Prob. CRIT %': 2,
        'Daño CRIT %': 1,
      },
    };

    const w = weights[profile] || weights.personalizado;
    return (a.secundarias || []).reduce(
      (s, t) => s + n(t.valor) * (w[t.tipo] || 0),
      0
    );
  }

  // --- Generación de Markdown ---
  function markdown(c) {
    const d = derived(c);
    const a = c.atributos || {};

    const bonosFmt =
      (a.bonos || []).map((b) => `${b.tipo} ${b.valor}%`).join(', ') || '—';

    const aquelarresFmt =
      (c.aquelarres || [])
        .map((t) => `- ${t.nombre} (Nv. ${t.nivel}): ${t.descripcion}`)
        .join('\n') || 'Ninguno';

    const artefactosFmt = (c.artefactos || [])
      .map(
        (t) =>
          `### ${t.ranura} · ${t.nombre || 'Sin equipar'} (+${t.nivel})\n` +
          `- Conjunto: ${t.conjunto || '—'}\n` +
          `- Principal: ${t.principal?.tipo || '—'} ${t.principal?.valor || 0}\n` +
          `- Substats: ${(t.secundarias || []).map((s) => `${s.tipo} +${s.valor}`).join(' · ') || '—'}\n` +
          `- CV substats: ${fmt(cv(t))}`
      )
      .join('\n\n');

    return `# ${c.nombre} · ${c.elemento} · ${c.rareza}★

- Nivel: ${c.nivel} · C${c.constelacion} · Amistad ${c.amistad}
- Vida: ${fmt(d.vida)} (${fmt(a.vida?.base)} + ${fmt(a.vida?.extra)})
- ATQ: ${fmt(d.ataque)} (${fmt(a.ataque?.base)} + ${fmt(a.ataque?.extra)})
- DEF: ${fmt(d.defensa)} (${fmt(a.defensa?.base)} + ${fmt(a.defensa?.extra)})
- Maestría: ${fmt(a.maestria)} · Prob. CRIT: ${fmt(a.probCrit)}% · Daño CRIT: ${fmt(a.danoCrit)}% · Recarga: ${fmt(a.recarga)}%
- Bonos: ${bonosFmt}
- CV de subestadísticas: ${fmt(d.cv)} (no incluye estadísticas principales)

## Arma
${c.arma?.nombre || '—'} · Nv. ${c.arma?.nivel || '—'} · R${c.arma?.refinamiento || 1} · ATQ base ${c.arma?.ataqueBase || 0} · ${c.arma?.subestadistica?.tipo || '—'} ${c.arma?.subestadistica?.valor || 0}

## Talentos
Normal ${c.talentos?.normal || 0} · Elemental ${c.talentos?.elemental || 0} · Definitiva ${c.talentos?.definitiva || 0}

## Aquelarre / talentos especiales
${aquelarresFmt}

## Artefactos
${artefactosFmt}`;
  }

  // --- Exportación global ---
  window.G = {
    slots,
    elements,
    esc,
    n,
    fmt,
    uid,
    clone,
    defaults,
    normalize,
    cv,
    derived,
    quality,
    markdown,
  };
})();
