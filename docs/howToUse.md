Template:


Archivo: src/components/mainApp/HistoryTab.tsx

Problema: [síntoma exacto / qué querés lograr]

Contexto:
- [restricción o decisión ya tomada]
- [comportamiento esperado]
Ejemplos reales para MyKit:


Archivo: src/components/mainApp/NoteCard.tsx

Problema: re-renderiza en cada tick del countdown de medicación 
aunque el texto del note no cambió

Contexto:
- El timer vive en NotesTab y pasa nextSuggestedAt como prop
- No quiero mover el timer, solo evitar el re-render de NoteCard

Archivo: src/components/mainApp/HistoryTab.tsx

Objetivo: virtualizar la lista para soportar 5000 items sin lag

Contexto:
- Actualmente usa ScrollView con map()
- Los items tienen altura variable (algunos tienen campos extra)
- Debe mantener el swipe-to-delete actual

Archivo: src/auth/LoginForm.tsx

Objetivo: migrar a hooks, actualmente es clase

Contexto:
- Maneja validación, shake animation y Firebase auth
- La animación usa Reanimated (no Animated.View)
- authService.login() ya existe, no tocar la capa de servicio