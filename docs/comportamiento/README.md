# Comportamiento de Kai Finance

Qué debe pasar en el app, regla por regla, con ejemplos que se pueden comprobar a mano. Es la fuente de verdad del *qué*: si el app hace algo distinto a lo que dice aquí, es un bug, algo por construir o la regla está desactualizada.

`CLAUDE.md` explica cómo está construido el app. Estos documentos explican qué tiene que pasar, sin depender de cómo esté hecho por dentro.

## Dominios

| Archivo | Qué cubre | Hecho | Parcial | Falta |
|---|---|---|---|---|
| [principios.md](principios.md) | Público general, manual primero, historial, borrar es borrar | 1 | 1 | 2 |
| [espacios.md](espacios.md) | Personal y compartidos, abandonar | 6 | | |
| [cuentas-y-saldos.md](cuentas-y-saldos.md) | Tipos de cuenta, saldos, efectivo, préstamos, CDP, inversiones, tarjetas (corte, pago, adicionales, pagos anticipados), patrimonio, metas | 30 | 2 | 6 |
| [movimientos.md](movimientos.md) | Tipos, cuenta y categoría obligatorias, mover entre espacios | 6 | | |
| [recurrentes.md](recurrentes.md) | Frecuencias, automático o manual, pagar, posponer, ignorar | 9 | | 1 |
| [categorias.md](categorias.md) | Categorías y subcategorías (solo clasifican) | 2 | | |
| [importar-estados.md](importar-estados.md) | Subir estados de cuenta del BAC en PDF | | | 7 |
| [presupuesto.md](presupuesto.md) | Partidas del mes: pagos fijos, topes, ahorro, salario, "Para gastar" | 8 | | |
| automatico.md | Vouchers, preautorizaciones, "¿Es una suscripción?", Apple | | | Por escribir |

En cuentas-y-saldos.md, CTA-08 (los aportes) quedó eliminada.

## Estado de cada regla

Cada regla dice debajo del título cómo está hoy el app:

| Estado | Significa |
|---|---|
| **Hecho** | El app ya se comporta así. Si al probarlo no coincide, es un bug |
| **Parcial** | Una parte existe. La línea **Hoy:** dice qué falta o qué es distinto |
| **Falta** | Todavía no existe |
| **Revisar** | Existe, pero choca con un principio y hay que replantearlo |
| **Eliminada** | Existió y ya no; el ID queda reservado |

## Qué falta, en orden sugerido

Hecho el 31 oct: el presupuesto por partidas (PPT), la base de cuentas y movimientos (Efectivo, cuenta y categoría siempre, qué puede hacer cada tipo de cuenta, aportes como Mover dinero entre espacios), quitar lo que era solo de Dani y Kimmy, recurrentes (pagar, posponer, ignorar, automáticos, personalizados) y abandonar espacios.

1. **Préstamos y CDP** con sus datos y cálculos (PRE-02 a PRE-04, CDP-01 a CDP-03, REC-10). Antes conviene contestar las preguntas 7 a 10 de cuentas-y-saldos.md.
2. **Importar estados de cuenta del BAC** (IMP). Hace falta un PDF de ejemplo de cada tipo (tarjeta y cuenta), con los datos sensibles tapados.
3. **Borrar la cuenta de usuario** (PRI-04) y el script de vouchers para cualquiera (PRI-01).
4. **Límites en subcategorías** (CAT-03), si se decide que sí.

## Cómo leer una regla

Cada regla tiene un ID (por ejemplo `CTA-04`), una frase que la explica, un ejemplo con números y, cuando hace falta, una tabla de variantes: los casos raros, que son donde suelen aparecer los bugs.

```
Dado     cómo está todo antes
Cuando   lo que hace la persona (o lo que llega del banco)
Entonces lo que se debe ver después
```

Al final de algunas reglas, una línea chica de **Dónde vive** dice qué parte del código la implementa. No hace falta leerla para entender la regla.

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

Para contestar una pregunta abierta, escribí la respuesta debajo de la pregunta. Claude la convierte en regla.

## IDs

| Prefijo | Tema |
|---|---|
| PRI | Principios |
| ESP | Espacios |
| CTA | Cuentas y saldos (no tarjetas) |
| PRE | Préstamos |
| CDP | Certificados de depósito |
| INV | Inversiones |
| TAR | Tarjetas de crédito |
| PAT | Patrimonio neto |
| MET | Metas |
| MOV | Movimientos |
| REC | Recurrentes |
| CAT | Categorías |
| PRS | Presupuesto como plan del mes (descartado; IDs reservados) |
| SOB | Sobres (descartado; IDs reservados) |
| PPT | Presupuesto: partidas del mes |
| IMP | Importar estados de cuenta |

Un ID no se reutiliza: si una regla se elimina, su número queda libre para siempre. Así un test o una nota que mencione `CTA-04` nunca apunta a otra cosa.
