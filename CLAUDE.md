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
- **Movimientos**: buscador, un botón de filtros (hoja con período, tipo, categoría, cuenta, etiqueta) y los filtros activos como chips removibles. "Por revisar" es un selector de categoría en la misma fila; elegir una categoriza todos los movimientos pendientes del mismo comercio (con deshacer). "Seleccionar" permite cambiar la categoría de varios a la vez. En escritorio es una tabla.
- **Detalle de movimiento**: drawer en móvil, panel lateral derecho en escritorio. Abajo, los otros movimientos del mismo comercio.
- **Análisis**: nota de la IA (con enlace a Kai), gráfico del mes con una línea de comparación, pestañas Presupuesto (categorías con límites) y Tendencias (gasto por mes, mes vs. anterior, top comercios por monto o por compras).
- **Cuentas**: patrimonio neto, tarjetas de crédito, débito y ahorro, metas. Cada cuenta tiene su vista con sus movimientos.
- **Recurrentes**: filtros (próximos, pendientes, mensuales, anuales…), pagos pendientes manuales, pago de la tarjeta compartida.
- **Kai**: una pregunta, una respuesta (no es chat). Edge function `ask`, cuota de 40 por día.
- **Ajustes**: perfil, espacios, categorías, tokens del script, notificaciones.

## Base de datos: piezas clave

- Tablas principales: `transactions`, `categories`, `accounts`, `recurring`, `merchant_rules`, `merchants`, `merchant_patterns`, `spaces`, `space_members`, `goals`, `balance_snapshots`, `fx_rates`, `ingest_tokens`, `ingest_unmatched`, `ai_usage`.
- `transactions.merchant_key` es una columna generada con `merchant_key(raw_merchant)`. Si se cambia esa función, hay que tocar las filas (`update … set raw_merchant = raw_merchant`) para recalcularla.
- Categorización automática: `match_category` usa primero reglas con prioridad ≥ 50, luego el historial del mismo comercio del catálogo (`merchant_id`) o, si no tiene, del mismo `merchant_key`, luego las demás reglas. Si nada aplica, la IA (`categorize`) deja una sugerencia en `suggested_category_id` y el movimiento queda `status = 'review'`.
- La IA pregunta una vez por comercio: los movimientos del mismo comercio comparten respuesta (en el lote y después, reusando la de un movimiento anterior). Si el nombre se parece a un comercio del catálogo (`merchant_candidates`, con pg_trgm), la misma llamada pregunta si es ese y deja `suggested_merchant_id`; la persona confirma en el detalle ("¿Es ampm? Sí / No").
- `pretty_merchant` limpia el nombre del comercio. Uber Eats se separa de Uber con `is_uber_eats()`.
- Recurrentes: el trigger `advance_recurring` mueve `next_due` y marca `last_paid_on`. Un recurrente es "manual" si `method <> 'card'` y aparece en Pagos pendientes hasta que se confirma.
- Seguridad: `set_fx_rate` solo para admins y con límites; cuotas diarias de IA con `consume_ai_quota`; las llamadas internas a `categorize` llevan el header `x-notify-secret`.
- Edge functions: `categorize` (verify_jwt off, acepta secreto interno o sesión de usuario), `insight` (cuota 60), `ask` (cuota 40), `notify`.

## Ingesta de vouchers

`scripts/google-apps-script.gs` corre en la cuenta de Google de Dani. Lee los correos del BAC (etiqueta `Finanzas/Historial` para importar historial) y llama a `ingest_voucher_as` con el token personal. Los últimos 4 dígitos de la tarjeta deciden el espacio.

## Suscripciones de Apple

- El banco solo dice "APPLE.COM/BILL CUPERTINO". El script de Google lee los recibos de Apple (`procesarRecibosApple`, corre con los vouchers; `importarRecibosApple` una vez para el historial) y llama a `ingest_apple_receipt` con app, plan, monto, fecha y últimos 4 dígitos. Entiende el formato nuevo de recibo y el viejo ("Your invoice from Apple.").
- `apple_receipts` guarda cada recibo. Se empareja con el cobro de Apple del mismo monto y moneda a 3 días o menos, en un espacio del dueño del recibo y con la misma tarjeta si se sabe. Si hay dos candidatos casi igual de cerca, no adivina y el cobro queda como "Apple".
- Si el recibo llega antes que el cobro, el trigger `transactions_0_apple` (corre antes que los demás) le pone el nombre de la app al insertarlo; si llega después, `apple_match_receipt` lo renombra y lo liga a su recurrente (`link_recurring`). `ensure_app_merchant` crea el comercio de la app en el catálogo (YouTube, iCloud, Apple One…).
- `match_recurring` y las sugerencias de recurrentes también miran el nombre limpio, así cada suscripción puede tener su recurrente ("YOUTUBE") sin agarrar todo Apple. La IA nunca renombra cobros de Apple. El detalle muestra "Suscripción en Apple: YouTube Premium · mensual".

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

## Convenciones de diseño y copy

- Simpleza radical: las vistas iniciales muestran solo lo esencial. Lo secundario va en el detalle.
- Copy del app en español de Costa Rica con voseo ("Elegí", "Probá"). Nunca usar guiones largos (—).
- Patrones conocidos antes que inventos: selects nativos para elegir categoría, chips removibles para filtros, hoja de filtros con "Ver N movimientos", toast de 6 s con "Deshacer" en acciones masivas.
- Tema oscuro por defecto; las hojas y drawers son claros (clases `.light`, `.sheet`, `.sheet-page`, `.tx-sheet`, `.txd`). Cuidar el contraste en ambos.
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
