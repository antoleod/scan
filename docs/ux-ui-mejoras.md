# UX/UI Mejoras Pro — Responsive iOS · Android · PC

## Objetivo

Mejorar claridad, velocidad de uso y confianza visual en una app orientada a captura, notas y sincronización en tiempo real.
Este documento propone **cambios concretos, priorizados y adaptados por plataforma** para implementar en fases.

---

## Reglas globales responsive (todas las plataformas)

- **Touch targets mínimos:** 44×44 pt (iOS) / 48×48 dp (Android) / 44px (web)
- **Texto nunca en px fijo:** usar `sp` en nativo, `rem` en web — respetar configuración de fuente del usuario
- **Sin scroll horizontal accidental** en ningún breakpoint
- **Contraste WCAG AA** obligatorio en texto secundario, chips activos/inactivos e iconos sobre fondo
- **No depender solo del color** para indicar estado (agregar label o forma)
- **Animaciones: respetar** `prefers-reduced-motion` (iOS Accessibility, Android Animator, CSS media query)

---

## Reglas específicas por plataforma

### iOS
- **Safe area insets:** aplicar `safeAreaInsets` (top/bottom) en toda la app — notch y Dynamic Island
- **Tab bar:** `padding-bottom` igual al `safeAreaInsets.bottom` (mínimo 0 si no hay home indicator)
- **Dynamic Type:** usar estilos `UIFont.TextStyle` (`.body`, `.headline`, `.caption1`) o `scaledFont` — nunca tamaño fijo
- **Modales:** preferir `.sheet` (deslizar para cerrar) sobre fullscreen; usar `.presentationDetents` si disponible (iOS 16+)
- **Swipe-back:** no colocar elementos de tap en el borde izquierdo (< 20pt) para no interferir con gesture de navegación
- **Sticky search:** usar `UISearchController` con `obscuresBackgroundDuringPresentation = false`; ajustar con `keyboardLayoutGuide`
- **Haptics:** feedback en acciones primarias (scan, guardar nota) con `UIImpactFeedbackGenerator(.medium)`

### Android
- **Edge-to-edge:** activar `WindowCompat.setDecorFitsSystemWindows(window, false)` y aplicar `WindowInsetsCompat` para status bar y navigation bar
- **Texto:** usar `sp` exclusivamente; verificar con "Font size extra large" en Developer Options
- **Bottom sheets:** usar `ModalBottomSheetLayout` para modales y opciones secundarias (no alertas full-screen)
- **FAB:** acción primaria en `FloatingActionButton` anclado a bottom-right — no en toolbar o menú de tres puntos
- **Ripple effect:** aplicar `ripple` en todos los ítems de lista y botones — no usar colores sólidos como único feedback
- **Back gesture:** compatible con predictive back (Android 13+) — no interceptar `onBackPressed` para flujos simples
- **Insets en listas:** aplicar `clipToPadding = false` + `paddingBottom = navBarHeight` en `RecyclerView` para no cortar último ítem

### PC / Web
- **Breakpoints:**
  - `< 480px`: mobile portrait (1 col, tab bar)
  - `480–767px`: mobile landscape (1–2 col, ajustar padding)
  - `768–1023px`: tablet (2 col, sidebar opcional)
  - `1024–1279px`: desktop (3 col, sidebar visible)
  - `≥ 1280px`: desktop amplio (3 col, max-width 1200px centrado)
- **Grid de notas:** `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`
- **Hover states:** obligatorios en todos los elementos interactivos (cards, botones, chips, filas de lista)
- **Focus ring:** visible y con contraste — no eliminar `outline` sin reemplazarlo
- **Atajos de teclado:**
  - `Ctrl/Cmd + Enter`: guardar nota / confirmar acción
  - `Esc`: cerrar modal / cancelar edición
  - `Ctrl/Cmd + F`: abrir búsqueda
- **Sidebar en ≥ 1024px:** considerar panel lateral fijo para filtros/navegación (reduce acciones de tab)
- **max-width:** 1200px centrado para contenido principal; sidebar máx. 260px

---

## Prioridad 1 — Impacto alto · Esfuerzo bajo

### 1) Jerarquía visual más limpia por pestaña

Cabecera breve y consistente en cada tab:
- `Scan`: estado actual + acción principal
- `Notes`: editor + filtros + lista
- `History`: filtros + resultados
- `Settings`: bloques claros por sección

Reducir ruido en tarjetas: menos borde fuerte, mejor contraste en títulos, metadatos más discretos.

**Plataforma:** aplica igual en iOS, Android y PC. En PC, la cabecera puede ser sticky con `position: sticky; top: 0`.

**Resultado:** interfaz menos cargada y más fácil de escanear.

---

### 2) Acción primaria única por pantalla

Un botón visualmente dominante por vista:
- `Scan`: capturar/escanear
- `Notes`: guardar nota
- `Templates`: guardar template

Evitar que 3–4 iconos tengan la misma jerarquía en la misma fila.

**iOS:** usar `UIButton.Configuration` con `filled` para el botón primario.
**Android:** `MaterialButton` con `style="@style/Widget.Material3.Button"` (filled).
**PC:** `background: var(--color-primary); color: white` + hover oscuro.

**Resultado:** menos errores de clic y flujo más rápido.

---

### 3) Filtros y búsqueda sticky

Mantener barra de búsqueda y chips visibles al hacer scroll. Mostrar contador del resultado filtrado (`23 notas`, `5 templates`).

**iOS:** `UISearchController` en `navigationItem.searchController` con `hidesNavigationBarDuringPresentation = false`. Ajustar offset con `keyboardLayoutGuide.topAnchor`.
**Android:** `SearchView` en `AppBarLayout` con `app:layout_scrollFlags="scroll|enterAlways"` controlado.
**PC:** `position: sticky; top: 0; z-index: 10` con `backdrop-filter: blur(0)` (sin blur para no romper compositing).

**Resultado:** contexto constante y mejor navegación en listas largas.

---

### 4) Estados vacíos accionables

Reemplazar estados vacíos genéricos por mensajes accionables:
- `No hay notas` → `Crea tu primera nota` (CTA: botón "Nueva nota")
- `No hay grupos` → `Ve a Settings > Shared Groups`
- `No hay historial` → `Escanea un código para empezar`

**Todos los estados vacíos deben tener:** ilustración simple o ícono, mensaje breve, botón de acción directo.

**Resultado:** menos confusión para usuario nuevo.

---

## Prioridad 2 — Impacto alto · Esfuerzo medio

### 5) Sistema de espaciado y tipografía consistente

**Escala de espaciado base:** `4 / 8 / 12 / 16 / 24 / 32`

**Escala tipográfica:**
| Nivel | Tamaño | Peso |
|---|---|---|
| Título de pantalla | 18–20 | 700 |
| Título de sección | 16–18 | 600 |
| Texto normal | 13–14 | 400 |
| Metadatos / etiquetas | 10–11 | 400 |

**iOS:** mapear a `.headline` (17/600), `.body` (17/400), `.caption1` (12/400).
**Android:** mapear a `headlineSmall`, `bodyMedium`, `labelSmall` de Material 3.
**PC:** escala rem: `1.125rem / 1rem / 0.875rem / 0.75rem`.

Limitar variaciones de peso a 2 máximo por pantalla (ej. 400 + 600).

**Resultado:** UI más premium y coherente entre plataformas.

---

### 6) Tarjetas de notas con layout estable

Estructura fija en todas las plataformas:
1. Metadatos (fecha / categoría) — 10–11px, color secundario
2. Contenido — preview corto (2–3 líneas), expandir al tocar
3. Acciones — iconos o texto, alineados a la derecha o en menú contextual

Evitar saltos de altura abruptos. Altura mínima consistente por tipo de tarjeta.

**PC:** grid `1 col (< 600px) → 2 col (600–1023px) → 3 col (≥ 1024px)`.
**iOS / Android:** lista vertical con altura fija o expandible — no grid.

**Resultado:** lectura más rápida y grid más limpio.

---

### 7) Modales orientados a tarea

- Menos texto explicativo: ir directo a la acción
- Orden de botones consistente: **secundario izquierda · primario derecha**
- Cerrar con `Esc` en web; swipe-down en iOS; back button en Android

**iOS:** `.sheet` con `presentationDetents([.medium, .large])` para modales de edición.
**Android:** `BottomSheetDialog` para opciones; `AlertDialog` solo para confirmaciones destructivas.
**PC:** modal centrado, max-width 480px, overlay oscuro, foco en primer input al abrir.

**Resultado:** menos fricción en interacciones repetidas.

---

## Prioridad 3 — Impacto medio · Esfuerzo medio

### 8) Mejoras de desktop y tablet

- `max-width: 1200px` centrado, padding lateral 24px en desktop
- Grid de notas con breakpoints suaves (ver arriba)
- Sidebar en ≥ 1024px para filtros o navegación secundaria
- Evitar que el contenido se estire a ancho completo en pantallas grandes

**Resultado:** experiencia profesional en pantallas grandes.

---

### 9) Color system y accesibilidad

Validar contraste WCAG AA (ratio ≥ 4.5:1) en:
- Texto secundario sobre fondo
- Chips activos/inactivos
- Iconos sobre fondos coloreados

No depender solo del color para estado: agregar label o forma diferenciadora.

**iOS:** respetar `UIColor.systemBackground` y `UIColor.label` para modo oscuro automático.
**Android:** usar colores de Material 3 que adaptan automáticamente a dark mode.
**PC:** CSS custom properties con `@media (prefers-color-scheme: dark)`.

**Resultado:** mejor legibilidad y accesibilidad real.

---

### 10) Microcopy más directo

- Tono: corto · accionable · sin ambigüedad
- Botones: verbo + objeto (`Guardar nota`, `Escanear código`, `Eliminar`)
- Evitar textos largos dentro de botones o chips

**Resultado:** interfaz más clara y profesional.

---

## Quick Wins recomendados (esta semana)

1. Sticky search + filtros en `Notes` e `History`
2. Unificar jerarquía de botones (primario/secundario)
3. Limpiar densidad visual de tarjetas (espaciado/tipografía)
4. Estados vacíos accionables por tab
5. Ajustar contraste de texto secundario y chips
6. **Añadir `safeAreaInsets` en iOS y edge-to-edge en Android** (zero-cost, máximo impacto visual)

---

## No cambiar (preservar UX actual)

- Estructura de tabs (`notes`, `scan`, `history`, `settings`)
- Flujo de notas rápido (crear/editar con mínimo clic)
- Atajos existentes (`Ctrl/Cmd + Enter` donde aplica)
- Navegación nativa por plataforma (swipe-back iOS, back button Android)

---

## Criterios de éxito UX

- Usuario nuevo puede crear y encontrar una nota en < 20s en cualquier plataforma
- Usuario frecuente hace create/edit/delete sin dudas visuales
- Contraste WCAG AA verificado en texto secundario y chips
- Touch targets ≥ 44pt iOS / ≥ 48dp Android / ≥ 44px web
- Sin scroll horizontal accidental en ningún breakpoint (320px–1920px)
- Interfaz consistente y coherente entre mobile y desktop

---

## Siguiente paso sugerido

Implementar **Prioridad 1 + Quick Wins responsive** en un solo ciclo y validar:
- 3 tareas reales (crear nota, buscar nota, escanear código)
- 2 usuarios por plataforma (iOS, Android, PC)
- Medir tiempo y errores antes/después
- Verificar con Accessibility Inspector (iOS), TalkBack (Android), y Axe (web)