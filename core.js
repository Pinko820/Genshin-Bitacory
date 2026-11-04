(function () {
	'use strict';

	const slots = ['Flor', 'Pluma', 'Reloj', 'Cáliz', 'Tiara'];
	const elements = ['Anemo', 'Geo', 'Electro', 'Dendro', 'Hydro', 'Pyro', 'Cryo'];

	const esc = v =>
		String(v ?? '').replace(/[&<>"']/g, c => ({
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			"'": '&#39;'
		}[c]));

	const n = v => {
		if (typeof v === 'string')
			v = v.trim().replace(/%/g, '').replace(/\s/g, '').replace(',', '.');
		return v !== '' && v != null && Number.isFinite(Number(v)) ? Number(v) : 0;
	};

	const fmt = v => n(v).toLocaleString('es-MX', { maximumFractionDigits: 1 });

	const subtypes = [
		'Vida', 'Vida %', 'DEF', 'DEF %', 'ATQ', 'ATQ %',
		'Maestría Elemental', 'Recarga de Energía %', 'Prob. CRIT %', 'Daño CRIT %'
	];

	const mainTypes = [
		...subtypes,
		'Bono de Daño Pyro', 'Bono de Daño Hydro', 'Bono de Daño Electro',
		'Bono de Daño Cryo', 'Bono de Daño Anemo', 'Bono de Daño Geo',
		'Bono de Daño Dendro', 'Bono de Daño Físico', 'Bono de Curación %'
	];

	function canonicalType(tipo, valor) {
		let t = String(tipo || '').trim(),
			pct = typeof valor === 'string' && valor.includes('%');
		if (!t) return '';
		const lower = t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
		if (lower.includes('prob') && lower.includes('crit')) return 'Prob. CRIT %';
		if (lower.includes('crit') && lower.includes('dan')) return 'Daño CRIT %';
		if (lower.includes('recarga')) return 'Recarga de Energía %';
		if (lower.includes('maestr')) return 'Maestría Elemental';
		if (lower.includes('curaci')) return 'Bono de Curación %';
		if (lower.includes('bono') && lower.includes('fisic')) return 'Bono de Daño Físico';
		if (lower.includes('bono')) {
			const el = elements.find(e => lower.includes(e.toLowerCase()));
			if (el) return 'Bono de Daño ' + el;
		}
		if (
			lower === 'vida' || lower === 'vida %' ||
			lower === 'hp' || lower === 'hp%'
		)
			return 'Vida' + (pct || lower.includes('%') ? ' %' : '');
		if (
			lower === 'def' || lower === 'defensa' ||
			lower === 'def %' || lower === 'defensa %'
		)
			return 'DEF' + (pct || lower.includes('%') ? ' %' : '');
		if (
			lower === 'atq' || lower === 'ataque' ||
			lower === 'atq %' || lower === 'ataque %'
		)
			return 'ATQ' + (pct || lower.includes('%') ? ' %' : '');
		return t;
	}

	const uid = () =>
		globalThis.crypto?.randomUUID?.() ||
		('c-' + Date.now() + '-' + Math.random().toString(36).slice(2));

	const clone = v => JSON.parse(JSON.stringify(v));

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
			bonos: []
		},
		arma: {
			nombre: '',
			nivel: '1/20',
			refinamiento: 1,
			ataqueBase: 0,
			subestadistica: { tipo: '', valor: 0 }
		},
		talentos: { normal: 1, elemental: 1, definitiva: 1 },
		artefactos: slots.map(ranura => ({
			ranura,
			nombre: '',
			nivel: 0,
			conjunto: '',
			principal: { tipo: '', valor: 0 },
			secundarias: []
		})),
		perfil: 'personalizado'
	});

	function normalize(input) {
		if (!input || typeof input !== 'object' || Array.isArray(input) || !String(input.nombre ?? '').trim())
			throw Error('Cada personaje necesita un nombre válido.');
		const x = input;
		const d = defaults();
		const validId = typeof x.id === 'string' && x.id.length >= 1 && x.id.length <= 200 &&
			!x.id.includes('/') && x.id !== '.' && x.id !== '..' &&
			!(x.id.startsWith('__') && x.id.endsWith('__'));
		d.id = validId ? x.id : uid();
		d.nombre = String(x.nombre).trim().slice(0, 100);
		d.nivel = String(x.nivel ?? '1/20').trim() || '1/20';
		d.elemento = elements.includes(x.elemento) ? x.elemento : 'Anemo';
		d.rareza = n(x.rareza) === 5 ? 5 : 4;
		d.constelacion = Math.max(0, Math.min(6, n(x.constelacion)));
		d.amistad = Math.max(0, Math.min(10, n(x.amistad)));
		d.perfil = ['personalizado', 'fisico', 'elemental', 'soporte'].includes(x.perfil) ? x.perfil : 'personalizado';

		const da = x.atributos && typeof x.atributos === 'object' && !Array.isArray(x.atributos) ? x.atributos : {};
		const pair = v => ({ base: n(v?.base), extra: n(v?.extra) });
		d.atributos = {
			vida: pair(da.vida), ataque: pair(da.ataque), defensa: pair(da.defensa),
			maestria: da.maestria == null ? defaults().atributos.maestria : n(da.maestria),
			probCrit: da.probCrit == null ? defaults().atributos.probCrit : n(da.probCrit),
			danoCrit: da.danoCrit == null ? defaults().atributos.danoCrit : n(da.danoCrit),
			recarga: da.recarga == null ? defaults().atributos.recarga : n(da.recarga),
			bonos: Array.isArray(da.bonos) ? da.bonos.filter(b => b && typeof b === 'object' && typeof b.tipo === 'string' && b.tipo.trim())
				.slice(0, 10).map(b => ({ tipo: String(b.tipo).trim(), valor: n(b.valor) })) : []
		};
		const dw = x.arma && typeof x.arma === 'object' && !Array.isArray(x.arma) ? x.arma : {};
		const sub = dw.subestadistica && typeof dw.subestadistica === 'object' ? dw.subestadistica : {};
		d.arma = {
			nombre: String(dw.nombre ?? '').trim().slice(0, 120),
			nivel: String(dw.nivel ?? '1/20').trim() || '1/20',
			refinamiento: Math.max(1, Math.min(5, n(dw.refinamiento ?? 1))),
			ataqueBase: n(dw.ataqueBase),
			subestadistica: { tipo: typeof sub.tipo === 'string' ? sub.tipo.trim().slice(0, 100) : '', valor: n(sub.valor) }
		};
		const dt = x.talentos && typeof x.talentos === 'object' && !Array.isArray(x.talentos) ? x.talentos : {};
		d.talentos = {
			normal: n(dt.normal ?? 1), elemental: n(dt.elemental ?? 1), definitiva: n(dt.definitiva ?? 1)
		};
		d.aquelarres = Array.isArray(x.aquelarres)
			? x.aquelarres.filter(t => t && typeof t === 'object' && t.nombre)
				.map(t => ({ nombre: String(t.nombre).slice(0, 120), nivel: n(t.nivel), descripcion: String(t.descripcion || '') }))
			: x.aquelarre?.nombre ? [{ nombre: String(x.aquelarre.nombre), nivel: n(x.aquelarre.nivel), descripcion: String(x.aquelarre.descripcion || '') }] : [];
		d.artefactos = slots.map(slot => {
			const a = (Array.isArray(x.artefactos) ? x.artefactos : []).find(t => t?.ranura === slot) || {};
			return {
				ranura: slot, nombre: String(a.nombre || ''), nivel: n(a.nivel), conjunto: String(a.conjunto || ''),
				principal: { tipo: canonicalType(a.principal?.tipo, a.principal?.valor), valor: n(a.principal?.valor) },
				secundarias: (Array.isArray(a.secundarias) ? a.secundarias : []).slice(0, 4)
					.filter(v => v && typeof v === 'object' && v.tipo)
					.map(v => ({ tipo: canonicalType(v.tipo, v.valor), valor: n(v.valor) }))
			};
		});
		return d;
	}

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
		const a = c.atributos || {},
			arts = c.artefactos || [];
		return {
			vida: n(a.vida?.base) + n(a.vida?.extra),
			ataque: n(a.ataque?.base) + n(a.ataque?.extra),
			defensa: n(a.defensa?.base) + n(a.defensa?.extra),
			cv: arts.reduce((s, t) => s + cv(t), 0),
			ratio: n(a.probCrit) ? n(a.danoCrit) / n(a.probCrit) : null,
			critExpected: 1 + (n(a.probCrit) * n(a.danoCrit)) / 10000
		};
	}

	function quality(a, profile = 'personalizado') {
		const weights = {
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
		const w = weights[profile] || weights.personalizado;
		return (a.secundarias || []).reduce(
			(s, t) => s + n(t.valor) * (w[canonicalType(t.tipo, t.valor)] || 0),
			0
		);
	}

	function markdown(c) {
		const d = derived(c),
			a = c.atributos || {};
		return `# ${c.nombre} · ${c.elemento} · ${c.rareza}★

- Nivel: ${c.nivel} · C${c.constelacion} · Amistad ${c.amistad}
- Vida: ${fmt(d.vida)} (${fmt(a.vida?.base)} + ${fmt(a.vida?.extra)})
- ATQ: ${fmt(d.ataque)} (${fmt(a.ataque?.base)} + ${fmt(a.ataque?.extra)})
- DEF: ${fmt(d.defensa)} (${fmt(a.defensa?.base)} + ${fmt(a.defensa?.extra)})
- Maestría: ${fmt(a.maestria)} · Prob. CRIT: ${fmt(a.probCrit)}% · Daño CRIT: ${fmt(a.danoCrit)}% · Recarga: ${fmt(a.recarga)}%
- Bonos: ${(a.bonos || []).map(b => b.tipo + ' ' + b.valor + '%').join(', ') || '—'}
- CV de subestadísticas: ${fmt(d.cv)} (no incluye estadísticas principales)

## Arma
${c.arma?.nombre || '—'} · Nv. ${c.arma?.nivel || '—'} · R${c.arma?.refinamiento || 1} · ATQ base ${c.arma?.ataqueBase || 0} · ${c.arma?.subestadistica?.tipo || '—'} ${c.arma?.subestadistica?.valor || 0}

## Talentos
Normal ${c.talentos?.normal || 0} · Elemental ${c.talentos?.elemental || 0} · Definitiva ${c.talentos?.definitiva || 0}

## Aquelarre / talentos especiales
${(c.aquelarres || []).map(t => `- ${t.nombre} (Nv. ${t.nivel}): ${t.descripcion}`).join('\n') || 'Ninguno'}

## Artefactos
${(c.artefactos || [])
	.map(
		t => `### ${t.ranura} · ${t.nombre || 'Sin equipar'} (+${t.nivel})
- Conjunto: ${t.conjunto || '—'}
- Principal: ${t.principal?.tipo || '—'} ${t.principal?.valor || 0}
- Substats: ${(t.secundarias || [])
	.map(s => `${s.tipo} +${s.valor}`)
	.join(' · ') || '—'}
- CV substats: ${fmt(cv(t))}`
	)
	.join('\n\n')}`;
	}

	window.G = {
		slots,
		elements,
		subtypes,
		mainTypes,
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
