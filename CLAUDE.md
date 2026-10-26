# Finanzas: contexto del proyecto

App web (PWA) de finanzas personales y compartidas para Dani y Kimmy, en Costa Rica, en colones y dólares.

- Producción: https://finanzas-alpha-three.vercel.app
- Repo: github.com/danielgamboach/finanzas (rama `main`)
- Supabase: proyecto `vzgnujopgryuskixcnnx`
- Vercel: proyecto `finanzas` (`prj_vnfD3YUqyZdb78N9kWGDSjhT7pYB`)

## Espacios

| Espacio | Tipo | ID |
|---|---|---|
| Personal de Dani | personal | `d1730207-c62e-428c-b40c-875001813243` |
| Personal de Kimmy | personal | `ab195356-185a-4fb2-bcca-26cea905c5fc` |
| Simbiosis (compartido) | shared | `71150d11-94c1-4114-9b8c-ec14bed697ed` |

Dani es el único admin de la app (`app_admins`, user `92f8f5c6-e170-4058-9576-e63b0c2126e6`).

## Stack

- React 19 sin framework, empaquetado con esbuild (`npm run build` → `dist/`). No hay chequeo de tipos en el build.
- Router propio por hash (`#/ruta`). Cliente REST propio para Supabase en `src/lib/api.ts` (`db.select/insert/update/updateIds/rpc/fn`).
- Supabase: Postgres con RLS por espacio (`is_space_member`), Auth, Storage (bucket `merchant-photos`), pg_net y pg_cron.
- Vercel para hosting, con CSP estricta en `vercel.json` (solo `self` y el dominio de Supabase).

## Estructura

```
src/
  App.tsx          rutas; el detalle de movimiento se abre encima de la pantalla de fondo
  store.tsx        contexto global (espacio, categorías, cuentas, fotos, toast con deshacer, bump() para recargar)
  lib/             api, cálculos, formato, períodos, recurrentes, fotos de comercios, undo
  screens/         Home, Movimientos, Presupuesto (Análisis), Patrimonio (Cuentas), Recurrentes, TxForm, Ajustes…
  ui/              TxRow, TxDetail, TxSheet, CatPick, PendingPayments, Kai, AiNote, MonthChart…
  desktop/         layout de escritorio (barra lateral, inicio, movimientos en tabla)
supabase/
  migrations/      SQL aplicado (fuente de verdad del esquema)
  functions/       edge functions: categorize, insight, ask, notify
scripts/
  google-apps-script.gs   lee los correos del BAC y manda vouchers a la base
```

## Secciones del app

- **Inicio**: disponible del mes, botón Gasto, tarjeta de gastado con comercios recientes, abanico de cuentas. Abajo, una hoja con pagos pendientes y últimos movimientos; al subirla se vuelve el buscador de movimientos.
- **Movimientos**: buscador, un botón de filtros (hoja con período, tipo, categoría, cuenta, etiqueta) y los filtros activos como chips removibles. "Por revisar" es un selector de categoría en la misma fila; elegir una mueve todo el comercio a esa categoría (con deshacer). "Seleccionar" permite cambiar la categoría de varios a la vez. En escritorio es una tabla.
- **Detalle de movimiento**: drawer en móvil, panel lateral derecho en escritorio. Abajo, los otros movimientos del mismo comercio.
- **Análisis**: nota de la IA (con enlace a Kai), gráfico del mes con una línea de comparación, pestañas Presupuesto (categorías con límites) y Tendencias (gasto por mes, mes vs. anterior, top comercios por monto o por compras).
- **Cuentas**: patrimonio neto, tarjetas de crédito, débito y ahorro, metas. Cada cuenta tiene su vista con sus movimientos.
- **Recurrentes**: filtros (próximos, pendientes, mensuales, anuales…), pagos pendientes manuales, pago de la tarjeta compartida.
- **Kai**: una pregunta, una respuesta (no es chat). Edge function `ask`, cuota de 40 por día.
- **Ajustes**: perfil, espacios (invitar con enlace o código), categorías, tokens del script, notificaciones.

## Base de datos: piezas clave

- Tablas principales: `transactions`, `categories`, `accounts`, `recurring`, `merchant_rules`, `merchants`, `merchant_patterns`, `spaces`, `space_members`, `goals`, `balance_snapshots`, `fx_rates`, `ingest_tokens`, `ingest_unmatched`, `ai_usage`.
- `transactions.merchant_key` es una columna generada con `merchant_key(raw_merchant)`. Si se cambia esa función, hay que tocar las filas (`update … set raw_merchant = raw_merchant`) para recalcularla.
- Categorización automática: `match_category` usa primero reglas con prioridad ≥ 50, luego el historial del mismo comercio del catálogo (`merchant_id`) o, si no tiene, del mismo `merchant_key`, luego las demás reglas. Si nada aplica, la IA (`categorize`) deja una sugerencia en `suggested_category_id` y el movimiento queda `status = 'review'`.
- La IA pregunta una vez por comercio: los movimientos del mismo comercio comparten respuesta (en el lote y después, reusando la de un movimiento anterior). Si el nombre se parece a un comercio del catálogo (`merchant_candidates`, con pg_trgm), la misma llamada pregunta si es ese y deja `suggested_merchant_id`; la persona confirma en el detalle ("¿Es ampm? Sí / No").
- Un comercio es una sola cosa: `set_merchant_category(tx, categoría)` mueve todos sus movimientos del espacio (todas las sucursales si está en el catálogo; si no, mismo `merchant_key` o nombre) y las reglas con prioridad ≥ 50 que solo lo agarran a él. Devuelve lo que pisó para deshacer (`src/lib/merchantCategory.ts`). Lo usan el formulario de edición (casilla "Mover todo X", activa por defecto) y "Por revisar".
- `pretty_merchant` limpia el nombre del comercio. Uber Eats se separa de Uber con `is_uber_eats()`.
- Recurrentes: el trigger `advance_recurring` mueve `next_due` y marca `last_paid_on`. Un recurrente con `variable = true` (luz, agua, internet) se reconoce por nombre y fecha sin importar el monto; su `amount` es el promedio de los últimos 3 pagos ligados (`recurring_refresh_amount`, trigger `transactions_recurring_amount`). Al marcarlo variable, `recurring_variable_backfill` liga las facturas viejas del mismo nombre. En el app se muestra con "≈" y "Varía". Un recurrente es "manual" si `method <> 'card'` y aparece en Pagos pendientes desde el día antes del vencimiento (o si está atrasado) hasta que se confirma (`needsConfirm`).
- Seguridad: `set_fx_rate` solo para admins y con límites; cuotas diarias de IA con `consume_ai_quota`; las llamadas internas a `categorize` llevan el header `x-notify-secret`.
- Edge functions: `categorize` (verify_jwt off, acepta secreto interno o sesión de usuario), `insight` (cuota 60), `ask` (cuota 40), `notify`.

## Usuarios nuevos

- `profiles.onboarded_at` en null muestra la configuración inicial (`src/screens/Onboarding.tsx`) antes que nada: cómo va a usar el app (solo, con alguien, o me invitaron), primera cuenta y un cierre que lleva al primer gasto. Todo se puede saltar. Los perfiles que ya existían quedaron marcados como hechos.
- Al compartir, crea el espacio con `create_space` y la invitación con `create_invite`. El enlace `#/unirme/<código>` guarda el código en `localStorage` (`finanzas.invite`) hasta que la persona entra: si es nueva, la configuración la une; si ya tenía cuenta, se une sola al entrar.
- Inicio muestra "Primeros pasos" (`src/ui/GettingStarted.tsx`) mientras `profiles.setup_hidden` sea false: primer gasto, cuenta, pagos fijos, un límite, invitar (si tiene un espacio compartido propio) y notificaciones. Cada paso se marca solo con datos reales. El aviso de notificaciones de pantalla completa espera a que se cierre.
- Los admins ven la configuración sin guardar nada en Ajustes → "Bienvenida de usuarios nuevos" (`#/bienvenida`).
- La conexión con los correos del BAC no está en los primeros pasos: el script de Google todavía es personal de Dani (Sheet y fechas propias).

## Ingesta de vouchers

`scripts/google-apps-script.gs` corre en la cuenta de Google de Dani. Lee los correos del BAC (etiqueta `Finanzas/Historial` para importar historial) y llama a `ingest_voucher_as` con el token personal. Los últimos 4 dígitos de la tarjeta deciden el espacio.

Preautorizaciones de Uber y Didi (`is_hold_merchant`): solo quedan "Por confirmar" (`hold = 'pending'`) si hay 2 o más en la misma tarjeta a menos de 10 minutos entre sí (triggers `transactions_hold_window` y `transactions_hold_window_pull`); un viaje solo cuenta de una vez. Los pendientes se confirman solos a las 48 h (`settle_holds`) y "No se cobró" los oculta del app (`set_holds`, columna `visible`).

## Suscripciones de Apple

- El banco solo dice "APPLE.COM/BILL CUPERTINO". El script de Google lee los recibos de Apple (`procesarRecibosApple`, corre con los vouchers; `importarRecibosApple` una vez para el historial) y llama a `ingest_apple_receipt` con app, plan, monto, fecha y últimos 4 dígitos. Entiende el formato nuevo de recibo y el viejo ("Your invoice from Apple.").
- `apple_receipts` guarda cada recibo. Se empareja con el cobro de Apple del mismo monto y moneda a 3 días o menos, en un espacio del dueño del recibo y con la misma tarjeta si se sabe. Si hay dos candidatos casi igual de cerca, no adivina y el cobro queda como "Apple".
- Si el recibo llega antes que el cobro, el trigger `transactions_0_apple` (corre antes que los demás) le pone el nombre de la app al insertarlo; si llega después, `apple_match_receipt` lo renombra y lo liga a su recurrente (`link_recurring`). `ensure_app_merchant` crea el comercio de la app en el catálogo (YouTube, iCloud, Apple One…).
- `match_recurring` y las sugerencias de recurrentes también miran el nombre limpio, así cada suscripción puede tener su recurrente ("YOUTUBE") sin agarrar todo Apple. La IA nunca renombra cobros de Apple. El detalle muestra "Suscripción en Apple: YouTube Premium · mensual".
- La cara de esos movimientos es el logo del servicio con un logo chico de Apple abajo a la derecha (`txBadge` + `Emo badge`), en las listas, el detalle y Top comercios.

## Comercios y logos (catálogo global)

- `merchants` (nombre, logo en `photo_path`) y `merchant_patterns` (palabras que llevan a ese comercio, p. ej. "AM PM" y "AMPM" → ampm). El catálogo es uno solo para todos los usuarios: un logo o una unión sirve para todos.
- Un movimiento pertenece al comercio cuyo patrón aparece como palabras completas en `raw_merchant` o `merchant` (sin tildes ni mayúsculas); gana el patrón más largo. El trigger `transactions_merchant` guarda el resultado en `transactions.merchant_id`, y al agregar, mover o apagar un patrón se re-enlazan los movimientos afectados. Eso agrupa sucursales en el detalle ("Más de ampm"), en Top comercios, en "Por revisar" y en el historial de categorías.
- Escrituras solo por funciones con reglas: `merchant_create`, `merchant_add_pattern` ("Unir con otro comercio"), `merchant_disable_pattern` (deshacer; los patrones nunca se borran), `merchant_set_photo`, `merchant_rename`. Cualquiera puede crear un comercio, unir con al menos 3 letras y poner el primer logo; solo un admin (`is_app_admin()`, tabla `app_admins`) reemplaza o quita un logo, renombra comercios ajenos o mueve patrones ajenos.
- Logos: 192 px JPEG, siempre un archivo nuevo en `<space_id>/m-<uuid>.jpg` del bucket `merchant-photos` (público). Los 82 logos originales siguen en sus rutas de antes. `merchant_photos` quedó como historial de solo lectura y ya no se usa.
- En el app: `src/lib/merchants.ts` (misma regla de coincidencia, `txMerchant`, `txPhoto`), `src/ui/Merchant.tsx` (campo de foto en el formulario, hoja de foto, hoja de unir). Ajustes ya no lista fotos.

## Cómo trabajar

- **Build**: `npm run build`. Para ver localmente: `npx serve dist`.
- **Publicar**: un push a `main` NO publica solo (la integración Git de Vercel no despliega automáticamente). Se publica con un deployment de producción desde GitHub (`main`) en Vercel. Conviene activar el despliegue automático en la configuración Git del proyecto en Vercel.
- **Migraciones**: un archivo en `supabase/migrations/` por cambio, con el mismo SQL que se aplicó. Al aplicarlas por MCP, los `DROP` y `DELETE` se cancelan: separarlos o evitarlos.
- **Commits**: mensaje en inglés, con el trailer de Claude cuando aplique.
- **QA**: revisar móvil (390 px) y escritorio (1440 px). Capturas solo si el cambio es visual.
- **Eficiencia**: agrupar varios cambios por ciclo y una sesión por tema.

## Sistema de diseño (tokens)

- **Fuente única**: `tokens/tokens.json`. `npm run build` corre `scripts/tokens.mjs`, que genera `src/tokens.css` (no se edita a mano), y `scripts/check-tokens.mjs`, que falla el build si aparece un color hex, un `font-size` en px, un `font-weight` numérico o un radio en px fuera de los tokens (excepción: dibujo en canvas).
- **Primitivos**: Tailwind v4.1 con sus nombres (`--color-neutral-800`, `--text-sm` y `--text-sm--line-height`, `--font-weight-semibold`, `--tracking-tight`, `--radius-3xl`, `--spacing: 4px`).
- **Semánticos** estilo shadcn: `--background`, `--foreground`, `--card`, `--popover`, `--primary(-foreground)`, `--secondary(-foreground)`, `--muted(-foreground)`, `--accent`, `--border`, `--input`, `--ring`, `--destructive`, `--success`, `--warning` (cada uno con `-subtle` y `-subtle-foreground`), `--highlight`, `--ai…` (Kai), `--sidebar…`, `--chart-…`, `--overlay`, y los de datos `--category-<color>(-subtle)` y `--account-<color>(-foreground)`.
- **Temas**: oscuro en `:root`; claro en `.light, .sheet, .sheet-page, .np-card, .tx-sheet, .rec-row.ask, .txd`. Un elemento con la clase `light` se vuelve superficie clara (sus tokens cambian). Dentro de una tarjeta (`.card`, `.dcard`, `.pp-card`, etc.) `--secondary` sube un paso (`--secondary-on-card`) para que los controles no se fundan con la tarjeta.
- **Escalas**: tipo 12/14/16/18/20/24/30/36/48/60 con pesos 500, 600 y 700; radios de Tailwind (`full` para todo lo que es píldora o círculo, `3xl` tarjetas, `4xl` hojas, `2xl` filas y menús); espaciado en px pero siempre un paso de la escala de Tailwind (2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32…).
- **Figma**: archivo "Finanzas DS" (`9ZEhCZzb13CLLv3YUx1GZm`). Colecciones `Tailwind v4.1 · …` (primitivos) y `Finanzas · Tokens` (semánticos, modos Oscuro y Claro). Mismo nombre que en código con `/` en vez de `-`: `color/card-foreground` ↔ `var(--card-foreground)`, `color/category/mint` ↔ `var(--category-mint)`. Cada variable tiene su code syntax web. Página "Fundamentos" con muestras de todo y página "Componentes" con `Icon/<nombre>` (34), `Button` (Variant × Size, mismas variantes y tamaños que el código, propiedades Label, Leading, Trailing e íconos intercambiables) y `Button / Icon` (el `iconOnly`). En la misma página, dos columnas: Átomos (izquierda: Badge, Tag, Utilidades con Kbd/Grabber/Separator/Spinner/Skeleton, Avatar, Money, Input, Switch, Checkbox, Radio, Progress) y Moléculas (derecha: Chip, Segmented, SearchField, Field, FieldRow, FieldGroup, AmountInput, ListItem, OptionCard, Alert, Delta, Stat, Menu, EmptyState, Toast, Card, SheetHeader). Tercera columna, Organismos y piezas del app: System / StatusBar (solo para maquetar), ProfileButton, KaiButton, AccountCard (tamaño peek, un color por token account-*), AccountStack, TabBar (+ Item), Utility / Fade, HomeHeader, BalanceSummary, SpendCard, TxRow (sheet/list × expense/income/review/pending), PendingPayment / Row y PendingPayments. Esos están solo en Figma: su versión en código (`src/ds/`) y en Storybook falta. Página "Pantallas": "Inicio · móvil" (390) armada solo con instancias; los frames que quedan son de acomodo (la hoja clara y su contenido). Regla para pantallas nuevas: si algo no existe como componente, se crea primero en "Componentes". Todo vinculado a variables; cada componente lleva el código en su descripción y un link a Storybook (Code Connect no está disponible en el plan actual de Figma). Las hojas se diseñan con el frame en modo Claro. Al cambiar un componente en código, actualizar también su versión en Figma.
- **Componentes**: el sistema vive en `src/ds/` (atómico: `foundations/`, `atoms/`, después `molecules/`), cada componente con su `.tsx`, su `.css` (solo tokens) y su `.stories.tsx` al lado. `src/ui/` queda para piezas del app. Hecho: `Icon`, `Button` (variantes `primary`, `secondary`, `muted`, `outline`, `ghost`, `link`, `destructive`, `destructive-outline`; tamaños `xs` 28, `sm` 36, `md` 44, `lg` 52, `xl` 60). Los botones del app todavía usan las clases viejas: la historia "Inventario de hoy" muestra cada una junto a su reemplazo y las 13 decisiones pendientes antes de migrar.
- **Storybook**: https://finanzas-ds-hola-3108s-projects.vercel.app (proyecto Vercel `finanzas-ds`, `prj_VM2nTUCOKluUelRAg307K1Wjld8p`, root `ds/`, protegido con el login de Vercel). No está ligado a GitHub: se publica con un deployment de producción desde `main`, igual que el app. Local: `npm run storybook`. Roles tipográficos: clases `.type-*` generadas desde `tokens.json` (mismos nombres que los estilos de texto de Figma). `.theme-dark` fuerza el modo oscuro dentro de una superficie clara.
- **Cambiar un token**: editar `tokens/tokens.json`, correr el build y actualizar la variable en Figma (o al revés: si Dani cambia una variable en Figma, leerla y pasarla al JSON).

## Convenciones de diseño y copy

- Simpleza radical: las vistas iniciales muestran solo lo esencial. Lo secundario va en el detalle.
- Copy del app en español de Costa Rica con voseo ("Elegí", "Probá"). Nunca usar guiones largos (—).
- Patrones conocidos antes que inventos: selects nativos para elegir categoría, chips removibles para filtros, hoja de filtros con "Ver N movimientos", toast de 6 s con "Deshacer" en acciones masivas.
- Tema oscuro por defecto; las hojas y drawers son claros (ver "Sistema de diseño"). Cuidar el contraste en ambos. Nunca colores, tamaños ni radios sueltos: siempre tokens.
- Montos en la moneda de visualización elegida (colones o dólares); la moneda original vive en el detalle.
- Colones siempre con `¢` (así se escribe en Costa Rica), nunca `₡`: en el app, en Kai, en la nota de la IA y en las notificaciones (`crc_text`). Las filas de movimientos muestran solo la subcategoría; el detalle muestra "Padre › Hija".

## Reglas que no se rompen

- No cerrar los registros de usuarios nuevos.
- Nunca subir al repo el token personal del script, la clave de Anthropic, el VAPID privado ni `notify_secret`. Viven en los secretos de Supabase o en `app_secrets`.
- No enviar el correo de Dani a servicios externos.

## Pendientes conocidos

- Espacio personal de Dani: no tiene categoría Transporte, así que sus viajes de Uber quedan sin categoría.
- "Dinero Simbiótico" tiene `last_paid_on` en noviembre por un movimiento con fecha futura.
- Pendientes manuales de Dani: activar la protección de contraseñas filtradas en Supabase Auth, confirmar que la confirmación de correo está activa, poner un límite de gasto en Anthropic y borrar la rama `logo-import` en GitHub.
- Tabla `_seed_logos` sin uso (RLS activo, sin acceso); se puede borrar a mano.
- Storage: las políticas del bucket `merchant-photos` pertenecen al rol de storage y no se pueden cambiar por SQL. Todavía permiten que un miembro sobrescriba o borre archivos de la carpeta de su espacio (el app nunca lo hace). Para cerrarlo, en el dashboard de Supabase (Storage → Policies) dejar update y delete solo para admins.
