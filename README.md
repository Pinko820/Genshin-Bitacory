# Bitácora Genshin 2.0

Aplicación estática, sin frameworks ni dependencias obligatorias. Preparada para GitHub Pages y para abrir `index.html` directamente mediante doble clic (`file://`). HTML, CSS y JavaScript clásicos locales; no utiliza `fetch` para cargar sus datos iniciales.

## Publicación en GitHub Pages

1. Sube **el contenido de esta carpeta** a la raíz de un repositorio GitHub (o conserva esta carpeta y configura Pages para servirla desde la ubicación adecuada).
2. En **Settings → Pages → Build and deployment**, selecciona **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`.
3. Abre la URL que GitHub Pages indique una vez publicado. No requiere tokens ni API keys.

## Uso offline

Abre `index.html` con doble clic. Todos los scripts y estilos necesarios son locales. El almacenamiento `localStorage` con protocolo `file://` depende del navegador; algunos navegadores aíslan los datos por archivo o los restringen. Para mayor fiabilidad, usa GitHub Pages o un servidor HTTP local y exporta respaldos JSON periódicamente. Los datos de `file://` y GitHub Pages se guardan en orígenes diferentes: expórtalos e impórtalos para migrarlos.

## Funciones

- CRUD de personajes, selección múltiple y filtros por nombre, elemento, rareza y nivel.
- Migración automática de `genshin-bitacora-v1` si aún no existe almacenamiento v2.
- Razor incluido como personaje inicial (sólo en instalaciones nuevas).
- Importación JSON (v1/v2), validación básica, fusión por ID, copia o reemplazo. Exportación JSON/Markdown.
- Talentos de Aquelarre múltiples, cinco artefactos con cuatro substats, arma y atributos.
- Comparación de dos personajes, historial de 20 snapshots por personaje, exportación PNG local con Canvas.
- Temas HoYoLAB, Enkanomiya, Fontaine y Natlan, inspirados en la ambientación (no afiliados).
- CV por artefacto y total de substats; ratio crítico, bonificación crítica media teórica y puntuación orientativa por perfil.

## Fórmulas y limitaciones

`CV = 2 × Σ(Prob. CRIT % de substats) + Σ(Daño CRIT % de substats)`. **No** incluye la estadística principal de la Tiara. El CV inicial de Razor es **48.8**. La bonificación media teórica de críticos es `ProbCRIT × DañoCRIT / 10000` y no simula daño real ni aplica límite de probabilidad. Las puntuaciones ponderadas son heurísticas, no una evaluación optimizada de Genshin.

La captura PNG se genera con Canvas y reproduce una tarjeta-resumen de estadísticas, no una captura exacta de la página completa. No se usan assets oficiales ni se requiere CDN. Los símbolos elementales son glifos locales estilizados, no iconos oficiales. Puedes sustituirlos por SVG/PNG con licencias adecuadas en una futura revisión.

## Privacidad

No se envían datos a servidores. Los registros permanecen en el `localStorage` del navegador/origen. Haz copias de seguridad JSON. El botón de importar no ejecuta scripts incluidos en JSON; los campos se escapan al mostrarse en HTML.
