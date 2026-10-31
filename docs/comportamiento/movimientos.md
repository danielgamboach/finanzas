# Movimientos

Un movimiento es cualquier cosa que mueve dinero: un gasto, un ingreso o dinero que pasa de una cuenta a otra. Cómo afecta cada uno a los saldos está en [cuentas-y-saldos.md](cuentas-y-saldos.md).

### MOV-01 · Hay tres tipos de movimiento

**Estado:** Hecho

| Tipo | Qué es | Ejemplo |
|---|---|---|
| Gasto | Sale dinero de una cuenta hacia afuera | Súper, gasolina, Netflix |
| Ingreso | Entra dinero de afuera a una cuenta | Salario, freelance, intereses |
| Mover dinero | Pasa dinero entre dos cuentas propias, o a una cuenta de un espacio compartido | Ahorrar, pagar la tarjeta, abonar al préstamo, poner la parte del mes en la cuenta de la casa |

Las devoluciones son gastos al revés: suman a la cuenta y restan del gasto del mes. Llegan por vouchers e importación.

El tipo **Aporte** ya no existe: lo que hacía es Mover dinero (MOV-03). Los 36 aportes que había se convirtieron: los de Dani y Kimmy salen del Efectivo de su espacio personal; los 7 de origen desconocido ("Aporte (cuenta 948199328)") salen del Efectivo del espacio compartido. Una copia de los originales quedó en la tabla `_contributions_backup`.

### MOV-02 · Todo movimiento tiene una cuenta

**Estado:** Hecho

No hay movimientos sin cuenta. Un gasto sale de una cuenta, un ingreso entra a una cuenta y Mover dinero tiene origen y destino. Si la persona no elige, la cuenta por defecto es Efectivo (CTA-13), que existe siempre.

- **Dado** que abro "Nuevo gasto" y no toco la cuenta
- **Entonces** la frase dice "Gasto en Efectivo"
- **Y** al guardar, el gasto queda en la cuenta Efectivo del espacio

La base lo garantiza: un movimiento que llega sin cuenta (por ejemplo, un voucher de una tarjeta desconocida) queda en el Efectivo del espacio.

<sub>Dónde vive: `check_tx_refs` en la base; la cuenta por defecto en `src/screens/TxForm.tsx`.</sub>

### MOV-03 · Mover dinero tiene origen y destino

**Estado:** Hecho

Origen y destino son obligatorios y distintos. Qué cuentas pueden ser origen o destino depende del tipo (CTA-12): por ejemplo, un préstamo solo puede ser destino.

Mover dinero puede ir de una cuenta de un espacio a una cuenta de otro espacio del que la persona también es miembro. Así se reemplaza el Aporte:

- **Dado** que Dani tiene Débito BAC en su espacio personal y el espacio compartido "Casa" tiene la cuenta "Casa BAC"
- **Cuando** Dani mueve ¢300.000 de Débito BAC a Casa BAC
- **Entonces** Débito BAC baja ¢300.000 en su espacio personal
- **Y** Casa BAC sube ¢300.000 en "Casa"
- **Y** el movimiento aparece en los dos espacios
- **Y** no cuenta como gasto en ninguno
- **Y** en la vista de Débito BAC aparece como "−300.000 CRC · A un espacio compartido"; en la de Casa BAC, como "+300.000 CRC"
- **Y** Mis finanzas del espacio personal muestra aparte "Puesto en espacios compartidos: Casa 300.000 CRC", que no suma al gasto del mes
- **Y** en "Casa", Kimmy lo ve como "+300.000 CRC · De Dani", con origen "Dani (cuenta personal)": no ve el nombre ni el saldo de la cuenta personal de Dani

Solo quien está en el espacio de origen puede editar o eliminar el movimiento. En el espacio que lo recibe se ve sin el botón Editar.

En cualquier vista de una cuenta, Mover dinero se muestra con signo según esa cuenta: − si el dinero salió de ella, + si entró.

<sub>Dónde vive: `transactions.to_space_id` (lo llena `check_tx_refs`) y la política `transactions_select_incoming`; `src/lib/transfers.ts`; el signo con `TxAccountScope` en `src/ui/TxRow.tsx`; el grupo en `Analysis` de `src/screens/Presupuesto.tsx`.</sub>

### MOV-04 · Todo gasto e ingreso tiene categoría

**Estado:** Hecho

Un gasto o ingreso registrado a mano no se puede guardar sin categoría. Los que llegan solos (vouchers, importación) reciben siempre la mejor categoría que el app pueda adivinar (reglas, historial del comercio o IA); si la adivinó la IA, quedan "Por revisar" hasta que la persona la confirme o la cambie, pero nunca quedan sin categoría.

Si la IA no tiene una sugerencia, el movimiento queda en "Otros" (o "Otro ingreso"), también "Por revisar". Los 45 que estaban sin categoría se resolvieron así.

Mover dinero no lleva categoría del espacio: el app le pone una según a dónde va el dinero, que no cuenta en el presupuesto y no se puede cambiar:

| Destino | Categoría |
|---|---|
| Una tarjeta de crédito | Pago de tarjeta |
| Un préstamo | Abono a préstamo |
| Ahorro, CDP o inversión | Ahorro |
| Una cuenta de otro espacio | A un espacio compartido |
| Cualquier otra | Movimiento entre cuentas |

Igual queda registrado y actualiza el saldo de las dos cuentas (CTA-07).

<sub>Dónde vive: `ai_category_fallback` y `fallback_category` en la base; `transferLabel` en `src/lib/transfers.ts`.</sub>

### MOV-05 · Cualquier movimiento puede ser recurrente

**Estado:** Hecho

Al crear un gasto, ingreso o movimiento entre cuentas se puede marcar "Recurrente" y elegir la frecuencia (REC-01) y si es cargo automático o pago manual (REC-02). Eso crea el recurrente con ese movimiento como su primer pago.

Si es Mover dinero, el recurrente guarda también la cuenta de destino (por ejemplo, la parte de cada mes para la casa).

### MOV-06 · Editar, eliminar y deshacer

**Estado:** Hecho

Todo se puede editar después de guardado: tipo, monto, moneda, cuenta, categoría, fecha, comercio, nota y espacio. Eliminar pide confirmación y ofrece Deshacer. Los cambios se reflejan en saldos, presupuesto y gráficos en cuanto se guardan (CTA-11).

---

## Preguntas contestadas

**1. Mover dinero entre espacios no cuenta como gasto en el personal**, pero sí se registra y baja la cuenta de origen (decisión de Dani, 31 oct).

**2. En el espacio que recibe, el origen se muestra como "Dani (cuenta personal)"**, sin el nombre ni el saldo de esa cuenta.

**3. Mover dinero lleva una categoría fija del sistema** según el destino (tabla en MOV-04), que no cuenta en el presupuesto. Igual queda registrado y actualiza los saldos (decisión de Dani, 31 oct).
