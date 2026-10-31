# Movimientos

Un movimiento es cualquier cosa que mueve dinero: un gasto, un ingreso o dinero que pasa de una cuenta a otra. Cómo afecta cada uno a los saldos está en [cuentas-y-saldos.md](cuentas-y-saldos.md).

### MOV-01 · Hay tres tipos de movimiento

**Estado:** Parcial

| Tipo | Qué es | Ejemplo |
|---|---|---|
| Gasto | Sale dinero de una cuenta hacia afuera | Súper, gasolina, Netflix |
| Ingreso | Entra dinero de afuera a una cuenta | Salario, freelance, intereses |
| Mover dinero | Pasa dinero entre dos cuentas propias, o a una cuenta de un espacio compartido | Ahorrar, pagar la tarjeta, abonar al préstamo, poner la parte del mes en la cuenta de la casa |

Las devoluciones son gastos al revés: suman a la cuenta y restan del gasto del mes. Llegan por vouchers e importación.

**Hoy** existe un cuarto tipo, **Aporte**, que se elimina: lo que hacía pasa a ser Mover dinero (MOV-03). Los 36 aportes que ya existen se convierten en movimientos entre cuentas.

### MOV-02 · Todo movimiento tiene una cuenta

**Estado:** Falta

No hay movimientos sin cuenta. Un gasto sale de una cuenta, un ingreso entra a una cuenta y Mover dinero tiene origen y destino. Si la persona no elige, la cuenta por defecto es Efectivo (CTA-13), que existe siempre.

- **Dado** que abro "Nuevo gasto" y no toco la cuenta
- **Entonces** la frase dice "Gasto en Efectivo"
- **Y** al guardar, el gasto queda en la cuenta Efectivo del espacio

**Hoy:** "Efectivo" en el formulario significa "sin cuenta" (no existe como cuenta). Hay 39 movimientos sin cuenta: 36 aportes y 3 gastos. Al crear las cuentas de Efectivo, los gastos se pasan ahí.

### MOV-03 · Mover dinero tiene origen y destino

**Estado:** Parcial

Origen y destino son obligatorios y distintos. Qué cuentas pueden ser origen o destino depende del tipo (CTA-12): por ejemplo, un préstamo solo puede ser destino.

Mover dinero puede ir de una cuenta de un espacio a una cuenta de otro espacio del que la persona también es miembro. Así se reemplaza el Aporte:

- **Dado** que Dani tiene Débito BAC en su espacio personal y el espacio compartido "Casa" tiene la cuenta "Casa BAC"
- **Cuando** Dani mueve ¢300.000 de Débito BAC a Casa BAC
- **Entonces** Débito BAC baja ¢300.000 en su espacio personal
- **Y** Casa BAC sube ¢300.000 en "Casa"
- **Y** el movimiento aparece en los dos espacios
- **Y** no cuenta como gasto en ninguno

**Hoy:** Mover dinero acepta guardar con solo una de las dos cuentas, y solo entre cuentas del mismo espacio.

> Ver las preguntas abiertas 1 y 2.

### MOV-04 · Todo gasto e ingreso tiene categoría

**Estado:** Parcial

Un gasto o ingreso registrado a mano no se puede guardar sin categoría. Los que llegan solos (vouchers, importación) reciben siempre la mejor categoría que el app pueda adivinar (reglas, historial del comercio o IA); si la adivinó la IA, quedan "Por revisar" hasta que la persona la confirme o la cambie, pero nunca quedan sin categoría.

**Hoy:** se puede guardar un gasto sin categoría (queda "Por revisar"), y los que la IA no logra categorizar quedan sin categoría. Hay 45 gastos e ingresos sin categoría.

> Ver la pregunta abierta 3: la categoría de Mover dinero.

### MOV-05 · Cualquier movimiento puede ser recurrente

**Estado:** Parcial

Al crear un gasto, ingreso o movimiento entre cuentas se puede marcar "Recurrente" y elegir la frecuencia (REC-01) y si es cargo automático o pago manual (REC-02). Eso crea el recurrente con ese movimiento como su primer pago.

**Hoy:** la casilla "Recurrente" solo crea recurrentes mensuales, y el tipo (automático o manual) sale de si la cuenta es tarjeta.

### MOV-06 · Editar, eliminar y deshacer

**Estado:** Hecho

Todo se puede editar después de guardado: tipo, monto, moneda, cuenta, categoría, fecha, comercio, nota y espacio. Eliminar pide confirmación y ofrece Deshacer. Los cambios se reflejan en saldos, presupuesto y gráficos en cuanto se guardan (CTA-11).

---

## Preguntas abiertas

**1. Mover dinero entre espacios: ¿cuenta como gasto en el personal?** Desde el espacio personal de Dani, los ¢300.000 que pone para la casa son plata que ya no tiene para él. Propuesta: no cuenta como gasto (para no contarlo dos veces, porque los gastos reales de la casa se registran en "Casa"), pero Mis finanzas del espacio personal muestra aparte "Puesto en espacios compartidos".

**2. ¿Quién ve qué en un movimiento entre espacios?** Kimmy ve en "Casa" que entraron ¢300.000 de Dani, pero no debería ver el nombre ni el saldo de la cuenta personal de Dani. Propuesta: en "Casa" el origen se muestra como "Dani (cuenta personal)".

**3. ¿Mover dinero lleva categoría?** Propuesta: no se elige; el app le pone una categoría fija del sistema según el caso ("Pago de tarjeta", "Ahorro", "Abono a préstamo", "Movimiento entre cuentas"), que no cuenta en el presupuesto. Así se cumple que todo tiene categoría sin pedirle nada a la persona.
