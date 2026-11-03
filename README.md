# Bitácora Genshin 4.3 — persistencia local-first, conflictos e imágenes

Aplicación estática compatible con los esquemas de datos v1–v3. No requiere compilación. La edición siempre se aplica primero al estado local; Firebase es un transporte asíncrono opcional.

## Arquitectura 4.3

- **Local-first:** `js/app.js` normaliza y persiste las ediciones en `localStorage` sin esperar a Firebase. La cola cloud se notifica después del cambio local.
- **Firestore sin autoridad automática:** las instantáneas remotas actualizan fichas que no tengan operaciones pendientes. Si una escritura detecta que la base remota cambió desde la versión conocida, no sobrescribe ninguna de las dos variantes: crea un conflicto pendiente.
- **Resolución manual:** botón `Conflictos` para comparar la edición local con la remota y elegir cuál conservar. No se aplica una decisión hasta crear un punto de restauración en `localStorage` (`genshin-restore-*`). La pantalla permite conservar local o nube; las eliminaciones también se representan.
- **Imágenes híbridas:** `window.BitacoraImages.get(nombre)` consulta primero las imágenes personalizadas en caché local y después resuelve el catálogo automático público. `save(nombre, file)` almacena la imagen como Data URL local y, si hay sesión y Storage configurado, la sube a `users/{uid}/images/{nombre}` en Firebase Storage.
- **Compatibilidad:** se conserva la clave local `genshin-bitacora-v2`, la lectura del legado v1, `G.normalize`, el formato de exportación/importación previo y los IDs existentes. Las nuevas claves de imágenes, cola, conflictos y respaldos son aditivas.

## Configurar Firebase

1. Registra una aplicación Web en Firebase y copia `apiKey`, `authDomain`, `projectId` y `appId` en `js/firebase-config.js`.
2. Habilita Google y Email/Password en Authentication.
3. Crea Firestore y publica `firestore.rules`.
4. Crea Firebase Storage y publica estas reglas (ajusta si tu política requiere restricciones adicionales):

```rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{uid}/images/{fileName} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

5. En Storage publica `storage.rules` (incluido).\n6. Agrega el dominio de GitHub Pages a los dominios autorizados de Firebase Authentication.

## Uso y recuperación

- La colección local permanece editable aunque Firebase esté desconectado, lento o no configurado.
- `Sincronizar ahora` reintenta la cola pendiente.
- Revisa cada conflicto en la pantalla dedicada y decide explícitamente qué versión conservar. Antes de cada decisión se escribe un respaldo integral local; si no se puede escribir, la decisión se cancela.
- Exporta JSON periódicamente y conserva copias externas. Los puntos de restauración automáticos se guardan en el navegador y no sustituyen un respaldo externo.
- Las imágenes personalizadas se guardan localmente; con sesión Firebase activa también se suben a Storage. La ruta cloud es por usuario. El catálogo automático usa URLs públicas de recursos de personajes y puede requerir ajustar el resolver si cambia el proveedor.

## Estructura

- `index.html`: aplicación y diálogos de conflictos e imágenes.
- `js/core.js`: normalización y cálculo compatible.
- `js/app.js`: interfaz y persistencia local-first.
- `js/cloud.js`: autenticación, sincronización Firestore, conflictos manuales, respaldos e imágenes/Storage.
- `js/firebase-config.js`: configuración pública Web.
- `firestore.rules`: aislamiento de documentos por UID.
- `data/razor.js`: datos iniciales heredados.

## Límites

La integración real de Firebase requiere credenciales de proyecto y reglas desplegadas. Las imágenes del catálogo automático dependen de un servicio público externo; las imágenes personalizadas se conservan en caché local y Storage. El historial de builds permanece local, como en versiones anteriores. `localStorage` tiene límites de cuota; para imágenes grandes, Storage es la copia remota y conviene mantener imágenes optimizadas.
