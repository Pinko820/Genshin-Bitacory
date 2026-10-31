# Bitácora Genshin 4.0 — Cloud Sync

Aplicación estática para GitHub Pages. Conserva el editor, exportación e importación JSON v2/v3, estadísticas, comparador, historial y PNG de la v3. Sin backend propio ni compilación.

## Instalación rápida en GitHub Pages

1. Haz una **copia de seguridad JSON de ambas computadoras** antes de sustituir los archivos.
2. Sube el contenido de esta carpeta a la raíz de tu repositorio (incluidos `css/`, `data/`, `js/`). GitHub → Settings → Pages → Deploy from a branch → main / (root).
3. En [Firebase Console](https://console.firebase.google.com/) crea un proyecto y registra una **app Web**. Copia el objeto de configuración WEB a `js/firebase-config.js` (apiKey, authDomain, projectId, appId).
4. Firebase Console → Authentication → Sign-in method: habilita **Google** (elige correo de asistencia) y **Email/Password**.
5. Authentication → Settings → Authorized domains: agrega el dominio **exacto** de GitHub Pages (`usuario.github.io`) y, si usas dominio propio, también ese dominio. No agregues la ruta del repositorio.
6. Firebase Console → Firestore Database → Create database. Elige una región, comienza en modo producción y publica el contenido de `firestore.rules` en la pestaña **Rules**. No uses reglas abiertas de prueba.
7. Haz commit y espera a que GitHub Pages publique. Abre tu URL HTTPS y pulsa **Nube** para iniciar sesión.

**Importante:** la configuración web de Firebase es pública por diseño. Nunca incluyas claves privadas de cuenta de servicio. Las reglas de Firestore son las que restringen los datos a su propietario. Firebase Auth y Firestore están sujetos a las cuotas y políticas vigentes de tu proyecto.

## Fusión inicial segura de dos computadoras

1. En **PC 1**, abre la v3 y exporta JSON como respaldo. Haz lo mismo en **PC 2**. Guarda ambos archivos fuera del navegador.
2. Publica v4. En PC 1 abre la misma URL de GitHub Pages, entra en Nube, inicia sesión con tu cuenta, espera a que muestre **Conectado**. Los personajes locales se incorporan a Firestore.
3. En PC 2 abre la misma URL, inicia sesión con **la misma cuenta** y espera la sincronización. Se unen los personajes con IDs distintos.
4. Si ambas PC tenían un personaje con el mismo ID y datos diferentes, se conserva el personaje remoto y la versión local se registra como copia con el sufijo `(conflicto local)`.
5. Revisa los resultados en ambas PC y vuelve a exportar un respaldo JSON. No borres los respaldos originales hasta verificar la colección.

## Cómo funciona

- La aplicación usa la misma clave local de la v3 (`genshin-bitacora-v2`), para conservar los personajes del mismo origen.
- Los datos locales se guardan inmediatamente; el módulo Cloud Sync carga Firebase desde CDN **solo si está configurado**. Sin red, la edición local funciona y la sincronización queda pendiente.
- Cada personaje se guarda como documento en `users/{uid}/characters/{id}`.
- Las escrituras usan transacciones y comprueban la versión de datos leída previamente. Si hubo una edición concurrente, se conserva la versión de nube y se crea una copia de la edición local. Una eliminación conflictiva no borra la versión remota.
- La cola local de cambios se almacena por UID en `localStorage`; tras recuperar la conexión se intenta reenviar. El listener de Firestore descarga cambios remotos.
- El historial de builds de la v3 continúa siendo **local**; no se sincroniza en esta edición.
- El modo offline está pensado para la aplicación ya cargada en el navegador; no incluye service worker de caché para abrir por primera vez GitHub Pages sin Internet.
- Para iniciar sesión con Google se necesita conexión y un origen HTTPS. Abrir `index.html` con doble clic permite el uso local, pero la autenticación cloud no está garantizada con `file://`.

## Limitaciones y precauciones

- `localStorage` depende del navegador y del dominio; cambiar de dominio crea otro almacenamiento local.
- No se implementa cifrado de extremo a extremo ni sincronización de historial. La protección de datos depende de Firebase Auth, TLS y las reglas publicadas.
- Para restauraciones masivas o borrar datos, exporta un respaldo JSON primero.
- La detección de conflictos funciona por personaje completo, no por campo: dos cambios simultáneos a campos diferentes pueden generar una copia.
- Si cierras sesión, los datos locales del navegador permanecen en él. No utilices este modo en equipos compartidos con datos privados.
- Se necesita configurar Firebase por tu cuenta; el ZIP no puede incluir un proyecto Firebase preconfigurado.

## Estructura

- `index.html`: interfaz v3 + modal Cloud Sync.
- `css/styles.css`: estilos.
- `js/core.js`: normalización, estadísticas y JSON.
- `js/app.js`: editor, persistencia local, exportación e integración Cloud Sync.
- `js/cloud.js`: autenticación, escucha de Firestore, cola y transacciones.
- `js/firebase-config.js`: configuración pública de tu proyecto (rellenar).
- `firestore.rules`: reglas de seguridad por usuario.
- `data/razor.js`: datos iniciales.

## Pruebas recomendadas

1. Importa un JSON v3 y vuelve a exportarlo.
2. Inicia sesión con Google; prueba también una cuenta independiente con correo y contraseña.
3. Crea un personaje en PC 1, comprueba que aparezca en PC 2.
4. Desconecta PC 2, edita el personaje en ambos equipos, reconecta PC 2 y verifica que ninguna versión se pierda.
5. Elimina un personaje en PC 1, espera sincronización y comprueba PC 2.
6. Prueba la página en una ventana sin sesión para comprobar que no pueda leer datos ajenos.

Los scripts pasan comprobación estática de sintaxis; la integración real debe verificarse después de configurar Firebase en tu proyecto.
