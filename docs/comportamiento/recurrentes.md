# Recurrentes

Pagos e ingresos que se repiten: suscripciones, alquiler, servicios, salario, la cuota del préstamo.

### REC-01 · Frecuencias

**Estado:** Hecho

Semanal, quincenal, mensual, bimestral, trimestral, semestral, anual o personalizada ("cada N días, semanas o meses").

<sub>Dónde vive: `recurring.every_n` y `every_unit`; `add_period` y `period_days` en la base, `addPeriod` en `src/lib/recurring.ts`.</sub>

### REC-02 · Cargo automático o pago manual

**Estado:** Hecho

Cada recurrente es de uno de dos tipos, y la persona lo elige:

| Tipo | Qué significa | Ejemplos |
|---|---|---|
| Cargo automático | El banco lo cobra solo; la persona no hace nada | Netflix a la tarjeta, la luz con débito automático |
| Pago manual | La persona tiene que pagarlo (SINPE, app del banco, efectivo) | Alquiler, la empleada, la cuota del préstamo si no está domiciliada |

Se elige al crear el recurrente (en el editor, o con la casilla Recurrente de un movimiento). Los que existían quedaron automáticos si eran de tarjeta y manuales si no.

<sub>Dónde vive: `recurring.auto`.</sub>

### REC-03 · Solo se muestra el próximo pago

**Estado:** Hecho

Cada recurrente aparece una sola vez, con su próxima fecha. Netflix muestra el pago del 15 nov, no los de diciembre, enero y los meses que siguen.

### REC-04 · La sección de Recurrentes

**Estado:** Hecho

Muestra el total al mes y los recurrentes agrupados: pagos manuales pendientes (vencidos o de hoy), próximos y pausados.

### REC-05 · Inicio muestra lo que toca hoy

**Estado:** Hecho

En Inicio aparecen los pagos manuales de hoy y los atrasados, cada uno con la fecha ("Hoy", "Venció ayer"), el monto y el botón **Pagar**. Una vez pagado, ignorado o pospuesto, desaparece de Inicio.

También aparecen los cargos automáticos de hoy (REC-08), sin botón, solo para avisar.

Los pagos manuales aparecen desde el día antes ("Mañana"). Un ingreso manual dice **Cobré** en vez de Pagar.

<sub>Dónde vive: `src/ui/PendingPayments.tsx`.</sub>

### REC-06 · Pagar pregunta desde qué cuenta

**Estado:** Hecho

Tocar **Pagar** abre una hoja con:

- **Cuenta**: elegida por defecto la del recurrente; se puede cambiar
- **Monto**: el del recurrente, editable (para los variables, como la luz)
- **Fecha**: hoy, editable

Al confirmar se crea el movimiento en esa cuenta, ligado al recurrente; el recurrente pasa a su siguiente fecha y el pago sale de Inicio. Aparece el aviso con Deshacer.

- **Dado** que el alquiler de ¢350.000 vence hoy y está ligado a Débito BAC
- **Cuando** toco Pagar, cambio la cuenta a Ahorro y confirmo
- **Entonces** se registra un gasto de ¢350.000 en Ahorro, en la categoría del alquiler
- **Y** el próximo pago del alquiler pasa al mes siguiente
- **Y** el alquiler desaparece de Inicio

<sub>Dónde vive: `src/ui/PaySheet.tsx`, también desde Recurrentes.</sub>

### REC-07 · Ignorar, posponer o cancelar

**Estado:** Hecho

Cada pago pendiente, en Inicio y en Recurrentes, ofrece además:

| Acción | Qué hace |
|---|---|
| Ignorar este | No registra nada; el recurrente pasa a su siguiente fecha |
| Posponer | Se elige una fecha nueva para este pago; mientras tanto sale de Inicio |
| Cancelar recurrente | El recurrente deja de repetirse (queda en pausados, se puede reactivar) |

Están en la misma hoja de Pagar. Posponer solo mueve este pago: los siguientes mantienen su fecha.

<sub>Dónde vive: `recurring.snooze_until`; `skipRecurring`, `snoozeRecurring` y `cancelRecurring` en `src/lib/recurring.ts`.</sub>

### REC-08 · Los cargos automáticos se registran solos

**Estado:** Hecho

El día del cargo, Inicio avisa "Hoy se cobra Netflix, 7,99 USD".

- **Sin vouchers** en la cuenta del recurrente: el app crea el gasto solo ese día, en esa cuenta, y la persona no tiene que hacer nada.
- **Con vouchers**: el app espera el voucher del banco; cuando llega, se liga al recurrente y el aviso desaparece.

- **Dado** que Netflix es un cargo automático de 7,99 USD a la Visa el 15 de cada mes, y la Visa no recibe vouchers
- **Cuando** llega el 15 nov
- **Entonces** existe un gasto de 7,99 USD en la Visa, categoría Suscripciones, ligado a Netflix
- **Y** la Visa debe 7,99 USD más
- **Y** el próximo cargo de Netflix es el 15 dic

Si el voucher no llega, al día siguiente el app registra el gasto con el monto esperado y una advertencia: mientras tanto Inicio dice "No llegó el voucher: se registra con el monto esperado", y después la fila del gasto dice "Sin voucher" y el detalle explica que no llegó el aviso del banco. El gasto cuenta como cualquier otro: actualiza el saldo y el gasto del mes. Si el voucher llega después, reemplaza ese gasto en vez de duplicarlo.

El voucher se reconoce por el nombre del recurrente aunque el banco lo escriba con puntos u otros signos: "CNFL" agarra "C.N.F.L.PAGUELO" (se comparan solo letras y números).

Solo cuentan los cargos de los últimos dos días: un cargo automático vencido hace más tiempo no se registra solo, para no inventar cobros viejos.

<sub>Dónde vive: `run_auto_recurring` en la base (cada hora), `transactions.auto_flag = 'no_voucher'` y `match_recurring`, que borra el gasto sin voucher cuando llega el real.</sub>

### REC-09 · Recurrentes de monto variable

**Estado:** Hecho

Luz, agua, internet: se reconocen por nombre y fecha sin importar el monto, y el monto esperado es el promedio de los últimos 3 pagos. Se muestran con "≈" y "Varía".

### REC-10 · La cuota de un préstamo puede ser recurrente

**Estado:** Falta

Al crear o editar un préstamo, si tiene día de pago, el app ofrece crear el recurrente de la cuota: un Mover dinero mensual desde la cuenta que se elija hacia el préstamo, manual o automático (PRE-05).

---

## Preguntas contestadas

**1. Una cuenta "usa vouchers"** si recibió al menos un movimiento por voucher en los últimos 30 días.

**2. Si el voucher no llega**, al día siguiente se registra igual, con una advertencia que lo dice (decisión de Dani, 31 oct).

## Preguntas abiertas

**3. ¿Desde cuándo aparece un pago manual en Inicio?** El pedido dice "los pagos del día"; hoy aparecen desde el día antes, como "Mañana", lo cual ayuda a no olvidar un pago que se hace temprano. ¿Lo dejamos así?
