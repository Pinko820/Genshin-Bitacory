(function () {
  'use strict';

  // ==========================================
  // CONSTANTES Y CATÁLOGOS
  // ==========================================

  const SLOTS = ['Flor', 'Pluma', 'Reloj', 'Cáliz', 'Tiara'];
  const ELEMENTS = ['Anemo', 'Geo', 'Electro', 'Dendro', 'Hydro', 'Pyro', 'Cryo'];

  const SUBTYPES = [
    'Vida',
    'Vida %',
    'DEF',
    'DEF %',
    'ATQ',
    'ATQ %',
    'Maestría Elemental',
    'Recarga de Energía %',
    'Prob. CRIT %',
    'Daño CRIT %'
  ];

  const ELEMENTAL_BONUSES = ELEMENTS.map((el) => `Bono de Daño ${el}`);
  const MAIN_TYPES = [
    ...SUBTYPES,
    ...ELEMENTAL_BONUSES,
    'Bono de Daño Físico',
    'Bono de Curación %'
  ];

  const PROFILE_WEIGHTS = {
    fisico: {
      'Prob. CRIT %': 2,
      'Daño CRIT %': 1,
      'ATQ %': 0.8,
      'Recarga de Energía %': 0.35
    },
    elemental: {
      'Prob. CRIT %': 2,
      'Daño CRIT %': 1,
      'ATQ %': 0.7,
      'Maestría Elemental': 0.12,
      'Recarga de Energía %': 0.4
    },
    soporte: {
      'Recarga de Energía %': 1.3,
      'Vida %': 0.7,
      'DEF %': 0.6,
      'Maestría Elemental': 0.1
    },
    personalizado: {
      'Prob. CRIT %': 2,
      'Daño CRIT %': 1
    }
  };

  // ==========================================
  // FUNCIONES DE UTILIDAD (HELPERS)
  // ==========================================

  /**
   * Escapa caracteres especiales de HTML para prevenir XSS.
   */
  const esc = (val) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(val ?? '').replace(/[&<>"']/g, (c) => map[c]);
  };

  /**
   * Convierte y limpia cualquier valor numérico o texto a un número válido.
   */
  const n = (val) => {
    if (typeof val === 'string') {
      val = val.trim().replace(/%/g, '').replace(/\s/g, '').replace(',', '.');
    }
    const num = Number(val);
    return val !== '' && val != null && Number.isFinite(num) ? num : 0;
  };

  /**
   * Formatea un valor numérico según la configuración regional es-MX.
   */
  const fmt = (val, maxFractionDigits = 1) => {
    return n(val).toLocaleString('es-MX', { maximumFractionDigits });
  };

  /**
   * Genera un ID único (Crypto API o fallback).
   */
  const uid = () => {
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `c-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  };

  /**
   * Clona objetos de forma profunda.
   */
  const clone = (val) => {
    if (typeof structuredClone === 'function') {
      return structuredClone(val);
    }
    return JSON.parse(JSON.stringify(val));
  };

  // ==========================================
  // NORMALIZACIÓN DE ATRIBUTOS Y TIPOS
  // ==========================================

  /**
   * Mapea un tipo ingresado a su nombre oficial estandarizado.
   */
  function canonicalType(tipo, valor) {
    const rawType = String(tipo || '').trim();
    if (!rawType) return '';

    const hasPercentInVal = typeof valor === 'string' && valor.includes('%');
    const lower = rawType.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const isPercent = hasPercentInVal || lower.includes('%');

    if (lower.includes('prob') && lower.includes('crit')) return 'Prob. CRIT %';
    if (lower.includes('crit') && lower.includes('dan')) return 'Daño CRIT %';
    if (lower.includes('recarga')) return 'Recarga de Energía %';
    if (lower.includes('maestr')) return 'Maestría Elemental';
    if (lower.includes('curaci')) return 'Bono de Curación %';
    if (lower.includes('bono') && lower.includes('fisic')) return 'Bono de Daño Físico';

    if (lower.includes('bono')) {
      const matchedEl = ELEMENTS.find((el) => lower.includes(el.toLowerCase()));
      if (matchedEl) return `Bono de Daño ${matchedEl}`;
    }

    if (['vida', 'hp'].some((k) => lower.includes(k))) {
      return `Vida${isPercent ? ' %' : ''}`;
    }
    if (['def', 'defensa'].some((k) => lower.includes(k))) {
      return `DEF${isPercent ? ' %' : ''}`;
    }
    if (['atq', 'ataque'].some((k) => lower.includes(k))) {
      return `ATQ${isPercent ? ' %' : ''}`;
    }

    return rawType;
  }

  // ==========================================
  // PLANTILLA POR DEFECTO Y NORMALIZACIÓN DE PERSONAJE
  // ==========================================

  /**
   * Genera el objeto base con la estructura de un personaje.
   */
  function defaults() {
    return {
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
        bonos: []
      },
      arma: {
        nombre: '',
        nivel: '1/20',
        refinamiento: 1,
        ataqueBase: 0,
        subestadistica: { tipo: '', valor: 0 }
      },
      talentos: {
        normal: 1,
        elemental: 1,
        definitiva: 1
      },
      artefactos: SLOTS.map((ranura) => ({
        ranura,
        nombre: '',
        nivel: 0,
        conjunto: '',
        principal: { tipo: '', valor: 0 },
        secundarias: []
      })),
      perfil: 'personalizado'
    };
  }

  /**
   * Valida y normaliza el objeto de personaje ingresado.
   */
  function normalize(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !String(input.nombre ?? '').trim()) {
      throw new Error('Cada personaje necesita un nombre válido.');
    }

    const d = defaults();
    const x = clone(input);
    Object.assign(d, x);

    d.id = String(x.id || uid());
    d.nombre = String(x.nombre).trim().slice(0, 100);
    d.elemento = ELEMENTS.includes(x.elemento) ? x.elemento : 'Anemo';
    d.rareza = n(x.rareza) === 5 ? 5 : 4;
    d.constelacion = Math.max(0, Math.min(6, n(x.constelacion)));
    d.amistad = Math.max(0, Math.min(10, n(x.amistad)));

    d.atributos = { ...defaults().atributos, ...(x.atributos || {}) };
    d.arma = { ...defaults().arma, ...(x.arma || {}) };
    d.talentos = { ...defaults().talentos, ...(x.talentos || {}) };

    if (Array.isArray(x.aquelarres)) {
      d.aquelarres = x.aquelarres
        .filter((t) => t && t.nombre)
        .map((t) => ({
          nombre: String(t.nombre),
          nivel: n(t.nivel),
          descripcion: String(t.descripcion || '')
        }));
    } else if (x.aquelarre?.nombre) {
      d.aquelarres = [x.aquelarre];
    } else {
      d.aquelarres = [];
    }

    const inputArtefactos = Array.isArray(x.artefactos) ? x.artefactos : [];
    d.artefactos = SLOTS.map((slot) => {
      const a = inputArtefactos.find((t) => t?.ranura === slot) || {};
      const secInput = Array.isArray(a.secundarias) ? a.secundarias : [];

      return {
        ranura: slot,
        nombre: String(a.nombre || ''),
        nivel: n(a.nivel),
        conjunto: String(a.conjunto || ''),
        principal: {
          tipo: canonicalType(a.principal?.tipo, a.principal?.valor),
          valor: n(a.principal?.valor)
        },
        secundarias: secInput
          .slice(0, 4)
          .filter((s) => s?.tipo)
          .map((s) => ({
            tipo: canonicalType(s.tipo, s.valor),
            valor: n(s.valor)
          }))
      };
    });

    return d;
  }

  // ==========================================
  // CÁLCULOS Y MÉTRICAS
  // ==========================================

  /**
   * Calcula el Valor Crítico (CV = 2 * Prob. CRIT + Daño CRIT) de un artefacto.
   */
  function cv(artefacto) {
    return (artefacto?.secundarias || []).reduce((sum, sub) => {
      const tipo = sub.tipo || '';
      const val = n(sub.valor);

      if (/prob\.?\s*crit/i.test(tipo)) return sum + 2 * val;
      if (/da[ñn]o\s*crit/i.test(tipo)) return sum + val;
      return sum;
    }, 0);
  }

  /**
   * Calcula los atributos derivados finales y ratios del personaje.
   */
  function derived(character) {
    const a = character.atributos || {};
    const arts = character.artefactos || [];

    const probCrit = n(a.probCrit);
    const danoCrit = n(a.danoCrit);

    return {
      vida: n(a.vida?.base) + n(a.vida?.extra),
      ataque: n(a.ataque?.base) + n(a.ataque?.extra),
      defensa: n(a.defensa?.base) + n(a.defensa?.extra),
      cv: arts.reduce((sum, art) => sum + cv(art), 0),
      ratio: probCrit ? danoCrit / probCrit : null,
      critExpected: 1 + (probCrit * danoCrit) / 10000
    };
  }

  /**
   * Pondera la calidad de subestadísticas según el perfil seleccionado.
   */
  function quality(artefacto, perfil = 'personalizado') {
    const weights = PROFILE_WEIGHTS[perfil] || PROFILE_WEIGHTS.personalizado;

    return (artefacto?.secundarias || []).reduce((sum, sub) => {
      const tipoCanonical = canonicalType(sub.tipo, sub.valor);
      const peso = weights[tipoCanonical] || 0;
      return sum + n(sub.valor) * peso;
    }, 0);
  }

  // ==========================================
  // EXPORTACIÓN A MARKDOWN
  // ==========================================

  /**
   * Genera el reporte del personaje en formato Markdown.
   */
  function markdown(character) {
    const d = derived(character);
    const a = character.atributos || {};
    const bonosStr = (a.bonos || []).map((b) => `${b.tipo} ${b.valor}%`).join(', ') || '—';

    const aquelarreStr = (character.aquelarres || [])
      .map((t) => `- ${t.nombre} (Nv. ${t.nivel}): ${t.descripcion}`)
      .join('\n') || 'Ninguno';

    const artefactosStr = (character.artefactos || [])
      .map((t) => {
        const substatsStr = (t.secundarias || [])
          .map((s) => `${s.tipo} +${s.valor}`)
          .join(' · ') || '—';

        return `### ${t.ranura} · ${t.nombre || 'Sin equipar'} (+${t.nivel})
- Conjunto: ${t.conjunto || '—'}
- Principal: ${t.principal?.tipo || '—'} ${t.principal?.valor || 0}
- Substats: ${substatsStr}
- CV substats: ${fmt(cv(t))}`;
      })
      .join('\n\n');

    return `# ${character.nombre} · ${character.elemento} · ${character.rareza}★

- Nivel: ${character.nivel} · C${character.constelacion} · Amistad ${character.amistad}
- Vida: ${fmt(d.vida)} (${fmt(a.vida?.base)} + ${fmt(a.vida?.extra)})
- ATQ: ${fmt(d.ataque)} (${fmt(a.ataque?.base)} + ${fmt(a.ataque?.extra)})
- DEF: ${fmt(d.defensa)} (${fmt(a.defensa?.base)} + ${fmt(a.defensa?.extra)})
- Maestría: ${fmt(a.maestria)} · Prob. CRIT: ${fmt(a.probCrit)}% · Daño CRIT: ${fmt(a.danoCrit)}% · Recarga: ${fmt(a.recarga)}%
- Bonos: ${bonosStr}
- CV de subestadísticas: ${fmt(d.cv)} (no incluye estadísticas principales)

## Arma
${character.arma?.nombre || '—'} · Nv. ${character.arma?.nivel || '—'} · R${character.arma?.refinamiento || 1} · ATQ base ${character.arma?.ataqueBase || 0} · ${character.arma?.subestadistica?.tipo || '—'} ${character.arma?.subestadistica?.valor || 0}

## Talentos
Normal ${character.talentos?.normal || 0} · Elemental ${character.talentos?.elemental || 0} · Definitiva ${character.talentos?.definitiva || 0}

## Aquelarre / talentos especiales
${aquelarreStr}

## Artefactos
${artefactosStr}`;
  }

  // ==========================================
  // EXPOSICIÓN GLOBAL EN WINDOW
  // ==========================================

  window.G = {
    slots: SLOTS,
    elements: ELEMENTS,
    subtypes: SUBTYPES,
    mainTypes: MAIN_TYPES,
    canonicalType,
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
    markdown
  };
})();
