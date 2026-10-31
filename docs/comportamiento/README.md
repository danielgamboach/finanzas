# Comportamiento de Kai Finance

Qué debe pasar en el app, regla por regla, con ejemplos que se pueden comprobar a mano. Es la fuente de verdad del *qué*: si el app hace algo distinto a lo que dice aquí, es un bug o la regla está desactualizada.

`CLAUDE.md` explica cómo está construido el app. Estos documentos explican qué tiene que pasar, sin depender de cómo esté hecho por dentro.

## Dominios

| Archivo | Qué cubre | Estado |
|---|---|---|
| [cuentas-y-saldos.md](cuentas-y-saldos.md) | Saldos, tarjetas, préstamos, patrimonio neto y metas | Primer borrador |
| movimientos.md | Crear, editar, eliminar, deshacer, tipos de movimiento | Por escribir |
| presupuesto.md | Gasto del mes, límites por categoría, "Disponible" | Por escribir |
| recurrentes.md | Próximos, pagos pendientes, variables, pago semanal de la tarjeta | Por escribir |
| categorizacion.md | Reglas, historial del comercio, IA, "Por revisar" | Por escribir |
| ingesta.md | Vouchers del BAC, preautorizaciones de Uber y Didi | Por escribir |
| suscripciones.md | "¿Es una suscripción?" y recibos de Apple | Por escribir |
| espacios.md | Personal y compartido, invitaciones, aportes | Por escribir |

## Cómo leer una regla

Cada regla tiene un ID (por ejemplo `CTA-04`), una frase que la explica, un ejemplo con números y, cuando hace falta, una tabla de variantes: los casos raros, que son donde suelen aparecer los bugs.

```
Dado     cómo está todo antes
Cuando   lo que hace la persona (o lo que llega del banco)
Entonces lo que se debe ver después
```

Al final de cada regla, una línea chica de **Dónde vive** dice qué parte del código la implementa. No hace falta leerla para entender la regla.

## Cómo cambiar algo

Se edita el archivo directo en GitHub (el lápiz arriba del archivo) o en cualquier editor de texto.

Cambiar una regla aquí **no cambia el app**. Si cambiás una regla para que el app se comporte distinto, dejá una marca debajo de la regla:

```
> Pendiente: cambiado por Dani el 31 oct. Antes decía que …
```

En la siguiente sesión de trabajo, Claude busca esas marcas, implementa el cambio y quita la marca.

Si algo del app no coincide con una regla y no sabés cuál de los dos está mal, dejá la marca como pregunta:

```
> Duda: en el app el saldo quedó en ¢1.650.000, la regla dice ¢1.700.000.
```

## Preguntas abiertas

Cada archivo termina con una sección de **Preguntas abiertas**: cosas que el app hace hoy de una forma que podría ser un bug o una decisión que nunca se tomó a propósito. Hay que contestarlas y convertirlas en regla.

## IDs

| Prefijo | Tema |
|---|---|
| CTA | Saldos de cuentas (no tarjetas) |
| PRE | Préstamos |
| TAR | Tarjetas de crédito |
| PAT | Patrimonio neto |
| MET | Metas |

Un ID no se reutiliza: si una regla se elimina, su número queda libre para siempre. Así un test o una nota que mencione `CTA-04` nunca apunta a otra cosa.
