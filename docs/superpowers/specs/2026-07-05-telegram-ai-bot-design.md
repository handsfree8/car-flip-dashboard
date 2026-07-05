# Telegram AI Bot for Car/Expense Logging — Design

## Contexto

Este es el sub-proyecto B de una petición más grande del usuario (sub-proyecto
A, agrupado profitable/non-profitable + traducción a inglés, ya implementado
y desplegado por separado). El usuario quiere un bot de Telegram con IA que
permita, desde el chat: (1) crear un carro nuevo describiéndolo en texto, y
(2) registrar un gasto mandando la foto de un recibo y mencionando a qué
carro pertenece.

El proyecto de Supabase del dashboard ("Flip car tracker", id
`nmxbnvmpoupdwcvqzsaj`) ya existe con una única tabla `public.cars` (`id`
uuid, `created_at` timestamptz, `data` jsonb) y no tiene Edge Functions
todavía.

## Alcance

- Un bot de Telegram, autorizado solo para el chat ID del usuario, que:
  - Interpreta un mensaje de texto describiendo la compra de un carro y crea
    un registro en `cars` (mismo formato que ya usa la app web).
  - Interpreta una foto de un recibo + mención del carro, y suma ese gasto a
    la categoría de costo correspondiente del carro identificado.
  - Pide confirmación antes de guardar cualquier cosa, y pide aclaración
    cuando el carro o la categoría de costo son ambiguos.

Fuera de alcance: registrar gastos por texto sin foto, editar/borrar carros
por chat, capturar datos de venta/financiamiento por chat (eso se sigue
haciendo desde la app web), soporte para más de un chat/usuario autorizado
simultáneo, y cualquier UI nueva en el dashboard web (este sub-proyecto es
puramente backend/bot).

## Arquitectura

### Componentes

- **Bot de Telegram**: creado por el usuario vía @BotFather (paso manual,
  guiado en la sección de prerequisitos). Da un token.
- **Supabase Edge Function** `telegram-webhook` (Deno/TypeScript, desplegada
  en el proyecto `nmxbnvmpoupdwcvqzsaj`): único punto de entrada, recibe cada
  update de Telegram vía webhook HTTP POST. Tiene acceso directo a la base de
  datos vía las variables `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` que
  Supabase inyecta automáticamente a toda Edge Function — no requiere
  configuración adicional para leer/escribir `cars`.
- **Anthropic Claude API**: interpreta texto y fotos (visión), usando
  "tool use" (function calling estructurado) para que la respuesta sea
  siempre JSON con forma fija, nunca texto libre a interpretar con regex.
- **Tabla nueva `public.bot_pending_actions`**: única adición de esquema de
  este sub-proyecto (cero cambios a `cars`). Guarda la "pregunta pendiente"
  que el bot le hizo al usuario, porque cada mensaje de Telegram dispara una
  invocación nueva e independiente de la Edge Function — sin este estado
  persistido, el bot no recordaría qué estaba preguntando entre un mensaje y
  el siguiente.

  ```sql
  create table public.bot_pending_actions (
    id uuid primary key default gen_random_uuid(),
    chat_id text not null,
    kind text not null, -- 'new_car_confirm' | 'car_disambiguation' | 'category_disambiguation' | 'expense_confirm'
    payload jsonb not null,
    created_at timestamptz not null default now()
  );
  alter table public.bot_pending_actions enable row level security;
  -- Sin políticas: solo accesible vía service_role (la Edge Function), nunca desde el frontend.
  ```

  Solo existe una fila pendiente por `chat_id` a la vez — antes de crear una
  nueva, se borra cualquier fila pendiente previa de ese chat.

### Secretos de la Edge Function

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_AUTHORIZED_CHAT_ID`
- `ANTHROPIC_API_KEY`

(`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya los provee Supabase
automáticamente a cualquier Edge Function del proyecto.)

### Seguridad

Todo update entrante se compara contra `TELEGRAM_AUTHORIZED_CHAT_ID`. Si no
coincide, la función responde `200 OK` sin hacer nada más (ni guardar datos,
ni responder al remitente) — así no se confirma ni siquiera que el bot
existe a quien no está autorizado.

## Flujo de conversación

### Mensaje de texto → crear carro

1. Se llama a Claude con una herramienta (`extract_car_purchase`) que
   devuelve `{ model, year, purchasePrice, purchaseDate }` o marca campos
   como `null` si no pudo extraerlos del mensaje.
2. Si falta `model`, `year`, o `purchasePrice` → el bot responde pidiendo que
   se repita con esos datos, sin crear ninguna fila pendiente.
3. Si los tres están presentes → el bot arma el registro completo del carro
   con la misma forma que usa el frontend (`emptyCar` en
   `src/lib/carCalculations.js`): `model`, `year`, `auctionPrice` =
   `purchasePrice`, `purchaseDate`, `status: "available"`,
   `saleType: "cash"`, y el resto de campos en `""` — y responde con un
   resumen pidiendo confirmación, guardando un `bot_pending_actions` de
   `kind: "new_car_confirm"` con ese registro completo como `payload`.
4. Respuesta del usuario:
   - Afirmativa → `insert` en `cars` con `data` = el payload guardado, se
     borra la fila pendiente, se confirma con el ID/resumen del carro creado.
   - Negativa → se borra la fila pendiente, se confirma la cancelación.
   - Cualquier otra cosa → se le pide que responda sí/no.

### Foto de recibo → registrar gasto

1. El bot descarga la foto de Telegram (`getFile` + descarga del archivo) y
   arma un mensaje para Claude con: la imagen, el texto/caption del mensaje,
   y la lista actual de carros (`id`, `year`, `model`) obtenida de `cars` en
   ese momento.
2. Se llama a Claude con una herramienta (`read_receipt`) que devuelve:
   `{ matchedCarIds: string[], amount: number | null, category: string | null }`,
   donde `category` es una de las 10 claves de costo ya usadas en
   `COST_FIELDS` de `src/lib/carCalculations.js` **excluyendo**
   `auctionPrice` (esa es el precio de compra del carro, no un gasto
   posterior): `repairCost`, `partsCost`, `transportCost`, `adminFees`,
   `titleFees`, `taxes`, `detailingCost`, `advertisingCost`, `repoCost`,
   `miscCost`.
3. Resolución en orden (una pregunta pendiente a la vez). Si más de un campo
   falta a la vez (ej. el carro es ambiguo Y el monto es `null`), se resuelve
   uno por uno en el orden de esta lista: primero el carro, luego el monto,
   luego la categoría — cada vez que se resuelve un campo, se vuelve a
   revisar cuál es el siguiente campo faltante según este mismo orden antes
   de decidir qué fila pendiente crear a continuación (o si ya se puede
   pasar directo a la confirmación final):
   - Si `matchedCarIds.length === 0` → el bot responde que no encontró el
     carro y pide que se mencione más claro (año + modelo), sin fila
     pendiente.
   - Si `matchedCarIds.length > 1` → guarda `kind: "car_disambiguation"` con
     los candidatos (id + año + modelo) y el resto de datos ya extraídos
     (`amount`, `category`, foto/caption originales), y le pregunta al
     usuario cuál de los carros listados (numerados) es, esperando que
     responda con el número.
   - Si `amount` es `null` → guarda `kind: "amount_clarification"` con lo ya
     resuelto (carId único o lista de candidatos aún por resolver, y
     `category` si ya se conoce) y le pide al usuario que escriba el monto
     (ej. "¿cuánto fue el gasto?"), esperando una respuesta numérica.
   - Si `category` es `null` → guarda `kind: "category_disambiguation"` con
     las 10 categorías como opciones numeradas y el resto de datos ya
     resueltos, y espera que el usuario responda con el número de categoría.
   - Si todo está resuelto (un solo carro, monto, categoría) → guarda
     `kind: "expense_confirm"` con `{ carId, amount, category }` y responde
     con el resumen final pidiendo confirmación.
4. Respuesta del usuario a la confirmación final:
   - Afirmativa → se lee el `data` actual del carro, se suma `amount` al
     valor numérico existente del campo de esa `category` (no se reemplaza —
     así se pueden acumular varios recibos de la misma categoría a lo largo
     del tiempo), se hace `update` en `cars`, se borra la fila pendiente, se
     confirma.
   - Negativa → se borra la fila pendiente, se confirma la cancelación.

### Resolución de una fila pendiente existente

Si al llegar un mensaje nuevo ya existe una fila en `bot_pending_actions`
para ese `chat_id`, el mensaje entrante se interpreta como la respuesta a esa
pregunta pendiente (sí/no, un número de la lista, o el monto/categoría que se
pidió aclarar) — nunca se procesa como un mensaje nuevo independiente. Esto
significa que solo se puede tener una conversación "en curso" a la vez por
usuario, lo cual es aceptable dado que solo hay un usuario autorizado.

## Manejo de errores

- Update de un `chat_id` no autorizado → `200 OK`, ninguna acción.
- Claude no puede extraer nada útil de un mensaje de texto que no sea foto
  (ni parece describir la compra de un carro) → el bot responde explicando
  qué puede hacer (crear carro por texto, o recibo por foto).
- Fallo de red/API hacia Claude, Telegram, o Supabase → el bot responde con
  un mensaje de error genérico ("Hubo un problema, intenta de nuevo") en vez
  de fallar en silencio o dejar una fila pendiente a medias. Si el fallo
  ocurre después de crear la fila pendiente pero antes de responder, la fila
  queda igual disponible para resolverse en el siguiente mensaje (no se
  pierde el progreso).
- Respuesta ambigua a una pregunta pendiente (ej. no es ni "sí" ni "no" ni un
  número válido de la lista) → se vuelve a pedir la misma pregunta.

## Prerequisitos (antes de implementar)

El usuario debe completar estos tres pasos manualmente (con guía paso a paso
al ejecutar el plan) antes de que la Edge Function pueda desplegarse
funcionalmente:

1. Crear el bot hablándole a **@BotFather** en Telegram → obtener el token.
2. Mandarle cualquier mensaje al bot nuevo, y usar
   `https://api.telegram.org/bot<TOKEN>/getUpdates` en el navegador para leer
   el `chat.id` de esa conversación.
3. Obtener una API key de Anthropic en console.anthropic.com.

## Verificación

Sin test automatizado del bot en sí (no hay forma de simular mensajes reales
de Telegram sin credenciales reales). La verificación final requiere que el
usuario le mande mensajes reales al bot: un texto describiendo la compra de
un carro (confirmando que aparece en la app web tras confirmar), y una foto
real de un recibo mencionando un carro existente (confirmando que el monto se
suma a la categoría correcta). El plan de implementación incluye casos de
prueba específicos (qué mandar, qué se espera de respuesta) para guiar esa
verificación manual.
