# Clipboard Cross-Browser (Estrategia Pro)

## Objetivo

Hacer que el modulo de Clipboard sea **util y confiable en cualquier navegador** (Chrome, Edge, Firefox, Safari), con enfoque en:

- Capturar texto copiado de forma robusta.
- Capturar imagen/screenshot cuando el navegador lo permita.
- Degradar correctamente cuando el navegador bloquee APIs.
- No perder informacion relevante para crear notas.

---

## Principio clave

No existe una sola API que funcione igual en todos los navegadores para leer clipboard en segundo plano.

La estrategia correcta es de **capas**:

1. `event-driven` (copy/paste/cut/focus/visibilitychange),
2. `polling` controlado donde sea permitido,
3. captura manual asistida como fallback,
4. normalizacion + deduplicacion para evitar ruido.

---

## Matriz realista por navegador

## 1) Chrome / Edge (Chromium)

- Mejor soporte para `navigator.clipboard.readText()`.
- Lectura de imagen via APIs modernas puede funcionar con permisos/contexto seguro.
- Polling moderado es viable.

**Estrategia:** activar modo automatico completo.

## 2) Firefox

- Restricciones mas fuertes para lectura silenciosa.
- `readText` puede fallar fuera de interaccion de usuario.

**Estrategia:** priorizar eventos (`paste`, `copy`, `focus`) + boton manual.

## 3) Safari (desktop/iOS)

- Restricciones severas de clipboard background.
- Lectura automatica suele requerir gesto explicito.

**Estrategia:** flujo guiado por accion del usuario y fallback manual siempre visible.

---

## Arquitectura recomendada

### A) Captura por eventos (base universal)

Registrar listeners:

- `paste`: fuente mas confiable para texto/imagen.
- `copy` y `cut`: disparar lectura diferida corta (`setTimeout` 30-80ms).
- `focus`: refresco cuando vuelve a la pestaña.
- `visibilitychange`: refresco al volver a `visible`.

**Ventaja:** funciona mejor en navegadores restrictivos porque ocurre cerca de interacciones reales.

### B) Polling adaptativo (solo donde conviene)

- Activar polling solo en navegadores compatibles.
- Intervalo inicial: `1200ms`.
- Backoff inteligente:
  - Si no hay cambios por N ciclos, subir a `2500-4000ms`.
  - Si hay cambios frecuentes, bajar temporalmente a `800-1200ms`.
- Pausar polling cuando la pestaña esta oculta.

**Ventaja:** reduce consumo y evita bloqueos/permisos molestos.

### C) Fallback manual premium

Siempre exponer acciones visibles:

- `Capture Clipboard Now`.
- `Paste to Capture`.
- `Import Screenshot`.

Con tooltip corto:
- "Firefox/Safari pueden requerir accion manual para leer clipboard."

**Ventaja:** evita percepcion de "no funciona".

---

## Tacticas para capturar "todo lo copiado" (sin romper UX)

## 1) Firma de deduplicacion

Guardar `signature` de ultimo contenido:

- Texto: hash rapido del valor normalizado.
- Imagen: hash de prefijo base64 + longitud.

Si firma igual a la ultima en ventana corta (`3-10s`), no insertar duplicado.

## 2) Ventana anti-spam

- Si el mismo contenido llega por `copy` y luego por `focus`, contar una sola vez.
- `debounce` de 300-600ms por fuente.

## 3) Normalizacion de texto

Antes de persistir:

- trim,
- colapso de espacios repetidos,
- recorte maximo configurable (ej. 8k),
- detectar tipo (`url`, `ticket`, `code`, `general`).

## 4) Clasificacion inmediata para valor real

Al guardar entrada:

- `kind`: `text` o `image`.
- `category`: `general`, `link`, `code`, `servicenow`.
- `capturedAt`, `source` (`paste`, `copy`, `focus`, `manual`).

Esto vuelve el timeline util para trabajo real.

---

## Tacticas para screenshots / imagenes

## 1) Captura primaria

Intentar lectura de imagen desde API disponible (si existe y hay permiso).

## 2) Fallback por paste event

En `paste`, inspeccionar `clipboardData.items` y extraer `image/*` cuando aparezca.

## 3) Fallback final manual

- Boton "Import Screenshot" (file picker).
- Convertir a data URI optimizado.
- Limitar tamaño (compresion/calidad) para no bloquear UI.

## 4) Thumbnail + lazy preview

- Guardar miniatura/listado rapido.
- Abrir imagen completa bajo demanda.

---

## Seguridad, permisos y confianza

- Mostrar estado de permisos de clipboard cuando sea posible.
- Si falla lectura automatica, mensaje claro:
  - "El navegador bloquea lectura en segundo plano. Usa 'Capture Now' o pega manualmente."
- Nunca simular captura si no hubo lectura real.

---

## Reglas de calidad del modulo clipboard

1. Nunca bloquear la app por error de permisos.
2. Nunca insertar duplicados obvios.
3. Siempre ofrecer camino manual funcional.
4. Mantener trazabilidad (`source`, `timestamp`, `kind`).
5. Degradacion elegante por navegador.

---

## Plan de implementacion por fases

## Fase 1 (rapida)

- Consolidar listeners de evento + dedupe.
- Mensajes claros por navegador restrictivo.
- Botones manuales visibles.

## Fase 2

- Polling adaptativo con pausa por visibilidad.
- Clasificacion automatica mejorada.

## Fase 3

- Metricas internas:
  - ratio de captura exitosa,
  - ratio de duplicados evitados,
  - ratio de fallback manual por navegador.

---

## Checklist de validacion (manual)

1. Chrome: copy texto, copy codigo, copy URL, screenshot paste.
2. Edge: mismos casos.
3. Firefox: copy + focus + capture manual.
4. Safari: paste manual + import screenshot.
5. Verificar no duplicados al alternar ventanas.
6. Verificar creacion de nota desde item clipboard en todos los casos.

---

## Resultado esperado

Con esta estrategia, el clipboard deja de depender de un solo comportamiento del navegador y pasa a ser:

- confiable,
- predecible,
- util en navegadores estrictos,
- y robusto para flujos reales de soporte/captura.

