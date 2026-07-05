# Vehicle Grid & Modal Redesign — Design

## Contexto

El usuario pidió mejorar el diseño del "Vehicle Grid": tarjetas más grandes,
efecto hover, y que al hacer click se abra el detalle del vehículo con una
animación de zoom que ocupe el centro de la pantalla, en vez del layout actual
de dos columnas (grilla a la izquierda, formulario a la derecha). También pidió
que sea "futurista, profesional, con animaciones top" y "nítido".

Se validó en una sesión de brainstorming con companion visual: el usuario
eligió una animación de zoom tipo "shared element" (el modal crece desde la
tarjeta en la que se hizo click, no aparece centrado de la nada), 3 columnas de
tarjetas grandes (la densidad más prominente de las 3 mostradas), y un
tratamiento visual intermedio para las tarjetas — ni el blanco plano actual, ni
el mockup oscuro tipo showroom que se mostró como referencia, sino algo entre
ambos.

## Alcance

- Rediseño visual y de interacción del `VehicleGrid` (tarjetas más grandes,
  hover futurista) dentro de la pestaña Inventario.
- El formulario de detalle (`VehicleForm`) se mueve de un panel lateral fijo a
  un modal centrado con animación de "crecer desde el origen del click".
- El contenido interno de `VehicleForm` (las 4 sub-pestañas: Info, Costos,
  Venta/Financiamiento, Notas, y todos sus campos) **no cambia** — solo cambia
  su contenedor y cómo aparece/desaparece.

Fuera de alcance: cambios de esquema en Supabase, cambios de lógica de
guardado/borrado, rediseño del resto del dashboard (KPIs, franja de atención,
Reportes) — esos mantienen su tema visual actual sin cambios. No se agregan
dependencias nuevas: todo se construye con `framer-motion`, ya instalado
(`^12.38.0` en `package.json`).

## Arquitectura

### Layout de la pestaña Inventario (`src/App.jsx`)

Se elimina el grid de dos columnas (`xl:grid-cols-[0.9fr_1.4fr]`) que hoy pone
el `VehicleGrid` a la izquierda y el `VehicleForm`/placeholder a la derecha.
En su lugar, la pestaña Inventario renderiza una única `Card` de ancho
completo con el header "Vehicle Grid" + contador + toolbar + `VehicleGrid`.
El modal del vehículo (ver abajo) se renderiza aparte, fuera de ese layout,
condicionado a que `selectedCarId` no sea `null`.

### `src/components/VehicleModal.jsx` (nuevo)

Envuelve el `VehicleForm` existente (sin cambios en su interior) en:

- Un overlay de fondo (`bg-black/50` + `backdrop-blur-md`) que cubre toda la
  pantalla, con fade in/out.
- Un contenedor centrado (ancho máximo ~640px, alto máximo ~90vh con scroll
  interno si el contenido no cabe) que usa `framer-motion`'s `layoutId`
  compartido con el elemento que originó el click, para que la animación de
  apertura/cierre sea un "crecimiento" real desde ese origen hasta el centro
  de la pantalla, no un fade genérico.
- Un botón de cerrar (X) en la esquina superior del modal.
- Se cierra con: click en el botón X, click en el overlay (fuera del
  contenedor), o tecla Escape — las tres rutas llaman a la misma función de
  cierre pasada por prop.
- Mientras `saving` es `true` (prop heredada, mismo booleano que ya usan los
  botones Save/Delete), el botón de cerrar se deshabilita, para no interrumpir
  un guardado en curso.

Props: `{ car, formTotals, onChange, onSave, onDelete, onClose, saving,
originLayoutId }`. `originLayoutId` es el mismo `layoutId` que usa la tarjeta
(o el botón "Add Vehicle") que se clickeó, para que `framer-motion` pueda
animar la transición compartida entre ambos elementos.

### `src/components/VehicleGrid.jsx`

- La grilla pasa a 3 columnas en desktop (`lg:grid-cols-3`), con fotos más
  altas y tipografía más grande — tarjetas notablemente más grandes que hoy.
- Cada tarjeta se envuelve en un `motion.div` con
  `layoutId={`vehicle-card-${car.id}`}`, para servir como origen de la
  animación de apertura del modal.
- Estilo intermedio (ni blanco plano, ni oscuro total): fondo con leve
  degradado claro-a-lavanda, borde con gradiente violeta que se activa en
  hover, y un scrim oscuro semitransparente en la parte baja de la foto (para
  que el texto de precio/estatus, si se superpusiera, sea legible) — el resto
  del texto de la tarjeta (modelo, año, ganancia/equidad) sigue en los mismos
  colores oscuros/ámbar/verde que ya usa el resto del dashboard, sin cambios
  de esos tokens de color (la paleta de la Tarea de suavizado de rojo/ámbar no
  se toca).
- Hover: elevación (`translateY` negativo), sombra con glow de color violeta,
  y zoom leve (`scale`) de la imagen de fondo — usando transiciones CSS/
  `framer-motion`, sin nuevas dependencias.

### Botón "Add Vehicle" (header superior, `src/App.jsx`)

Recibe su propio `layoutId` fijo (p. ej. `"vehicle-card-new"`), para que abrir
el modal para un carro nuevo también tenga el efecto de "crecer desde el
botón", igual que crecer desde una tarjeta existente.

## Flujo de datos y estado

`selectedCarId` (ya existe en `App.jsx`) pasa a controlar si el modal está
abierto (`Boolean(selectedCarId)`), sin cambiar su significado original.

- **Abrir con carro existente**: click en una tarjeta de la grilla, o en un
  ítem de la franja de atención → `handleSelectCar(car)` (sin cambios) → el
  modal anima su apertura usando el `layoutId` de esa tarjeta como origen.
- **Abrir para uno nuevo**: click en "Add Vehicle" → `handleNewCar()` (sin
  cambios) → el modal anima su apertura usando el `layoutId` del botón.
- **Cerrar**: nueva función `handleCloseModal()` en `App.jsx` → limpia
  `selectedCarId` a `null` y `form` a `emptyCar`. Se pasa como `onClose` al
  modal.
- **Guardar**: `handleSave()` sin cambios de lógica — el modal permanece
  abierto mostrando el estado actualizado (igual que hoy en el panel lateral).
- **Borrar**: `handleDelete()` sin cambios de lógica interna, pero como ya
  limpia `selectedCarId`/`form` al terminar, esto ahora naturalmente cierra el
  modal (mismo código, nuevo efecto visual).

Ningún cambio a las llamadas de Supabase (`select`/`insert`/`update`/`delete`)
ni a su manejo de errores existente (`setStatus` con el mensaje de error).

## Manejo de errores y casos borde

- Grilla vacía: sigue mostrando "No cars yet" sin cambios, sin modal.
- Cambiar de "Add Vehicle" a otra tarjeta sin guardar antes: mismo
  comportamiento que existe hoy (se pierde el formulario no guardado, sin
  confirmación adicional — no se agrega ese guardrail, está fuera de alcance).
- Botón de cerrar deshabilitado mientras `saving === true`.
- Tecla Escape solo actúa cuando el modal está abierto (listener se
  agrega/quita junto con la apertura/cierre, no queda un listener global
  permanente).

## Verificación

Sin test automatizado de componentes (mismo criterio que el resto del
proyecto — no hay test-renderer instalado). Verificación manual en navegador:

1. Abrir el modal haciendo click en una tarjeta — confirmar que la animación
   crece visualmente desde la posición de esa tarjeta hacia el centro.
2. Abrir el modal con "Add Vehicle" — confirmar que crece desde el botón.
3. Cerrar con la X, con click fuera del modal, y con Escape — las tres deben
   funcionar.
4. Guardar un cambio — confirmar que el modal permanece abierto.
5. Borrar un vehículo — confirmar que el modal se cierra y vuelve a la
   grilla.
6. Hover en varias tarjetas — confirmar elevación, glow, y zoom de imagen.
7. Revisar la grilla en desktop (3 columnas), tablet, y mobile — confirmar que
   colapsa razonablemente sin romperse.
