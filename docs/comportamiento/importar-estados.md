# Importar estados de cuenta

Cargar el historial de movimientos desde los PDF que mandan los bancos, para que el app tenga contexto desde el primer día (PRI-03).

**Enfoque técnico** (decidido en la conversación "Procesar estados de cuenta PDF"): la IA es el último recurso, no el primero. Los estados de cuenta de los bancos son PDF con el texto adentro, así que extraer el texto es gratis e instantáneo. Cada banco tiene su propio lector (parser) que entiende su formato.

### IMP-01 · Dónde se importa

**Estado:** Falta

- En la **configuración inicial**, como paso opcional después de crear la primera cuenta ("Cargá tu historial"). Se puede saltar.
- En **Ajustes → Importar estados de cuenta**, en cualquier momento.

### IMP-02 · Primero se elige el banco

**Estado:** Falta

Cada banco manda los estados de cuenta en un formato distinto, así que la persona elige el banco antes de subir el archivo. Por ahora solo **BAC**. Los bancos se agregan uno por uno, cuando haya un lector para su formato.

Después elige a qué cuenta van los movimientos (o crea una). Si el estado de cuenta trae los últimos 4 dígitos y coinciden con una cuenta del espacio, se elige sola.

> Ver la pregunta abierta 1.

### IMP-03 · El PDF se lee en el teléfono

**Estado:** Falta

El texto del PDF se extrae en el dispositivo de la persona. El archivo no se sube ni se guarda en ningún lado; solo se guardan los movimientos que la persona confirma.

| Caso | Resultado esperado |
|---|---|
| El PDF tiene contraseña | El app la pide (no la guarda) |
| El PDF no tiene texto (es una imagen escaneada) | Mensaje: "Este PDF es una imagen y no lo podemos leer. Descargá el estado de cuenta original desde la banca en línea." |
| El PDF es de otro banco o de un formato que el lector no entiende | Mensaje claro, sin importar nada |

### IMP-04 · Revisar antes de importar

**Estado:** Falta

Antes de guardar, el app muestra lo que encontró: la lista de movimientos (fecha, comercio, monto, moneda, categoría sugerida), los totales y el período del estado de cuenta. Se puede quitar un movimiento o cambiarle la categoría.

Los totales se comparan contra los del estado de cuenta. Si no cuadran, el app lo dice ("Encontramos ¢412.300 en cargos, el estado de cuenta dice ¢415.800") para no importar algo mal leído sin saberlo.

### IMP-05 · Sin duplicados

**Estado:** Falta

- **El mismo archivo** no se importa dos veces: el app lo reconoce y avisa.
- **Movimientos repetidos**: si un movimiento ya existe en la cuenta (misma fecha, monto y comercio), porque vino de otro estado de cuenta que se traslapa, de un voucher o se registró a mano, no se vuelve a crear. En la revisión aparece marcado como "Ya estaba".

- **Dado** que el 3 oct registré a mano un gasto de ¢23.450 en ampm con la Visa
- **Cuando** importo el estado de cuenta de octubre de la Visa, que trae "AMPM ESCAZU ¢23.450 03/10"
- **Entonces** la revisión lo marca "Ya estaba" y no se duplica

> Ver la pregunta abierta 2.

### IMP-06 · Categorías como cualquier otro movimiento

**Estado:** Falta

Los movimientos importados se categorizan igual que los vouchers: primero reglas e historial del comercio, y la IA solo para los comercios desconocidos, en un solo lote y con texto (nunca el PDF). Los que categorizó la IA quedan "Por revisar".

### IMP-07 · El historial no cambia los saldos de hoy

**Estado:** Falta

Lo importado es pasado: no cambia el saldo de una cuenta que ya tiene un saldo escrito después (CTA-03). Si la cuenta todavía no tiene saldo y el estado de cuenta trae el saldo final, el app ofrece usarlo como saldo de la cuenta en la fecha de corte.

---

## Preguntas abiertas

**1. ¿Qué estados de cuenta del BAC primero?** El BAC manda formatos distintos para tarjeta de crédito y para cuenta de ahorro o corriente. Propuesta: empezar por tarjeta de crédito (es donde está la mayoría de los gastos). Para escribir el lector hace falta un PDF de ejemplo de cada tipo, con los datos sensibles tapados.

**2. ¿Qué pasa con un "Ya estaba" que no es exacto?** Por ejemplo, un voucher en dólares y el estado de cuenta con el mismo cargo, o una fecha que difiere un día (el voucher dice la fecha de compra y el estado de cuenta la de aplicación). Propuesta: considerar duplicado si coincide el monto en la moneda original y la fecha difiere 2 días o menos, y dejar que la persona lo desmarque en la revisión.

**3. Archivos de Excel o CSV.** Algunos bancos dejan descargar los movimientos en Excel desde la banca en línea, que es más fácil y confiable de leer que un PDF. ¿Lo agregamos como segunda opción por banco?
