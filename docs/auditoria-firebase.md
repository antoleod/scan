# Auditoria tecnica de Firebase y base de datos

## Resumen corto

El proyecto esta conectado a **Firebase Auth** y **Cloud Firestore** desde `src/core/firebase.ts`.
La lectura en tiempo real existe, pero solo para dos flujos principales:

- `scans`, mediante `onSnapshot`.
- `notes` y `noteTemplates`, mediante `onSnapshot`.

El resto de accesos a Firebase son lecturas puntuales con `getDocs` / `getDoc` o escrituras con `setDoc` / `deleteDoc` / `updateDoc`.

No encontre uso de **Realtime Database** en el repositorio.

## Archivos clave

- `src/core/firebase.ts`
- `src/screens/MainAppScreen.tsx`
- `src/components/mainApp/tabs/NotesTab.tsx`
- `src/components/mainApp/tabs/SettingsTab.tsx`
- `src/core/notes.ts`
- `src/auth/authContext.tsx`
- `firebase-service.js` (parece legado / no usado)

## 1. Configuracion

### Donde se inicializa Firebase

La inicializacion real usada por la app esta en `src/core/firebase.ts`:

- Resuelve variables de entorno `EXPO_PUBLIC_FIREBASE_*`.
- Crea `FirebaseApp` con `initializeApp(...)`.
- Crea `Auth` con `getAuth(...)` o `initializeAuth(...)`.
- Crea `Firestore` con `getFirestore(app)`.

Tambien existe un archivo raiz `firebase-service.js` que inicializa Firebase desde `window.__BARRA_FIREBASE_CONFIG__` o `/__/firebase/init.json`, pero no encontre referencias internas que lo importen.

### Servicios usados

- **Auth**: si, en `src/core/firebase.ts` y `src/auth/authContext.tsx`.
- **Firestore**: si, es la base de datos usada.
- **Realtime Database**: no encontre uso.
- **Storage / Functions / otros**: no aparecen en la logica principal de datos.

## 2. Base de datos

### Tipo

La base usada es **Cloud Firestore**.

### Estructura observada

Colecciones / documentos principales:

- `users/{uid}/scans`
- `users/{uid}/notes`
- `users/{uid}/noteTemplates`
- `noteGroups`
- `noteGroups/{groupId}/notes`

No hay estructura de nodos estilo Realtime Database.

## 3. Lectura de datos

### Lecturas live

| Archivo | Tipo lectura | Servicio | Live? | Nota |
|---|---|---|---|---|
| `src/core/firebase.ts` | `onSnapshot(query(scansRef))` | Firestore | Si | Listener para `users/{uid}/scans`. |
| `src/core/firebase.ts` | `onSnapshot(query(notesRef))` | Firestore | Si | Listener para `users/{uid}/notes`. |
| `src/core/firebase.ts` | `onSnapshot(query(templatesRef))` | Firestore | Si | Listener para `users/{uid}/noteTemplates`. |
| `src/auth/authContext.tsx` | `onAuthStateChanged(...)` | Auth | Si | No es lectura de DB, pero si es estado live de autenticacion. |

### Lecturas no live

| Archivo | Tipo lectura | Servicio | Live? | Nota |
|---|---|---|---|---|
| `src/core/firebase.ts` | `getDocs(query(scansRef))` | Firestore | No | Se usa como sync / snapshot puntual despues de escribir. |
| `src/core/firebase.ts` | `getDocs(query(notesRef))` | Firestore | No | Lectura puntual para sync y fetch. |
| `src/core/firebase.ts` | `getDocs(query(templatesRef))` | Firestore | No | Lectura puntual para sync y fetch. |
| `src/core/firebase.ts` | `getDoc(groupRef)` | Firestore | No | Verificacion puntual de grupo antes de escribir nota compartida. |
| `src/core/firebase.ts` | `getDocs(query(groupsRef, where(...)))` | Firestore | No | Lista de grupos por codigo o miembro. |
| `src/core/firebase.ts` | `getDocs(query(collection(rt.db, 'noteGroups', group.id, 'notes')))` | Firestore | No | Carga puntual de notas compartidas por grupo. |
| `src/core/notes.ts` | `fetchNotesFromFirebase()` | Firestore | No | Refresca notas manualmente. |
| `src/core/notes.ts` | `refreshNotesFromCloudSilently()` | Firestore | No | Combina fetch de notas y notas compartidas. |
| `src/components/mainApp/tabs/NotesTab.tsx` | `fetchSharedGroupsForCurrentUser()` | Firestore | No | Solo carga inicial de grupos. |
| `src/components/mainApp/tabs/SettingsTab.tsx` | `fetchSharedGroupsForCurrentUser()` | Firestore | No | Solo carga inicial de grupos. |
| `src/screens/MainAppScreen.tsx` | `syncScansWithFirebase()` | Firestore | No | Escritura + lectura puntual, no listener. |
| `src/screens/MainAppScreen.tsx` | `syncNotesWithFirebase()` | Firestore | No | Escritura + lectura puntual, no listener. |

### Donde se leen datos

- `src/screens/MainAppScreen.tsx`: sincronizacion de historial de scans.
- `src/components/mainApp/tabs/NotesTab.tsx`: sincronizacion live de notas y plantillas.
- `src/components/mainApp/tabs/SettingsTab.tsx`: carga de grupos compartidos.
- `src/core/notes.ts`: cargas, sincronizacion y borrados de notas / templates.
- `src/core/firebase.ts`: capa de acceso a Firestore.

## 4. Verificacion

### La UI se actualiza automaticamente al cambiar datos?

Si, pero solo en estas partes:

- **Historial de scans**: `MainAppScreen` escucha cambios con `subscribeToScans(...)`.
- **Notas y templates**: `NotesTab` escucha cambios con `subscribeToNotes(...)`.
- **Auth**: el estado de sesion se actualiza con `onAuthStateChanged(...)`.

### Que partes son live y cuales no

Live:

- `scans`
- `notes`
- `noteTemplates`
- estado de autenticacion

No live:

- grupos compartidos (`noteGroups`)
- notas de grupos compartidos
- cargas iniciales de notas / templates
- sincronizaciones manuales
- borrados en lote

## 5. Problemas encontrados

### 1. Duplicacion / organizacion

`firebase-service.js` parece un servicio legado paralelo a `src/core/firebase.ts`.
No encontre referencias internas que lo importen, asi que hoy introduce ruido y riesgo de confusion.

### 2. Lecturas innecesarias

`syncScansWithFirebase()` y `syncNotesWithFirebase()` hacen escrituras y luego vuelven a leer toda la coleccion con `getDocs(...)`.
Eso aumenta trafico y latencia.

### 3. Borrados poco eficientes

`clearScansInFirebase()`, `clearNotesInFirebase()` y `clearTemplatesInFirebase()` borran documento por documento en serie.
Para colecciones grandes, eso puede degradar rendimiento.

### 4. Cobertura live incompleta

Los grupos compartidos y sus notas no tienen listener live.
Si dos usuarios editan un grupo, la UI no se entera automaticamente salvo que se vuelva a cargar o se dispare un refresco manual.

### 5. Rules no visibles en el repo

No encontre archivos de reglas tipo `firestore.rules` o `database.rules.json`.
Eso impide auditar la seguridad desde este repositorio.

### 6. Riesgos de rendimiento

- Doble sincronizacion: escritura + relectura completa.
- Carga secuencial de notas compartidas por grupo.
- Borrados en bucle.

### 7. Listeners

No vi listeners sin cleanup en los efectos revisados.
`MainAppScreen.tsx`, `NotesTab.tsx` y `authContext.tsx` devuelven limpieza de suscripcion.

## Recomendaciones priorizadas

1. Unificar la capa de Firebase y retirar o documentar `firebase-service.js` si ya no se usa.
2. Hacer live la parte de `noteGroups` y `noteGroups/{groupId}/notes` si la colaboracion compartida debe ser realmente en tiempo real.
3. Reducir lecturas posteriores a escritura: evitar `getDocs(...)` completos despues de cada sync cuando no sea necesario.
4. Cambiar borrados en lote por operaciones batch o estrategias mas eficientes.
5. Anadir reglas de Firestore al repo y revisarlas junto con el acceso por coleccion.
6. Si se quiere consistencia fuerte entre dispositivos, separar mejor:
   - estado local
   - sincronizacion remota
   - listeners live

## Tabla final

| Archivo | Tipo lectura | Servicio | Live? | Nota |
|---|---|---|---|---|
| `src/core/firebase.ts` | Inicializacion y acceso base | Auth + Firestore | No aplica | Punto central de Firebase. |
| `src/core/firebase.ts` | `onSnapshot` | Firestore | Si | `scans`, `notes`, `noteTemplates`. |
| `src/core/firebase.ts` | `getDocs` / `getDoc` | Firestore | No | Sync, fetch y validaciones puntuales. |
| `src/core/firebase.ts` | Escritura (`setDoc`, `deleteDoc`, `updateDoc`) | Firestore | No | Persistencia remota. |
| `src/screens/MainAppScreen.tsx` | Suscripcion a scans | Firestore | Si | Actualiza historial automaticamente. |
| `src/components/mainApp/tabs/NotesTab.tsx` | Suscripcion a notas y templates | Firestore | Si | Actualiza UI de notas automaticamente. |
| `src/components/mainApp/tabs/SettingsTab.tsx` | Carga inicial de grupos | Firestore | No | Solo lectura puntual. |
| `src/core/notes.ts` | Fetch / sync / delete | Firestore | No | Sin listeners propios. |
| `src/auth/authContext.tsx` | Estado de auth | Auth | Si | No es DB, pero si live de sesion. |
| `firebase-service.js` | Inicializacion alternativa | Auth + Firestore | No | Parece legado y no usado. |

## Conclusion

1. **Firebase esta bien conectado?**
   - Si, la integracion principal es coherente: Auth + Firestore + variables de entorno.
   - Pero hay un servicio alternativo en `firebase-service.js` que deberia unificarse o retirarse.

2. **Es realmente live?**
   - **Parcialmente si**.
   - Es live para `scans`, `notes` y `noteTemplates`.
   - No es live para grupos compartidos ni para varias lecturas auxiliares.

3. **Que corregir primero?**
   - Primero: limpiar la duplicacion de servicios Firebase.
   - Segundo: decidir si `noteGroups` debe ser live y agregar listeners si aplica.
   - Tercero: optimizar sincronizaciones y borrados para evitar lecturas y escrituras innecesarias.



   Firebase settings:
   rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isOwner(uid) {
      return signedIn() && request.auth.uid == uid;
    }

    function hasOnlyKeys(allowed) {
      return request.resource.data.keys().hasOnly(allowed);
    }

    function noteValid() {
      return hasOnlyKeys([
        'id',
        'kind',
        'category',
        'text',
        'imageBase64',
        'imageMimeType',
        'attachments',
        'pinned',
        'createdAt',
        'updatedAt',
        'uid',
        'updatedAtServer'
      ])
      && request.resource.data.id is string
      && request.resource.data.kind in ['text', 'image']
      && request.resource.data.category in ['general', 'work']
      && request.resource.data.text is string
      && request.resource.data.pinned is bool
      && request.resource.data.createdAt is number
      && request.resource.data.updatedAt is number
      && request.resource.data.uid == request.auth.uid;
    }

    function templateValid() {
      return hasOnlyKeys([
        'id',
        'name',
        'kind',
        'subject',
        'body',
        'location',
        'durationMinutes',
        'createdAt',
        'updatedAt',
        'uid',
        'updatedAtServer'
      ])
      && request.resource.data.id is string
      && request.resource.data.name is string
      && request.resource.data.kind in ['email', 'appointment']
      && request.resource.data.subject is string
      && request.resource.data.body is string
      && request.resource.data.createdAt is number
      && request.resource.data.updatedAt is number
      && request.resource.data.uid == request.auth.uid;
    }

    function scanValid() {
      return request.resource.data.uid == request.auth.uid;
    }

    match /users/{uid} {
      allow read: if isOwner(uid);

      // Si tu app no escribe el doc raíz /users/{uid}, déjalo bloqueado:
      allow create, update, delete: if false;

      match /private/{docId} {
        allow read, write: if isOwner(uid);
      }

      match /scans/{scanId} {
        allow read: if isOwner(uid);
        allow create, update: if isOwner(uid) && scanValid();
        allow delete: if isOwner(uid);
      }

      match /notes/{noteId} {
        allow read: if isOwner(uid);
        allow create, update: if isOwner(uid) && noteValid();
        allow delete: if isOwner(uid);
      }

      match /noteTemplates/{templateId} {
        allow read: if isOwner(uid);
        allow create, update: if isOwner(uid) && templateValid();
        allow delete: if isOwner(uid);
      }
    }

    match /usernames/{username} {
      allow read: if signedIn();
      allow create: if signedIn()
                    && request.resource.data.uid == request.auth.uid
                    && request.resource.data.username == username;
      allow update: if signedIn()
                    && resource.data.uid == request.auth.uid
                    && request.resource.data.uid == request.auth.uid;
      allow delete: if false;
    }

    match /authAttempts/{attemptId} {
      allow read, write: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}

