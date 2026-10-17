# Finanzas

App mobile first para manejar finanzas personales y compartidas en Costa Rica, en colones y dólares.

- **Espacios**: cada persona tiene su espacio privado y puede crear espacios compartidos (pareja, casa, viaje) e invitar con un código.
- **Movimientos**: gastos, ingresos, transferencias y aportes. Todo editable, con tags (`#finde`) y moneda original + tipo de cambio por movimiento.
- **Vouchers automáticos**: un Google Apps Script lee los correos del BAC y los manda a la base de datos. La tarjeta (últimos 4 dígitos) decide el espacio.
- **Presupuesto**: límites semanales o mensuales por categoría, alertas al 80% y 100%, proyección de cierre y comparativas del mismo periodo.
- **Pago del viernes**: lo que se debe de la tarjeta compartida en la semana viernes a jueves.
- **Patrimonio**: cuentas de ahorro, inversión (ej. Hapi), CDPs y deudas, con metas y evolución.

## Stack

- React 19 + esbuild (sin framework), PWA instalable.
- Supabase (Postgres + Auth + RLS). El cliente usa la API REST directamente (`src/lib/api.ts`).
- Vercel para el hosting.

## Desarrollo

```bash
npm install
npm run build   # genera dist/
npx serve dist
```

## Base de datos

Migraciones en `supabase/migrations`. La seguridad vive en Postgres: cada tabla tiene RLS por espacio y las
funciones que usa el script de Google se autentican con un token por usuario (se guarda solo su hash).

## Script de Google

`scripts/google-apps-script.gs`. Ver instrucciones al inicio del archivo.
