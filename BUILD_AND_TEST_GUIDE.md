# 🚀 GUÍA COMPLETA: BUILD & TEST - NUEVA APP

> **Documento interactivo para crear una app local con testing completo**

---

## 📋 ÍNDICE RÁPIDO

1. [Seleccionar Carpeta](#1-seleccionar-carpeta)
2. [Preparar Proyecto](#2-preparar-proyecto)
3. [Setup Inicial](#3-setup-inicial)
4. [Configurar Variables](#4-configurar-variables)
5. [Ejecutar Tests](#5-ejecutar-tests)
6. [Build Final](#6-build-final)
7. [Validación Manual](#7-validación-manual)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. SELECCIONAR CARPETA

### Opción A: Proyecto Existente
```bash
# 1. Abre terminal en la carpeta del proyecto
cd /ruta/a/tu/proyecto

# 2. Verifica que exista package.json
cat package.json | head -20

# 3. Verifica rama git
git branch
git log --oneline | head -5
```

### Opción B: Proyecto Nuevo (Expo)
```bash
# 1. Crea carpeta nueva
mkdir mi-app-nueva
cd mi-app-nueva

# 2. Inicializa Expo
npx create-expo-app@latest .

# 3. Inicializa Git
git init
git add .
git commit -m "Initial commit"
```

### Opción C: Clonar desde GitHub
```bash
# 1. Clona el repo
git clone https://github.com/usuario/repo.git mi-app
cd mi-app

# 2. Verifica estado
git status
git log --oneline | head -5
```

**✅ Cuando tengas la carpeta lista, continúa al Paso 2**

---

## 2. PREPARAR PROYECTO

### Estructura Esperada
```
mi-app/
├── src/
│   ├── components/
│   ├── screens/
│   ├── core/
│   ├── types.ts
│   └── App.tsx
├── tests/
│   └── run-tests.ts
├── package.json
├── tsconfig.json
├── app.config.ts (o app.json)
├── .env.example
└── .gitignore
```

### Verificar Estructura
```bash
# Listar archivos principales
ls -la | grep -E "package.json|tsconfig|app\."

# Ver estructura de carpetas
tree -L 2 -I 'node_modules'
# O si no tienes tree:
find . -maxdepth 2 -type d | head -15
```

**✅ Si ves la estructura, continúa al Paso 3**

---

## 3. SETUP INICIAL

### 3.1 Instalar Dependencias
```bash
# Opción 1: Instalación limpia (recomendado)
rm -rf node_modules package-lock.json
npm install

# Opción 2: Si ya existe node_modules
npm ci  # Clean install
```

**Espera a que complete (2-5 minutos)**

```
Expected output:
✓ added XXX packages
✓ audited XXX packages
```

### 3.2 Verificar Instalación
```bash
# Ver versiones
npm list react react-native expo --depth=0

# Expected:
# react@18.x.x
# react-native@0.8x.x
# expo@55.x.x
```

### 3.3 Actualizar si es necesario
```bash
# Si ves warnings de incompatibilidad
npm outdated

# Actualizar Expo
npx expo upgrade

# Reinstalar dependencias nativas
npx expo install --fix
```

**✅ Cuando npm install complete, continúa al Paso 4**

---

## 4. CONFIGURAR VARIABLES

### 4.1 Copiar .env
```bash
# Ver si existe .env.example
cat .env.example

# Copiar a .env
cp .env.example .env
```

### 4.2 Editar .env
```bash
# Abre .env en tu editor
nano .env
# O en VS Code:
code .env
```

### Ejemplo de .env (mínimo requerido)
```env
EXPO_PUBLIC_BASE_PATH=/
EXPO_PUBLIC_ENABLE_UPDATES=false
EXPO_PUBLIC_FIREBASE_API_KEY=your_key_here
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_domain.firebaseapp.com
EXPO_PUBLIC_FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
```

### 4.3 Validar Variables
```bash
# Ver variables cargadas
env | grep EXPO_PUBLIC | sort

# Expected: Al menos 3-4 variables
```

**✅ Variables configuradas? Continúa al Paso 5**

---

## 5. EJECUTAR TESTS

### 5.1 TypeScript Check
```bash
# Compilar sin errores
npm run typecheck

# Expected output:
# (sin output = ✅ PASS)
# O si hay errores:
# src/file.tsx(10,5): error TS2322: ...
```

**Si hay errores:**
```bash
# Leer error completo
npm run typecheck 2>&1 | tee typecheck.log

# Abrir log
cat typecheck.log
```

### 5.2 Test Suite
```bash
# Ejecutar todos los tests
npm test

# Expected output:
# ✅ PASS: test 1
# ✅ PASS: test 2
# ...
# Tests completados.
# Pasaron: 92
# Fallaron: 0
```

**Si hay fallos:**
```bash
# Ejecutar tests verbose
npm test 2>&1 | tee test.log

# Ver cuál falló
grep "FAIL" test.log

# Ver por qué falló
grep -A 5 "FAIL:" test.log
```

### 5.3 Resumen de Tests
```bash
# Contar tests
npm test 2>&1 | grep "PASS:" | wc -l

# Ver línea final
npm test 2>&1 | tail -5
```

**Checklist de Tests:**
- [ ] TypeScript: 0 errors
- [ ] All tests: PASS
- [ ] No warnings
- [ ] Console clean

**✅ Todos los tests pasan? Continúa al Paso 6**

---

## 6. BUILD FINAL

### 6.1 Build Web
```bash
# Crear build estático
npm run build:web

# Expected output:
# Successfully exported to: ./dist
# Build folder size should be: 2-5MB
```

### 6.2 Verificar Build
```bash
# Ver contenido
ls -lah dist/

# Expected files:
# - index.html
# - favicon.ico
# - manifest.webmanifest
# - static/ (folder with JS/CSS)
```

### 6.3 Tamaño de Bundle
```bash
# Ver tamaño total
du -sh dist/

# Expected: < 10MB
```

### 6.4 Validar Archivos
```bash
# Verificar que index.html existe
file dist/index.html

# Ver primeras líneas
head -20 dist/index.html
```

**Checklist de Build:**
- [ ] dist/ folder created
- [ ] index.html exists
- [ ] No build errors
- [ ] Bundle < 10MB

**✅ Build completado? Continúa al Paso 7**

---

## 7. VALIDACIÓN MANUAL

### 7.1 Iniciar Dev Server
```bash
# Terminal 1: Servidor web
npm run web

# Espera:
# "Logs will appear in the browser console"
# Luego abre en navegador: http://localhost:8081
```

### 7.2 Test Checklist - CORE FEATURES

#### ✅ Autenticación
```
[ ] Puedo ver login screen
[ ] Intento login con credenciales inválidas → toast error
[ ] Login exitoso → redirecciona a app
[ ] Logout funciona → vuelve a login
```

#### ✅ Crear Nota
```
[ ] Click "+" en NotesTab
[ ] Escribo "Test note"
[ ] Presiono Save
[ ] Toast: "Note saved" ✅
[ ] Nota aparece en lista
[ ] Puedo editar
[ ] Puedo borrar → Toast: "Deleted"
```

#### ✅ Crear Shopping List
```
[ ] Escribo items (≥ 3)
[ ] Click "Create"
[ ] Modal abre
[ ] Toast: "Shopping list created" ✅
[ ] Aparece en lista
```

#### ✅ Sincronización (si Firebase configurado)
```
[ ] Abre 2 tabs
[ ] Tab 1: Crea nota "Sync test"
[ ] Tab 2: Aparece en < 2 segundos ✅
[ ] Edita en Tab 1
[ ] Tab 2: Se actualiza automáticamente ✅
```

#### ✅ Manejo de Errores
```
[ ] Intenta crear nota vacía → Toast error
[ ] Intenta crear shopping con < 3 items → Toast error
[ ] Elimina todo → Toast: "Deleted X items"
[ ] Revisa consola (F12) → sin errores rojos
```

### 7.3 Performance Check (Console)
```javascript
// En browser console (F12):

// Ver si hay errores
console.log("Check for RED messages above")

// Ver network latency
performance.getEntriesByType("navigation")[0]

// Expected: < 3 seconds load time
```

### 7.4 Responsiveness
```
[ ] Abre en desktop (1920x1080)
[ ] Abre en tablet mode (iPad)
[ ] Abre en mobile mode (iPhone 12)
[ ] Layout se adapta correctamente
```

**Checklist Manual:**
- [ ] App carga sin errores
- [ ] Todos los features funcionan
- [ ] Toasts muestran correctamente
- [ ] Sync funciona (si disponible)
- [ ] No hay errores en consola
- [ ] Responsive en móvil/tablet

**✅ Validación manual completa? Continúa al Paso 8**

---

## 8. TROUBLESHOOTING

### Error: "Cannot find module"
```bash
# Solución:
rm -rf node_modules package-lock.json
npm install
npm run typecheck
```

### Error: "TypeScript compilation failed"
```bash
# Ver error completo
npm run typecheck 2>&1 | grep "error TS"

# Arreglar archivo problemático
code src/file-with-error.tsx

# Rerun
npm run typecheck
```

### Error: "Tests failing"
```bash
# Ejecutar con verbose
npm test 2>&1 | grep -A 10 "FAIL:"

# Ver test específico
cat tests/run-tests.ts | grep -A 5 "test-name"

# Arreglar código fuente
# Rerun tests
npm test
```

### Error: "Build web fails"
```bash
# Limpiar caché
rm -rf .expo .next dist/

# Reinstalar
npm install

# Reintent
npm run build:web
```

### Error: "Port 8081 already in use"
```bash
# Encontrar proceso
lsof -i :8081

# Matar proceso (en macOS/Linux)
kill -9 <PID>

# En Windows:
netstat -ano | findstr :8081
taskkill /PID <PID> /F

# Reintentar
npm run web
```

### Error: ".env variables not loading"
```bash
# Verificar .env existe
ls -la .env

# Ver contenido
cat .env | head -10

# Verificar variables
echo $EXPO_PUBLIC_FIREBASE_API_KEY

# Si está vacío, cargar:
set -a
source .env
set +a
```

---

## ✅ CHECKLIST FINAL

```
PRE-BUILD:
- [ ] Carpeta seleccionada
- [ ] Git status limpio
- [ ] node_modules instalados

TESTING:
- [ ] npm run typecheck → 0 errors
- [ ] npm test → 92/92 PASS
- [ ] npm run build:web → sin errores

MANUAL:
- [ ] App carga en localhost:8081
- [ ] Features funcionan correctamente
- [ ] Toasts muestran feedback
- [ ] Sin errores en consola
- [ ] Responsive en móvil

BUILD:
- [ ] dist/ folder existe
- [ ] index.html válido
- [ ] Bundle < 10MB

DEPLOYMENT READY: ✅
```

---

## 📊 RESUMEN ESTIMADO

| Paso | Tiempo | Status |
|------|--------|--------|
| Setup | 5 min | ⏳ |
| TypeScript | 2 min | ⏳ |
| Tests | 5 min | ⏳ |
| Build | 3 min | ⏳ |
| Manual Test | 10 min | ⏳ |
| **TOTAL** | **~25 min** | ✅ |

---

## 🚀 PRÓXIMOS PASOS

Cuando todo pase:

```bash
# 1. Ver cambios
git status
git diff

# 2. Crear commit
git add .
git commit -m "build: all tests passing, ready for production"

# 3. Subir (si tienes remoto)
git push origin main

# 4. Desplegar (si necesario)
npm run deploy
```

---

## 📞 AYUDA RÁPIDA

| Problema | Comando |
|----------|---------|
| TypeScript error | `npm run typecheck 2>&1 \| grep error` |
| Test fallo | `npm test 2>&1 \| grep FAIL` |
| Build error | `npm run build:web 2>&1` |
| Ver logs | `tail -50 build.log` |
| Limpiar todo | `npm ci && npm run typecheck` |

---

**¿Listo para empezar? Comienza con:**

```bash
# Paso 1: Verifica carpeta
pwd
ls package.json

# Paso 2: Instala
npm install

# Paso 3: Testea
npm run typecheck && npm test

# Paso 4: Build
npm run build:web

# Paso 5: Valida manualmente
npm run web
```

---

*Última actualización: 2026-05-08*
*Versión: 1.0*
