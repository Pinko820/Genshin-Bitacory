/* Bitácora Genshin 4.6 — motor de bonos de conjuntos de artefactos.
 *
 * Módulo puro (sin DOM ni almacenamiento). Se carga antes de core.js y se expone como
 * window.GSets; core.js lo integra en G.normalize (campo derivado `conjuntosActivos`).
 *
 * Reglas:
 *  - Un artefacto cuenta para un conjunto si su campo `conjunto` no está vacío.
 *  - Los nombres se agrupan sin distinguir mayúsculas, acentos, signos ni espacios dobles,
 *    y respetan los alias del catálogo (p. ej. nombre en inglés ↔ español).
 *  - Cada conjunto tiene umbrales de piezas (por defecto 2 y 4). Un bono está activo si
 *    piezas equipadas >= umbral. Con 4 o 5 piezas iguales están activos el bono de 2 y el de 4.
 *  - El catálogo solo enriquece (descripciones, umbrales especiales). Un conjunto que no está
 *    en el catálogo funciona igual con los umbrales por defecto.
 */
(function () {
	'use strict';

	const VERSION = 1;
	const DEFAULT_THRESHOLDS = [2, 4];
	const MAX_PIECES = 5;

	/* ---------- Normalización de nombres ---------- */

	function keyOf(name) {
		return String(name ?? '')
			.normalize('NFD').replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9ñ\s]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	const cleanName = name => String(name ?? '').replace(/\s+/g, ' ').trim();

	/* ---------- Catálogo (extensible) ---------- */

	// clave normalizada (nombre o alias) -> entrada
	const catalog = new Map();

	/**
	 * Registra o actualiza un conjunto conocido.
	 * @param {{nombre:string, aliases?:string[], umbrales?:number[], bonos?:Object<number,string>}} def
	 *   bonos: descripción por número de piezas, p. ej. { 2: 'Daño Físico +25%', 4: '…' }
	 */
	function registerSet(def) {
		if (!def || typeof def !== 'object' || !cleanName(def.nombre))
			throw Error('registerSet: se requiere un nombre.');
		const umbrales = Array.isArray(def.umbrales) && def.umbrales.length
			? [...new Set(def.umbrales.map(Number).filter(k => Number.isInteger(k) && k >= 1 && k <= MAX_PIECES))].sort((a, b) => a - b)
			: DEFAULT_THRESHOLDS.slice();
		const entry = {
			nombre: cleanName(def.nombre),
			clave: keyOf(def.nombre),
			umbrales: umbrales.length ? umbrales : DEFAULT_THRESHOLDS.slice(),
			bonos: { ...(def.bonos || {}) }
		};
		catalog.set(entry.clave, entry);
		(def.aliases || []).forEach(a => { const k = keyOf(a); if (k) catalog.set(k, entry); });
		return entry;
	}

	function lookup(name) {
		return catalog.get(keyOf(name)) || null;
	}

	/** Descripción del bono de `piezas` piezas para un conjunto (texto vacío si no hay dato). */
	function describe(name, piezas) {
		const e = lookup(name);
		return (e && e.bonos[piezas]) || '';
	}

	/* ---------- Motor de cálculo ---------- */

	/**
	 * Analiza los artefactos equipados y devuelve el estado de bonos.
	 * Estructura 100 % JSON-segura (sin arrays anidados ni undefined), apta para Firestore.
	 *
	 * @param {Array} artefactos  Lista de artefactos { ranura, conjunto, ... }.
	 * @param {string[]} [slots]  Ranuras válidas; si se indica, se ignora cualquier otra y
	 *                            solo cuenta el primer artefacto de cada ranura.
	 */
	function compute(artefactos, slots) {
		const seen = new Set();
		const pieces = [];
		(Array.isArray(artefactos) ? artefactos : []).forEach((a, idx) => {
			if (!a || typeof a !== 'object') return;
			const ranura = typeof a.ranura === 'string' && a.ranura ? a.ranura : 'Ranura ' + (idx + 1);
			if (slots && !slots.includes(ranura)) return;
			if (seen.has(ranura)) return;
			seen.add(ranura);
			pieces.push({ ranura, nombre: cleanName(a.conjunto) });
		});

		const groups = new Map();
		const sinConjunto = [];
		pieces.forEach(p => {
			if (!p.nombre) { sinConjunto.push(p.ranura); return; }
			const cat = lookup(p.nombre);
			const clave = cat ? cat.clave : keyOf(p.nombre);
			if (!clave) { sinConjunto.push(p.ranura); return; }
			let g = groups.get(clave);
			if (!g) {
				g = { nombre: cat ? cat.nombre : p.nombre, clave, ranuras: [], umbrales: cat ? cat.umbrales.slice() : DEFAULT_THRESHOLDS.slice(), catalogo: !!cat };
				groups.set(clave, g);
			}
			g.ranuras.push(p.ranura);
		});

		// Más piezas primero; a igualdad, orden alfabético estable.
		const conjuntos = [...groups.values()]
			.sort((a, b) => b.ranuras.length - a.ranuras.length || a.nombre.localeCompare(b.nombre, 'es'))
			.map(g => {
				const piezas = g.ranuras.length;
				const bonosActivos = g.umbrales.filter(u => piezas >= u);
				const siguiente = g.umbrales.find(u => piezas < u);
				return {
					nombre: g.nombre,
					clave: g.clave,
					piezas,
					ranuras: g.ranuras,
					umbrales: g.umbrales,
					bonosActivos,
					activo: bonosActivos.length > 0,
					faltanParaSiguiente: siguiente === undefined ? 0 : siguiente - piezas,
					catalogo: g.catalogo
				};
			});

		const bonosActivos = [];
		conjuntos.forEach(g => g.bonosActivos.forEach(p =>
			bonosActivos.push({ conjunto: g.nombre, clave: g.clave, piezas: p })
		));

		const sueltas = [];
		conjuntos.filter(g => !g.activo).forEach(g => g.ranuras.forEach(r => sueltas.push({ ranura: r, conjunto: g.nombre })));

		const equipadas = pieces.length - sinConjunto.length;
		const patron = conjuntos.length ? conjuntos.map(g => g.piezas).join('+') : '0';
		const conjuntosActivos = conjuntos.filter(g => g.activo);
		const maxPiezas = conjuntos.length ? conjuntos[0].piezas : 0;

		// Clasificación del resultado global.
		let tipo;
		if (conjuntos.some(g => g.bonosActivos.length && g.bonosActivos[g.bonosActivos.length - 1] >= 4)) {
			tipo = 'cuatro_piezas'; // 4 piezas o 5 del mismo conjunto
		} else if (conjuntosActivos.length >= 2) {
			tipo = 'dos_mas_dos'; // dos conjuntos distintos con bono (2+2, 2+2+1, 3+2…)
		} else if (conjuntosActivos.length === 1) {
			tipo = 'dos_piezas'; // un único conjunto con bono parcial (2 o 3 piezas)
		} else {
			tipo = 'sin_bono';
		}

		return {
			version: VERSION,
			tipo,
			patron,
			equipadas,
			maxPiezas,
			sinConjunto,
			conjuntos,
			bonosActivos,
			sueltas
		};
	}

	/**
	 * Devuelve `bonosActivos` con la descripción del catálogo (sin persistir en la ficha,
	 * para que el texto del catálogo pueda cambiar sin alterar los datos guardados).
	 */
	function withDescriptions(estado) {
		const e = estado && typeof estado === 'object' ? estado : compute([]);
		return (e.bonosActivos || []).map(b => ({ ...b, descripcion: describe(b.conjunto, b.piezas) }));
	}

	/** Texto corto para UI/Markdown: «Caballería Sanguinaria (4)» o «Gladiador (2) + Hado (2)». */
	function summary(estado) {
		const act = (estado?.conjuntos || []).filter(g => g.activo);
		if (!act.length) return 'Sin bonos de conjunto';
		return act.map(g => `${g.nombre} (${g.bonosActivos.length ? Math.max(...g.bonosActivos) : 0}p)`).join(' + ');
	}

	/* ---------- Catálogo inicial ---------- */
	// Solo se incluyen datos verificados con el material del proyecto; ampliar con registerSet().
	registerSet({
		nombre: 'Caballería Sanguinaria',
		aliases: ['Bloodstained Chivalry'],
		bonos: {
			2: 'Bono de Daño Físico +25%.',
			4: 'Tras derrotar a un oponente, el ataque cargado no consume Aguante y su daño aumenta un 50% durante 10 s.'
		}
	});

	window.GSets = {
		VERSION,
		keyOf,
		registerSet,
		lookup,
		describe,
		compute,
		withDescriptions,
		summary
	};
})();
