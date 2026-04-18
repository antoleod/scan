# Auditoria de Seguridad

Fecha: 2026-04-18
Alcance: revision estatica del repositorio local `scan`
Metodologia: inspeccion de reglas Firestore, flujos de autenticacion, persistencia local, sincronizacion Firebase y exposicion de secretos.

## Resumen Ejecutivo

Se identificaron 5 hallazgos relevantes:

1. `Alta`: almacenamiento de credenciales recuperables en cliente web.
2. `Alta`: exposicion de metadatos de grupos compartidos a cualquier usuario autenticado.
3. `Media`: coleccion `clipboard` usada por la app pero no protegida/permitida por reglas Firestore.
4. `Media`: servicio alternativo `firebase-service.js` crea cuentas automaticamente a partir de usuario+PIN debil.
5. `Baja`: comprobacion de conectividad contra Identity Toolkit desde login, innecesaria y util para enumeracion/telemetria externa.

## Hallazgos

### 1. Credenciales recuperables en el navegador
Severidad: Alta

Evidencia:
- [src/core/auth-storage.ts](/abs/path/c:/Users/X1/Downloads/scan/scan/src/core/auth-storage.ts:45) deriva una clave AES-GCM a partir de `window.location.origin` y `window.navigator.userAgent`.
- [src/core/auth-storage.ts](/abs/path/c:/Users/X1/Downloads/scan/scan/src/core/auth-storage.ts:66) cifra la password y la guarda en `AsyncStorage`.
- [src/core/auth-storage.ts](/abs/path/c:/Users/X1/Downloads/scan/scan/src/core/auth-storage.ts:90) la descifra localmente y la devuelve en claro.
- [src/auth/LoginForm.tsx](/abs/path/c:/Users/X1/Downloads/scan/scan/src/auth/LoginForm.tsx:639) guarda la password cuando el usuario activa `Remember session`.
- [src/auth/LoginForm.tsx](/abs/path/c:/Users/X1/Downloads/scan/scan/src/auth/LoginForm.tsx:646) intenta ademas almacenar la credencial con `navigator.credentials.store(...)`.

Impacto:
- Cualquier script que ejecute en el mismo origen puede recuperar la password.
- La "cifra" no depende de un secreto del usuario ni de hardware seguro; depende de atributos del entorno facilmente reproducibles.
- Un XSS o una extension maliciosa tendria acceso directo a credenciales reutilizables.

Recomendacion:
- No almacenar passwords recuperables en web.
- Sustituir este flujo por persistencia de sesion nativa de Firebase/Auth.
- Si hace falta reautenticacion local, usar WebAuthn o un secreto no exportable del sistema, no AES derivado del `origin`.
- Eliminar el uso de `PasswordCredential` si no hay una politica clara de soporte y threat model.

### 2. Lectura global de `noteGroups`
Severidad: Alta

Evidencia:
- [firestore.rules](/abs/path/c:/Users/X1/Downloads/scan/scan/firestore.rules:124) define `match /noteGroups/{groupId}`.
- [firestore.rules](/abs/path/c:/Users/X1/Downloads/scan/scan/firestore.rules:127) permite `allow read: if signedIn();`.
- [src/core/firebase.ts](/abs/path/c:/Users/X1/Downloads/scan/scan/src/core/firebase.ts:677) busca grupos por `inviteCode`.

Impacto:
- Cualquier usuario autenticado puede leer metadatos de todos los grupos: nombre, `ownerUid`, `members`, `inviteCode`.
- Esto expone estructura organizativa, identificadores internos y codigos de invitacion.
- El `inviteCode` deja de ser un secreto practico si toda la coleccion es legible.

Recomendacion:
- Restringir `read` a miembros del grupo o al owner.
- Para unirse por codigo, mover la resolucion del `inviteCode` a Cloud Functions o a un documento/indice minimizado con acceso muy acotado.
- Evitar exponer `members` e `inviteCode` completos a usuarios no miembros.

### 3. La app usa `users/{uid}/clipboard` pero las reglas no contemplan esa coleccion
Severidad: Media

Evidencia:
- [src/core/firebase.ts](/abs/path/c:/Users/X1/Downloads/scan/scan/src/core/firebase.ts:847) suscribe `users/{uid}/clipboard`.
- [src/core/firebase.ts](/abs/path/c:/Users/X1/Downloads/scan/scan/src/core/firebase.ts:889) escribe entradas de clipboard.
- [firestore.rules](/abs/path/c:/Users/X1/Downloads/scan/scan/firestore.rules:95) solo define `private`, `scans`, `notes` y `noteTemplates` bajo `users/{uid}`.
- [firestore.rules](/abs/path/c:/Users/X1/Downloads/scan/scan/firestore.rules:172) niega todo lo no explicitamente permitido.

Impacto:
- El sync de clipboard falla por reglas y puede dejar a la app en estados inconsistentes.
- Si en algun momento se abre esta ruta deprisa para "arreglarla", existe riesgo de meter permisos demasiado amplios sobre datos sensibles del portapapeles.
- El clipboard puede contener secretos, tokens, datos personales o credenciales.

Recomendacion:
- Definir reglas explicitas para `users/{uid}/clipboard` con validacion estricta de schema y ownership.
- Valorar si el clipboard debe sincronizarse en absoluto; por sensibilidad, lo mas seguro es dejarlo solo en dispositivo.
- Añadir pruebas de reglas para todas las colecciones usadas por el cliente.

### 4. `firebase-service.js` implementa autenticacion por PIN y autocreacion de cuentas
Severidad: Media

Evidencia:
- [firebase-service.js](/abs/path/c:/Users/X1/Downloads/scan/scan/firebase-service.js:154) transforma `username` en email local `@barrascanner.local`.
- [firebase-service.js](/abs/path/c:/Users/X1/Downloads/scan/scan/firebase-service.js:155) deriva password con `pin.toString().padEnd(6, "0")`.
- [firebase-service.js](/abs/path/c:/Users/X1/Downloads/scan/scan/firebase-service.js:168) intenta crear cuenta automaticamente si el login falla.

Impacto:
- El espacio efectivo de credenciales es muy pequeno si solo depende de un PIN de 6 digitos.
- La autocreacion cambia un fallo de autenticacion en provisionamiento de cuenta, lo que rompe controles de alta/aprobacion.
- Aunque hoy no se vea importado en `src`, el archivo esta versionado y reutilizable accidentalmente.

Recomendacion:
- Eliminar este servicio si ya no forma parte del producto.
- Si sigue siendo necesario, mover alta/autorizacion a backend con validaciones y rate limiting real.
- No derivar passwords desde PINs cortos ni autocrear cuentas desde el cliente.

### 5. Comprobacion de conectividad contra Identity Toolkit desde el login
Severidad: Baja

Evidencia:
- [src/auth/LoginForm.tsx](/abs/path/c:/Users/X1/Downloads/scan/scan/src/auth/LoginForm.tsx:522) hace `POST` a `accounts:createAuthUri`.

Impacto:
- Hace una llamada externa adicional en cada carga de login.
- Introduce un patron parecido a enumeracion/sondeo de endpoint de autenticacion sin necesidad funcional.
- Aumenta superficie de telemetria y dependencia de red antes del login real.

Recomendacion:
- Reemplazar esta comprobacion por una verificacion local de conectividad o dejar que el login real determine el estado.
- Evitar tocar endpoints de autenticacion fuera del flujo autentico del usuario.

## Observaciones Adicionales

- El archivo local `.env` contiene configuracion Firebase real, pero segun `.gitignore` esta ignorado y `git ls-files` no lo reporta como versionado. No es una fuga en el repositorio actual, aunque sigue siendo informacion sensible del entorno local.
- Las reglas de `usernames` permiten lectura a cualquier usuario autenticado en [firestore.rules](/abs/path/c:/Users/X1/Downloads/scan/scan/firestore.rules:157). Si esos nombres de usuario son sensibles o enumerables, conviene revisar ese acceso.

## Prioridad Recomendada

1. Eliminar almacenamiento recuperable de passwords en web.
2. Cerrar lectura global de `noteGroups` e `inviteCode`.
3. Diseñar o desactivar sync de clipboard antes de abrir permisos.
4. Retirar `firebase-service.js` o aislarlo fuera del producto.
5. Añadir tests automaticos de reglas Firestore por coleccion.

## Estado

Informe creado a partir del codigo presente en el workspace. No se ejecutaron pruebas dinamicas, pentest activo ni verificacion contra un proyecto Firebase en vivo.
