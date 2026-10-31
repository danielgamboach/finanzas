# Principios

Las reglas de fondo. Cuando una regla de otro archivo choca con estas, gana esta.

### PRI-01 · El app es para cualquier persona

**Estado:** Parcial

Kai Finance está pensado para un público general en Costa Rica, no solo para Dani y Kimmy. Nada puede depender de cómo manejan ellos sus finanzas: ni nombres, ni tarjetas, ni bancos, ni acuerdos de pareja. Lo que hoy funciona así para ellos tiene que convertirse en algo que cualquiera pueda configurar o apagar.

Prueba: una persona nueva, sin saber nada de Dani y Kimmy, crea su cuenta y todo lo que ve tiene sentido para ella.

Lo que estaba pensado para Dani y Kimmy y cómo quedó:

| Qué | Cómo quedó |
|---|---|
| Pago semanal de las tarjetas en todo espacio compartido (TAR-05) | Ajuste de cada espacio, apagado por defecto |
| La semana empezaba el viernes | Lunes por defecto en espacios nuevos, configurable en Ajustes → Espacios |
| El espacio compartido abría primero | El espacio personal es el principal y el que abre por defecto (ESP-01) |
| "Pago de tarjeta: Kimmy transfiere" | "Cargos de la semana pasada" |
| Categoría inicial "Casita" en espacios compartidos | "Hogar" |
| El script de Google importa un Sheet personal y la tarjeta ••7731 | **Pendiente**: el script sigue siendo personal de Dani; el historial de los demás entra por estados de cuenta (IMP) |

### PRI-02 · Lo manual es el camino principal; lo automático es avanzado

**Estado:** Hecho

En Costa Rica los bancos no tienen integraciones directas, así que el camino que se le muestra a todo el mundo es **agregar los movimientos a mano** (rápido, con sugerencias de comercio y categoría) y **cargar el historial con estados de cuenta** (IMP).

Los vouchers por correo (el script de Google que lee los avisos del BAC) siguen disponibles como función avanzada, pero no se promocionan: no aparecen en la configuración inicial, ni en Primeros pasos, ni en avisos. Quien los quiera los encuentra en Ajustes.

Todo lo que dependa de vouchers tiene que funcionar bien sin ellos. Por ejemplo, un cargo automático a tarjeta tiene que registrarse aunque nunca llegue un voucher (REC-08).

Los vouchers están en Ajustes → Avanzado → "Vouchers por correo", plegados. "¿Es una suscripción?", las preautorizaciones de Uber y Didi y las suscripciones de Apple solo aparecen cuando llegan movimientos por voucher, así que quien no los usa no las ve. Los cargos automáticos se registran con o sin vouchers (REC-08).

### PRI-03 · El historial entra por estados de cuenta

**Estado:** Falta

Con más historial el app da mejor contexto: gasto por mes, comparaciones, comercios frecuentes, recurrentes detectados. Por eso se invita a cargar estados de cuenta en la configuración inicial, y se puede hacer en cualquier momento desde Ajustes. Detalle en [importar-estados.md](importar-estados.md).

### PRI-04 · Borrar es borrar

**Estado:** Falta

Cuando una persona elimina información (un espacio, su cuenta de usuario), se borra de verdad y en ese momento, no se marca como oculta. Antes de borrar algo que no se puede recuperar, el app lo advierte con claridad. Detalle en [espacios.md](espacios.md).
