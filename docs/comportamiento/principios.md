# Principios

Las reglas de fondo. Cuando una regla de otro archivo choca con estas, gana esta.

### PRI-01 · El app es para cualquier persona

**Estado:** Parcial

Kai Finance está pensado para un público general en Costa Rica, no solo para Dani y Kimmy. Nada puede depender de cómo manejan ellos sus finanzas: ni nombres, ni tarjetas, ni bancos, ni acuerdos de pareja. Lo que hoy funciona así para ellos tiene que convertirse en algo que cualquiera pueda configurar o apagar.

Prueba: una persona nueva, sin saber nada de Dani y Kimmy, crea su cuenta y todo lo que ve tiene sentido para ella.

**Hoy** ningún texto del app nombra a Dani, Kimmy ni a sus espacios, pero hay comportamientos pensados para ellos:

| Qué | Dónde | Qué debería ser |
|---|---|---|
| Pago semanal de las tarjetas los viernes en todo espacio compartido (TAR-05) | `useCardPayment` en Recurrentes, recordatorio `card_payment_reminders` | Un recurrente normal que cada espacio crea si quiere, con la frecuencia y el día que elija |
| La semana empieza el viernes por defecto | `spaces.week_start` = 5 | Lunes por defecto, configurable |
| Categorías iniciales del espacio compartido con "Casita" | `seed_space_defaults` | Categorías genéricas de hogar |
| El script de Google importa un Sheet personal y la tarjeta ••7731 | `scripts/google-apps-script.gs` | Sin historial de Sheet; el historial entra por estados de cuenta (IMP) |

### PRI-02 · Lo manual es el camino principal; lo automático es avanzado

**Estado:** Parcial

En Costa Rica los bancos no tienen integraciones directas, así que el camino que se le muestra a todo el mundo es **agregar los movimientos a mano** (rápido, con sugerencias de comercio y categoría) y **cargar el historial con estados de cuenta** (IMP).

Los vouchers por correo (el script de Google que lee los avisos del BAC) siguen disponibles como función avanzada, pero no se promocionan: no aparecen en la configuración inicial, ni en Primeros pasos, ni en avisos. Quien los quiera los encuentra en Ajustes.

Todo lo que dependa de vouchers tiene que funcionar bien sin ellos. Por ejemplo, un cargo automático a tarjeta tiene que registrarse aunque nunca llegue un voucher (REC-08).

**Hoy:** Ajustes muestra "Vouchers automáticos" como un grupo más, al mismo nivel que el resto. Varias funciones asumen vouchers: la confirmación de cargos con tarjeta, "¿Es una suscripción?", las preautorizaciones de Uber y Didi y las suscripciones de Apple.

**Debería:** mover los vouchers a una sección "Avanzado" de Ajustes, y que las funciones que dependen de ellos simplemente no aparezcan para quien no los usa.

### PRI-03 · El historial entra por estados de cuenta

**Estado:** Falta

Con más historial el app da mejor contexto: gasto por mes, comparaciones, comercios frecuentes, recurrentes detectados. Por eso se invita a cargar estados de cuenta en la configuración inicial, y se puede hacer en cualquier momento desde Ajustes. Detalle en [importar-estados.md](importar-estados.md).

### PRI-04 · Borrar es borrar

**Estado:** Falta

Cuando una persona elimina información (un espacio, su cuenta de usuario), se borra de verdad y en ese momento, no se marca como oculta. Antes de borrar algo que no se puede recuperar, el app lo advierte con claridad. Detalle en [espacios.md](espacios.md).
