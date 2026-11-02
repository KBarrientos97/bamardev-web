import type { Respuesta } from "./ayuda";

/**
 * Las respuestas de la Ayuda (IDEAS/11-CHATBOT-SOPORTE-GUIAS §0). Este archivo
 * es la fuente: se corrige acá y sale con el próximo deploy de la web.
 *
 * Nacieron el 02-nov-2026 de bamar/AYUDA/contenido (con lo que se verificó en
 * el código, sus dudas y las diferencias con PROD; ver AYUDA/HALLAZGOS.md) y
 * describen la web de `dev` 9f4f36b. Todavía no se recorrieron en
 * restaurantqa: lo que cambie al recorrerlas se corrige acá.
 *
 * Reglas para escribir: voseo y frases cortas; los rótulos en **negrita**
 * copiados de la pantalla; a lo sumo 5 pasos; nada que el código no confirme.
 */
export const RESPUESTAS: Respuesta[] = [
  {
    "id": "vender-anular",
    "titulo": "Anular una venta",
    "rama": "vender",
    "orden": 3,
    "frases": [
      "anular una venta",
      "cancelar una venta",
      "me equivoque de producto",
      "cobre mal",
      "devolucion del cliente",
      "borrar una venta",
      "vuelve el stock si anulo"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "En **Punto de venta** tocá **Ventas** y abrí la venta.",
          "Tocá **Anular venta**.",
          "Elegí el **Motivo**: **Devolución del cliente**, **Error al cobrar**, **Producto equivocado** u **Otro** (ahí tenés que contar por qué).",
          "El encargado escribe su **Usuario que autoriza** y su **PIN de autorización**. Si vos sos encargado, sólo te pide tu PIN.",
          "Tocá **Anular**. La venta queda **Anulada** y el stock vuelve al inventario."
        ]
      }
    ],
    "celular": [
      "En **Punto de Venta** tocá el botón del historial (arriba, al lado del título) y abrí la venta.",
      "Tocá **Anular venta** y después **Sí, anular** (te avisa «¿Anular venta? Se revertirá el stock.»).",
      "El encargado escribe **Usuario del encargado** y **PIN** y toca **Autorizar y anular**. Si sos encargado: **Tu PIN** y **Confirmar y anular**.",
      "En la app sólo se anulan ventas cobradas en efectivo. Las de QR o mixto dicen «Por seguridad, solo las ventas en efectivo se pueden anular.»: anulalas desde la computadora."
    ],
    "importante": "no se puede deshacer, y el PIN se pide siempre, también al dueño. La plata vuelve por donde entró: lo cobrado en efectivo sale de la caja (la anulación ya lo descuenta del turno) y lo cobrado por QR lo devolvés por QR o transferencia desde la cuenta del negocio.",
    "siNoAparece": "si no ves **Anular venta**, tu usuario no tiene permiso para anular: consultalo con tu encargado. Desde acá se ven sólo las ventas del turno abierto.",
    "relacionados": [
      "vender-cobrar",
      "vender-qr-llego",
      "vender-comprobante"
    ]
  },
  {
    "id": "vender-cobrar-mesa",
    "titulo": "Cobrar una mesa en caja",
    "rama": "vender",
    "orden": 6,
    "frases": [
      "cobrar una mesa",
      "la mesa pidio la cuenta",
      "mesas por cobrar",
      "el mesero mando la cuenta",
      "donde cobro la mesa 4",
      "propina del mesero"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "El mesero toca **Pedir la cuenta · pasar a caja** en la mesa.",
          "En **Punto de venta** aparece el aviso «1 mesa esperando cobro»: tocalo, o tocá el botón **Mesas** (con el número) de arriba.",
          "En **Mesas por cobrar** tocá la mesa: ves su código, el mesero y el total.",
          "Cobrá como una venta (**Efectivo**, **QR** o **Mixto**). Si el cliente deja propina, anotala en **Propina (opcional)**: va al turno del mesero, no al cajón. Tocá **Confirmar cobro**.",
          "Cuando el cliente se va, el mesero toca **Levantar y liberar la mesa**."
        ]
      }
    ],
    "celular": [
      "En **Punto de Venta** tocá el aviso de la mesa esperando cobro.",
      "En **Mesas por cobrar** tocá la mesa.",
      "Cobrá como siempre; la propina va en **Propina para el mesero**. Tocá **Confirmar venta**."
    ],
    "importante": "no cargás nada: el total es lo que pidió el mesero. Si el mesero le suma algo mientras cobrás, el sistema te avisa que la cuenta cambió y te muestra el total nuevo para cobrar de nuevo.",
    "siNoAparece": "el aviso y el botón **Mesas** salen sólo cuando hay una cuenta esperando. Si el mesero no puede pedir la cuenta, todavía falta llevar a la mesa algún pedido. Si nunca ves mesas por cobrar, tu usuario no tiene permiso para cobrar mesas: consultalo con tu encargado.",
    "relacionados": [
      "vender-cobrar",
      "vender-qr-llego",
      "vender-mesa-llevar"
    ]
  },
  {
    "id": "vender-cobrar",
    "titulo": "Hacer una venta y cobrar",
    "rama": "vender",
    "orden": 1,
    "frases": [
      "como cobro",
      "hacer una venta",
      "registrar una venta",
      "cobrar en efectivo",
      "cuanto le doy de cambio",
      "calcular el cambio",
      "cobrar una parte con qr y otra en efectivo",
      "pago mixto"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Punto de venta** y tocá los productos para sumarlos a la venta. Con los botones de más y menos de cada línea cambiás la cantidad.",
          "Tocá **Cobrar** (el botón lleva el total). En el celular o la tablet, primero tocá el botón del carrito que aparece abajo.",
          "Elegí **Efectivo** y escribí lo que te dio el cliente en **Efectivo recibido**, o tocá uno de los montos sugeridos.",
          "Mirá el **Cambio** que tenés que devolver. Si dice **Falta**, lo recibido no alcanza.",
          "Tocá **Confirmar cobro**. Se abre el recibo y seguís con **Nueva venta**."
        ]
      }
    ],
    "celular": [
      "En **Punto de Venta** tocá los productos y después el botón del pedido que aparece abajo, con el total.",
      "Dejá elegido **En local** y tocá **Cobrar** (con el total).",
      "Elegí **Efectivo** y escribí el **EFECTIVO RECIBIDO**, o tocá un monto sugerido. Abajo te dice **Cambio a entregar**.",
      "Tocá **Confirmar venta**."
    ],
    "importante": "si paga todo por QR, elegí **QR**. Si paga una parte por QR y el resto en efectivo, elegí **Mixto** y poné el **Monto pagado por QR** (en el celular, **MONTO POR QR**): el sistema te dice cuánto falta en efectivo. En los dos casos tocá **Confirmar pago recibido** recién cuando veas la plata en tu banco.",
    "siNoAparece": "si te pide abrir la caja, abrila primero. Si no ves **Punto de venta**, tu usuario no tiene permiso para vender: consultalo con tu encargado. Si no ves **QR** ni **Mixto**, tu plan no incluye el cobro por QR o el negocio no tiene cargada esa forma de pago.",
    "relacionados": [
      "vender-qr-llego",
      "vender-comprobante",
      "vender-mesa-llevar",
      "vender-anular"
    ]
  },
  {
    "id": "vender-comprobante",
    "titulo": "Enviar o imprimir el comprobante",
    "rama": "vender",
    "orden": 4,
    "frases": [
      "mandar el recibo por whatsapp",
      "imprimir el ticket",
      "compartir el comprobante",
      "reimprimir un recibo",
      "el cliente quiere su recibo",
      "volver a ver el ticket de una venta"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Apenas cobrás, en **Venta registrada** tocá **Compartir**: arma una imagen del recibo para mandarla por la app que elijas.",
          "Para papel, tocá **Imprimir**: usa la impresora del equipo.",
          "Si el equipo no puede compartir, la imagen se descarga sola para que la adjuntes vos.",
          "Para una venta anterior del turno: **Ventas** → tocá la venta → **Ver comprobante** → **Compartir** o **Imprimir**."
        ]
      }
    ],
    "celular": [
      "Al confirmar la venta se abre **Venta completada**.",
      "Tocá el botón de arriba (**Compartir recibo**) para mandar el recibo como imagen.",
      "Tocá **Imprimir** para sacarlo por el servicio de impresión del celular, y **Nueva venta** para seguir."
    ],
    "importante": "si tu local usa número de ticket, el botón grande dice **Imprimir recibo y comanda** (desde **Ver comprobante**, **Imprimir recibo**).",
    "siNoAparece": "si en la computadora no ves **Compartir** ni **Imprimir**, tu plan no incluye el comprobante: consultalo con el administrador. Un pedido de delivery o para recoger muestra **Ver comprobante** recién cuando ya está pagado o entregado.",
    "relacionados": [
      "vender-cobrar",
      "vender-anular",
      "vender-delivery"
    ]
  },
  {
    "id": "vender-delivery",
    "titulo": "Mandar un pedido a domicilio",
    "rama": "vender",
    "orden": 7,
    "frases": [
      "hacer un delivery",
      "pedido a domicilio",
      "mandar con el repartidor",
      "asignar repartidor",
      "cobra el repartidor",
      "tarifa de envio",
      "pedido por telefono para llevar a la casa"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Cargá los productos y tocá **Delivery**, arriba (se activa cuando hay algo en la venta).",
          "En **Datos de entrega** completá **Nombre del cliente**, **Dirección de entrega** y **Teléfono**, y elegí el **Repartidor**.",
          "Revisá la **Tarifa de envío** (viene en Bs 8) y, si hace falta, escribí una **Nota del pedido**.",
          "Si el cliente paga ahora, tocá **Cobrar ahora en caja** y cobrá como siempre. Si paga al recibir, tocá **Cobra el repartidor al entregar**: sale **Pedido registrado** con lo que tiene que cobrar.",
          "Lo seguís en **Ventas**, en **Pedidos pendientes**."
        ]
      }
    ],
    "celular": [
      "En el pedido elegí **Delivery** y tocá **Continuar**.",
      "En **Datos de entrega** completá **Nombre**, **Dirección de entrega** y el teléfono, elegí en **Asignar repartidor** y la **Tarifa de envío**.",
      "En **¿Quién cobra el pedido?** elegí **Pago contra entrega** o **Cobrar ahora en caja**.",
      "Tocá **Enviar pedido al repartidor**, o **Cobrar ahora** y cobrá como siempre."
    ],
    "importante": "la tarifa de envío no entra a la caja: se la cobra y se la queda el repartidor. Si cobrás en caja, cobrás sólo los productos.",
    "siNoAparece": "si no ves **Delivery**, tu plan no incluye pedidos a domicilio: consultalo con el administrador. Si no hay repartidores para elegir, el administrador tiene que crear uno en Usuarios.",
    "relacionados": [
      "vender-cobrar",
      "vender-comprobante",
      "vender-mesa-llevar"
    ]
  },
  {
    "id": "vender-mesa-llevar",
    "titulo": "Marcar platos para la mesa o para llevar",
    "rama": "vender",
    "orden": 5,
    "frases": [
      "para llevar",
      "comer aca o llevar",
      "marcar para llevar",
      "un plato en mesa y otro para llevar",
      "la cocina no sabe que es para llevar",
      "todo para llevar"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Cargá los productos en la venta.",
          "Si todo el pedido va igual, tocá **Todo en mesa** o **Todo para llevar**, arriba de la lista.",
          "Para un plato solo, tocá su etiqueta **Mesa** o **Llevar**, debajo del nombre: cambia de una a otra.",
          "Si la línea tiene varias unidades, tocá la etiqueta, poné cuántas van **en mesa** con los botones de más y menos, y tocá **Aplicar**. El resto sale para llevar y la línea dice, por ejemplo, «2 mesa · 1 llevar».",
          "Cobrá como siempre: el ticket marca cada plato."
        ]
      }
    ],
    "celular": [
      "Abrí el pedido con el botón de abajo y dejá elegido **En local**.",
      "En **Todo el pedido:** tocá **Mesa** o **Llevar**.",
      "Para un plato, tocá su **Mesa** o **Llevar**. Si tiene varias unidades, tocá el botón para repartir de esa línea y ajustá **Para mesa** con menos y más: al lado te dice cuántas van para llevar."
    ],
    "importante": "en un delivery o un pedido para recoger todo va para llevar: no hay que marcar nada.",
    "siNoAparece": "si no ves **Todo en mesa** ni las etiquetas **Mesa** / **Llevar**, tu plan no incluye esta opción: consultalo con el administrador.",
    "relacionados": [
      "vender-cobrar",
      "vender-cobrar-mesa",
      "vender-delivery"
    ]
  },
  {
    "id": "vender-qr-llego",
    "titulo": "Cobrar con QR y saber si el pago llegó",
    "rama": "vender",
    "orden": 2,
    "frases": [
      "cobrar con qr",
      "como se si llego el qr",
      "el cliente dice que ya pago",
      "pago por transferencia",
      "confirmar pago qr",
      "no me deja cobrar con qr",
      "donde esta el qr del negocio"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "En el cobro elegí **QR**: aparece el QR del negocio y el monto a cobrar. Tocalo para agrandarlo.",
          "Mostrale el QR al cliente para que lo escanee y transfiera.",
          "Abrí la app de tu banco y fijate que haya entrado el pago por ese monto.",
          "Recién ahí tocá **Confirmar pago recibido**: cambia a **Pago confirmado**.",
          "Tocá **Confirmar cobro**. Si no confirmaste el pago, te avisa «Confirmá que el pago por QR llegó antes de cobrar.»"
        ]
      }
    ],
    "celular": [
      "En **Cobrar** elegí **QR** y mostrale el código al cliente (tocalo para ampliarlo).",
      "Revisá en tu banco que el pago haya entrado.",
      "Tocá **Confirmar pago recibido** (pasa a **Pago confirmado**) y después **Confirmar venta**, que hasta entonces queda apagado."
    ],
    "importante": "el sistema no ve tu cuenta del banco. Confirmar el pago es decir que vos ya viste la plata. Si cambiás de método o el monto del QR, hay que confirmarlo otra vez.",
    "siNoAparece": "si no está el botón **QR**, tu plan no incluye el cobro por QR. Si sale «Todavía no hay QR del negocio», lo tiene que cargar el administrador desde **QR de cobro**.",
    "relacionados": [
      "vender-cobrar",
      "vender-anular",
      "vender-comprobante"
    ]
  },
  {
    "id": "vender-sin-internet",
    "titulo": "Se cortó el internet: ¿se pierde la venta?",
    "rama": "vender",
    "orden": 8,
    "frases": [
      "se corto el internet",
      "no hay internet",
      "vender sin internet",
      "sin señal",
      "se pierde la venta",
      "sin sincronizar",
      "ventas sin subir",
      "no me deja cerrar la caja sin internet"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "En la computadora no se cobra sin internet: sale «Sin internet. Revisá la conexión del local.» y la venta queda armada en pantalla.",
          "Cuando vuelva la conexión, tocá de nuevo **Confirmar cobro**. Si la venta ya había entrado, no se duplica.",
          "En la app instalada en un iPhone o iPad sí podés seguir cobrando: el recibo dice **Venta guardada sin internet** y arriba ves cuántas ventas faltan subir.",
          "Se suben solas cuando vuelve la conexión, con la app abierta. Para apurarlo, tocá **Sincronizar**.",
          "La caja no se cierra con ventas sin subir: el botón dice **Subí las ventas sin internet para cerrar**."
        ]
      }
    ],
    "celular": [
      "Seguí vendiendo normal: la venta se guarda en el celular y el recibo dice **SIN SINCRONIZAR**.",
      "En **Punto de Venta** y en el historial te avisa cuántas ventas cobradas sin internet faltan subir.",
      "Se suben solas cuando vuelve la señal. Si querés apurarlo, en el historial tocá **Sincronizar**.",
      "Con ventas sin subir no te deja cerrar la caja: esperá a que vuelva la conexión."
    ],
    "importante": "si el sistema no acepta alguna venta cobrada sin internet, te avisa en rojo. Esa plata está en la caja pero la venta no quedó registrada: volvé a cargarla a mano.",
    "siNoAparece": "que la computadora no venda sin internet es lo normal. Sin señal venden sólo la app de Android y la app instalada en un iPhone o iPad.",
    "relacionados": [
      "vender-cobrar",
      "vender-comprobante"
    ]
  },
  {
    "id": "caja-abrir",
    "titulo": "Abrir la caja",
    "rama": "caja",
    "orden": 1,
    "frases": [
      "abrir caja",
      "abrir la caja",
      "empezar el turno",
      "aperturar caja",
      "monto de apertura",
      "fondo de caja",
      "con cuanto abro la caja",
      "cambio para empezar",
      "no me deja vender"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Punto de venta**. Si la caja está cerrada, te aparece **Abrir caja**.",
          "Si sos el dueño y el negocio tiene más de un local, elegí primero la **Sucursal**: de ahí sale el stock y los precios de todo el turno. Si sos cajero no se elige: abajo dice en qué local abrís.",
          "Escribí el **Monto de apertura** o tocá un monto rápido (Bs 50, 100 o 200). Para no sumar de cabeza, abrí **Contar por denominación** y cargá cuántos billetes y monedas tenés de cada uno: el total pasa solo al monto.",
          "Si querés, escribí una **Nota (opcional)**, por ejemplo \"turno mañana\".",
          "Tocá **Abrir caja y empezar a vender**."
        ]
      }
    ],
    "celular": [
      "Menú → **Ventas**. Con la caja cerrada aparece **Apertura de caja**.",
      "Si sos el dueño y hay más de un local, elegí la **SUCURSAL**.",
      "Escribí el **SALDO INICIAL EN CAJA**, o contalo en **Contar billetes y monedas** (el total pasa solo).",
      "Si querés, escribí una **NOTA DE APERTURA (OPCIONAL)**.",
      "Tocá **Aperturar caja con Bs …**."
    ],
    "importante": "contá bien el fondo. Al cerrar, el sistema espera encontrar este monto más todo lo que entró en efectivo durante el turno. Abrir con Bs 0 también vale.",
    "siNoAparece": "abrir la caja pide el permiso \"Operar su caja\". Los meseros y los repartidores no abren caja: la plata de sus mesas y entregas la cobra el cajero. Si dice \"Ya tienes una caja abierta. Ciérrala antes de abrir otra.\", ya tenés un turno abierto: seguí vendiendo en ése o cerralo primero.",
    "relacionados": [
      "caja-movimiento",
      "caja-cerrar"
    ]
  },
  {
    "id": "caja-cerrar",
    "titulo": "Cerrar la caja y contar la plata",
    "rama": "caja",
    "orden": 3,
    "frases": [
      "cerrar caja",
      "cerrar la caja",
      "cierre de caja",
      "arqueo",
      "hacer el arqueo",
      "terminar el turno",
      "contar la plata",
      "cuadrar la caja"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "En **Punto de venta**, tocá **Cerrar caja** (también está en **Ventas**). Arriba ves el **Efectivo esperado en caja**. Si aparece **En poder de meseros**, tocá **Recibir** para que te entreguen esa plata.",
          "Contá el cajón con **Contar billete por billete**, o escribí el total en **Efectivo contado**. El campo arranca vacío: escribí lo que contaste, no lo que dice el sistema.",
          "Mirá el resultado: **La caja cuadra**, **Sobrante** o **Faltante**. Si hay diferencia, explicala en **Nota del cierre (opcional)**.",
          "Tocá **Cerrar caja**. Te pregunta **¿Cerrar la caja?** con lo que contaste y lo que se esperaba. Si está bien, tocá **Sí, cerrar caja**.",
          "Queda el comprobante **Caja cerrada**, con el turno, las ventas y la **Diferencia**. Tocá **Volver**."
        ]
      }
    ],
    "celular": [
      "Menú → **Ventas** → ícono de la hoja (**Historial del día**) → **Cierre**.",
      "Revisá **RESUMEN DE CAJA (EFECTIVO)** y el **Saldo esperado en caja**. Si aparece **En poder de meseros**, tocá esa fila para recibir la plata.",
      "Contá el efectivo y escribilo en **CONTEO FÍSICO** (arranca vacío).",
      "Vas a ver **✓ CUADRA PERFECTO**, **⚠ SOBRANTE** o **⚠ FALTANTE**. Si hay diferencia, anotá la razón en **OBSERVACIÓN (RECOMENDADA)**.",
      "Tocá **Cerrar caja** y después **Sí, cerrar caja**."
    ],
    "importante": "cerrar no tiene vuelta atrás. Después de cerrar no se pueden registrar más ventas en ese turno, y la diferencia queda guardada tal cual.",
    "siNoAparece": "cerrar la caja pide el permiso \"Operar su caja\". Los meseros no cierran caja: cierran su turno en **Mi turno** → **Cerrar mi turno**. Si el botón no te deja, mirá \"No me deja cerrar la caja\".",
    "relacionados": [
      "caja-me-sobro",
      "caja-me-falto",
      "caja-no-deja-cerrar",
      "caja-ver-cierres"
    ]
  },
  {
    "id": "caja-me-falto",
    "titulo": "Me faltó plata al cerrar la caja",
    "rama": "caja",
    "orden": 5,
    "frases": [
      "me falta plata",
      "falta dinero en la caja",
      "hay de menos",
      "faltante",
      "faltante en caja",
      "la caja no cuadra",
      "me falto al cerrar",
      "no me alcanza la plata"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Volvé a contar con calma, con **Contar billete por billete**. Si te perdiste, tocá **Limpiar conteo** y empezá de nuevo.",
          "Escribí en **Efectivo contado** lo que contaste, tal cual, aunque no cuadre. El campo arranca vacío a propósito: el sistema no te acomoda el número.",
          "Buscá la causa. Las más comunes: un cobro por QR que se marcó como efectivo, plata que salió del cajón (un pago al proveedor, una compra) sin registrarla, o un vuelto de más. Si fue una salida y tenés el permiso, registrala ahora con **Registrar movimiento de efectivo**: el esperado se recalcula.",
          "Anotá lo que pasó en **Nota del cierre (opcional)**, por ejemplo \"pagué Bs 30 de hielo y no lo anoté\".",
          "Cerrá la caja. El **Faltante** queda guardado y el dueño lo ve en **Reportes** → **Cierres de caja**."
        ]
      }
    ],
    "celular": [
      "Volvé a contar y escribí en **CONTEO FÍSICO** lo que contaste, tal cual (arranca vacío).",
      "Si fue una salida sin registrar, cargala con el ícono de las flechas (**Movimiento de caja**) de arriba.",
      "Con **⚠ FALTANTE**, escribí la razón en **OBSERVACIÓN (RECOMENDADA)** y cerrá con **Cerrar caja** → **Sí, cerrar caja**."
    ],
    "importante": "la plata que tiene un mesero no es un faltante: sale aparte en **En poder de meseros** y ya está descontada de lo esperado. Si querés que entre a la caja, recibila antes de contar.",
    "siNoAparece": "**Registrar movimiento de efectivo** sólo aparece con el permiso \"Ingresos y egresos de caja\"; si no lo tenés, pedile al encargado que lo registre. Qué hacer con lo que falta: consultalo con tu encargado.",
    "relacionados": [
      "caja-cerrar",
      "caja-me-sobro",
      "caja-movimiento",
      "caja-ver-cierres"
    ]
  },
  {
    "id": "caja-me-sobro",
    "titulo": "Me sobró plata al cerrar la caja",
    "rama": "caja",
    "orden": 4,
    "frases": [
      "me sobro plata",
      "sobra dinero en la caja",
      "hay de mas",
      "tengo mas plata",
      "sobrante",
      "sobrante en caja",
      "la caja no cuadra",
      "me sobra al cerrar"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Volvé a contar con calma, con **Contar billete por billete**. Si te perdiste, tocá **Limpiar conteo** y empezá de nuevo.",
          "Escribí en **Efectivo contado** lo que contaste, tal cual, aunque no cuadre. El campo arranca vacío a propósito: el sistema no te acomoda el número, así la diferencia real queda a la vista.",
          "Buscá la causa. Las más comunes: un cobro en efectivo que se marcó como QR, un vuelto que no se dio, o una venta que no se cargó. Para revisar lo vendido, tocá **Ver qué salió del mostrador**.",
          "Anotá lo que pasó en **Nota del cierre (opcional)**, por ejemplo \"el cliente no esperó su vuelto de Bs 5\".",
          "Cerrá la caja. El **Sobrante** queda guardado y el dueño lo ve en **Reportes** → **Cierres de caja**."
        ]
      }
    ],
    "celular": [
      "Volvé a contar y escribí en **CONTEO FÍSICO** lo que contaste, tal cual (arranca vacío).",
      "Con **⚠ SOBRANTE**, revisá lo vendido en **Ver productos vendidos**. Si al cerrar te aparece **Hay ventas que el servidor rechazó**, ésa puede ser la plata que sobra: está en la caja pero no quedó registrada. Anotala.",
      "Escribí la razón en **OBSERVACIÓN (RECOMENDADA)** y cerrá con **Cerrar caja** → **Sí, cerrar caja**."
    ],
    "importante": "no \"acomodes\" el conteo para que cuadre. Qué hacer con la plata que sobra: consultalo con tu encargado.",
    "siNoAparece": "**Reportes** lo ve el dueño o el encargado. Vos te quedás con el comprobante **Caja cerrada**, que muestra la diferencia y tu nota.",
    "relacionados": [
      "caja-cerrar",
      "caja-me-falto",
      "caja-ver-cierres"
    ]
  },
  {
    "id": "caja-movimiento",
    "titulo": "Sacar o meter plata de la caja sin una venta",
    "rama": "caja",
    "orden": 2,
    "frases": [
      "sacar plata de la caja",
      "meter plata a la caja",
      "registrar un gasto",
      "pago a proveedor",
      "compra de hielo",
      "ingreso de sencillo",
      "traje cambio",
      "retiro de efectivo",
      "movimiento de caja",
      "egreso de caja"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "En **Punto de venta**, tocá **Cerrar caja**. Entrar no cierra nada: la caja se cierra recién con el botón de abajo.",
          "Tocá **Registrar movimiento de efectivo**.",
          "Elegí el **Motivo**: **Sencillo** (entra plata), **Devolución**, **Pago a proveedor** o **Retiro** (sale plata). Para un gasto como el hielo o el gas, elegí **Otro**, en **Tipo** marcá \"Egreso — sale plata de la caja\" y escribí la **Descripción**.",
          "Escribí el **Monto** y tocá **Registrar**. No se puede sacar más plata de la que hay: si pasa, te avisa cuánto hay disponible.",
          "El **Efectivo esperado en caja** se recalcula solo. Volvé a vender con la flecha de arriba."
        ]
      }
    ],
    "celular": [
      "Menú → **Ventas** → ícono de la hoja (**Historial del día**).",
      "Tocá el ícono de las flechas (**Movimiento de caja**). También está arriba en **Cierre de caja**.",
      "Elegí el **MOTIVO**: **Ingreso de sencillo**, **Devolución**, **Pago a proveedor**, **Retiro** u **Otro**. Con **Otro** elegís **Ingreso** o **Egreso** y escribís la **DESCRIPCIÓN**.",
      "Escribí el **MONTO** y tocá **Registrar movimiento**."
    ],
    "importante": "un gasto cargado en **Gastos** no saca plata de la caja. Si la plata salió del cajón, registrala también acá; si no, al cerrar te va a faltar.",
    "siNoAparece": "hace falta el permiso \"Ingresos y egresos de caja\" y que tu plan lo incluya. Un cajero no lo tiene de entrada: lo registra el encargado o el dueño, o pediles que te den el permiso.",
    "relacionados": [
      "caja-cerrar",
      "caja-me-falto"
    ]
  },
  {
    "id": "caja-no-deja-cerrar",
    "titulo": "No me deja cerrar la caja",
    "rama": "caja",
    "orden": 6,
    "frases": [
      "no me deja cerrar la caja",
      "no puedo cerrar caja",
      "el boton cerrar caja no funciona",
      "ventas sin sincronizar",
      "ventas sin subir",
      "error al cerrar caja",
      "no cierra la caja",
      "mesas abiertas"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "El botón dice **Subí las ventas sin internet para cerrar**, o sale \"No se puede cerrar caja: hay … sin sincronizar. Esperá a que vuelva la conexión.\": hay ventas cobradas sin internet que todavía no subieron. Suben solas cuando vuelve la conexión; recién ahí se cierra.",
          "Sale \"Contá el efectivo que hay en la caja.\": el **Efectivo contado** está vacío. Escribí lo que contaste (si no hay nada, 0).",
          "El botón queda apagado con \"Calculando el arqueo…\" o sale un error arriba: el resumen del turno no cargó. Tocá **Reintentar**.",
          "Sale \"La caja ya está cerrada\": ya la cerró alguien (otro equipo o el encargado). Para seguir vendiendo, abrí una caja nueva.",
          "Las mesas sin cobrar y la plata de los meseros no frenan el cierre. Lo que tienen los meseros sale en **En poder de meseros**; tocá **Recibir** si querés que entre antes de contar."
        ]
      }
    ],
    "celular": [
      "\"No se puede cerrar caja: hay … venta(s) sin sincronizar. Esperá a que vuelva la conexión.\", o \"Verificando si quedan ventas sin sincronizar. Probá de nuevo en un momento.\": esperá la conexión y volvé a intentar.",
      "\"Cuenta el efectivo que hay en la caja e ingresa el total.\": escribí lo contado en **CONTEO FÍSICO**.",
      "\"Todavía no cargó el resumen del turno. Esperá o reintentá antes de cerrar.\": salí y volvé a entrar al cierre.",
      "Si aparece **Hay ventas que el servidor rechazó**, no te frena: anotá esas ventas, cargalas de nuevo a mano y tocá **Entendido, cerrar caja**."
    ],
    "importante": "si sos mesero, lo que cerrás es tu turno (**Mi turno** → **Cerrar mi turno**), y ése sí se frena con \"Todavía tenés mesas a tu nombre: … Cerralas o pasáselas a otro mesero antes de terminar tu turno.\" o con \"Todavía tenés Bs … en efectivo sin entregar. Llevalos a caja y esperá que te los aprueben antes de terminar tu turno.\"",
    "siNoAparece": "si no ves **Cerrar caja**, tu usuario no tiene el permiso \"Operar su caja\": pedíselo al dueño.",
    "relacionados": [
      "caja-cerrar",
      "caja-me-falto"
    ]
  },
  {
    "id": "caja-ver-cierres",
    "titulo": "¿Dónde veo los cierres anteriores y sus diferencias?",
    "rama": "caja",
    "orden": 7,
    "frases": [
      "ver cierres anteriores",
      "historial de cierres",
      "cierres de caja",
      "ver arqueos",
      "diferencias de caja",
      "quien cerro con faltante",
      "comprobante del cierre",
      "cierre de ayer"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "reportes",
    "destino": "/reportes/cierres",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Reportes** → **Cierres de caja** y elegí el período.",
          "Arriba ves **Cierres**, **Cuadraron**, **Faltantes** y **Sobrantes**. Abajo, cada turno con el cajero, lo esperado, lo contado y la diferencia: **Cuadra**, faltante en rojo o sobrante en azul.",
          "Tocá un turno para abrir su **Arqueo del turno**: **Abrió**, **Cerró**, **Fondo de apertura**, **Ventas en efectivo**, **Efectivo esperado** y **Efectivo contado**.",
          "Desde ahí, **Productos vendidos** te muestra qué se vendió en ese turno."
        ]
      }
    ],
    "celular": [
      "Menú → **Reportes** → **Cierres de caja**.",
      "En **Historial de cierres** tocá un turno para abrir su **Arqueo de caja**: **Saldo de apertura**, **Esperado en caja**, **Conteo físico** y la **DIFERENCIA** (**Cuadró perfecto**, **Sobrante** o **Faltante**).",
      "Desde ahí, **Ver productos vendidos** muestra qué salió en ese turno."
    ],
    "importante": "el comprobante del cierre (**Caja cerrada**) aparece una sola vez, al cerrar: trae el turno, lo vendido, el efectivo esperado, lo contado, la **Diferencia** y la nota. Después, en **Cierres de caja**, se ve la diferencia pero no la nota.",
    "siNoAparece": "**Reportes** lo ve quien tiene permiso de ver reportes (el dueño o el encargado). Un cajero no lo tiene de entrada: lo suyo es el comprobante que sale al cerrar. Un turno entra en el período en que se cerró y va a nombre de quien abrió la caja; las cajas que siguen abiertas no aparecen.",
    "relacionados": [
      "caja-cerrar",
      "caja-me-sobro",
      "caja-me-falto"
    ]
  },
  {
    "id": "reportes-cuanto-vendi",
    "titulo": "¿Cuánto vendí hoy?",
    "rama": "reportes",
    "orden": 1,
    "frases": [
      "cuanto vendi hoy",
      "cuanto vendimos",
      "ventas de hoy",
      "cuanto entro hoy",
      "total del dia",
      "cuanto se vendio",
      "resumen del dia",
      "mandar el resumen por whatsapp"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "reportes",
    "destino": "/reportes",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Reportes**: se abre en **Resumen**.",
          "Arriba, en el período, tocá **Hoy** (la pantalla arranca en **Este mes**).",
          "El número grande es **Ventas de hoy**, comparado con ayer. Debajo se parte en Salón, Delivery, Para recoger y Mostrador (sólo las que tuvieron ventas).",
          "Más abajo tenés **Tickets**, **Ticket prom.** y **Unidades**. Para ver venta por venta, abrí **Ventas**.",
          "Para mandarlo al celular del dueño o del encargado, tocá **Enviar resumen**."
        ]
      }
    ],
    "celular": [
      "Menú → **Reportes**.",
      "En **Período:** tocá **Hoy**.",
      "Arriba sale **VENTAS DE HOY**; más abajo, en **Reportes detallados**, abrí el que necesites."
    ],
    "importante": "las ventas anuladas no suman. Lo fiado sí suma, porque la venta ya se hizo. El envío y la propina no son parte de la venta. Para ver exactamente qué entra, tocá **Cómo se calcula**.",
    "siNoAparece": "**Reportes** lo ve el administrador o un rol con permiso de reportes. Si tu rol no lo tiene, pedíselo al administrador.",
    "relacionados": [
      "reportes-estoy-ganando",
      "reportes-quien-anulo"
    ]
  },
  {
    "id": "reportes-estoy-ganando",
    "titulo": "¿Estoy ganando plata?",
    "rama": "reportes",
    "orden": 2,
    "frases": [
      "estoy ganando plata",
      "cuanto gane",
      "ganancia del mes",
      "estoy perdiendo",
      "utilidad",
      "estado de resultado",
      "cuanto me queda",
      "el negocio da plata",
      "punto de equilibrio"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "reportes",
    "destino": "/reportes/resultado",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Reportes** → **Estado de resultado** (en el grupo Plata).",
          "Dejá el período en **Este mes**: el alquiler, los sueldos y la luz se pagan por mes.",
          "En **Cómo se llega al resultado** leé de arriba abajo: **Ventas**, menos **Costo de lo vendido**, da la **Ganancia de la comida**; menos los **Gastos del local**, da el **Resultado del local**. Tocá cualquier línea para ver de dónde sale.",
          "Al final está la **Ganancia líquida** del período (o la **Pérdida**, si no alcanzó).",
          "Para saber cuánto tenés que vender para no perder, abrí **Punto de equilibrio**."
        ]
      }
    ],
    "celular": [
      "Menú → **Reportes** → **Finanzas** → **Estado de Resultado**.",
      "Elegí el período.",
      "Leé **LO QUE DEJA LA COMIDA** (ventas menos costo = **Utilidad bruta**), después **GASTOS OPERATIVOS** y **Utilidad operativa**, y al final **UTILIDAD NETA** o **PÉRDIDA DEL PERÍODO**."
    ],
    "importante": "el número sirve si cargaste dos cosas: el costo de cada plato (un plato sin costo figura como 100 % de ganancia) y los gastos del local en **Gastos operativos** (cuentan aunque todavía no los hayas pagado). Lo que comprás para stock no resta: el costo entra recién cuando se vende.",
    "siNoAparece": "lo ve el administrador. Hace falta que el plan traiga los reportes de rentabilidad y que tu rol también vea **Gastos operativos**.",
    "relacionados": [
      "reportes-cuanto-vendi"
    ]
  },
  {
    "id": "reportes-quien-anulo",
    "titulo": "¿Quién anuló o hizo descuentos?",
    "rama": "reportes",
    "orden": 3,
    "frases": [
      "quien anulo",
      "quien anulo una venta",
      "ventas anuladas",
      "quien hizo descuento",
      "descuentos del dia",
      "controlar al cajero",
      "controlar a los meseros",
      "plata regalada",
      "quien autorizo la anulacion"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "reportes",
    "destino": "/reportes/descuentos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Reportes** → **Descuentos y anulaciones** (en el grupo Plata) y elegí el período, por ejemplo **Hoy** o **Semana**.",
          "Arriba ves **Descuentos y promos**, **Anulaciones** y el **Total**. En **Por cajero**, lo de cada uno, a nombre de quien vendió.",
          "En **Últimas anulaciones**, cada venta anulada dice quién la autorizó (\"Autorizó …\").",
          "Para ver persona por persona, abrí **Ventas por cajero** (grupo Operación): cuánto vendió cada uno, sus **Anulaciones**, sus **Descuentos** y cómo le quedó la caja.",
          "Si atendés con mesas, abrí **Ventas por mesero** (grupo Restaurante): qué vendió y qué anuló cada mesero."
        ]
      }
    ],
    "celular": [
      "Menú → **Reportes** → **Descuentos y anulaciones**.",
      "Bajá hasta **Últimas anulaciones**.",
      "Por persona: **Cierres de caja** → **Performance por cajero**, o **Ventas por mesero**."
    ],
    "importante": "una anulación cuenta el día de la venta y va a nombre de quien vendió; quién la autorizó figura aparte. Los precios no se pueden bajar a mano: los descuentos que ves son de promociones y cupones.",
    "siNoAparece": "lo ve el administrador, con los reportes de operación en el plan. **Ventas por mesero** sólo aparece si el negocio atiende mesas (salón).",
    "relacionados": [
      "reportes-cuanto-vendi",
      "caja-ver-cierres"
    ]
  },
  {
    "id": "productos-cargar",
    "titulo": "Cargar un producto o un plato",
    "rama": "productos",
    "orden": 1,
    "frases": [
      "cargar un producto",
      "agregar un plato",
      "crear un producto nuevo",
      "poner un producto en el menu",
      "dar de alta una gaseosa",
      "ponerle icono al producto"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "productos",
    "destino": "/inventario/productos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Inventario** → **Artículos** y tocá **Nuevo**.",
          "Escribí el **Nombre** y elegí el **Tipo**: **Producto** si le llevás stock (una gaseosa, una cerveza) o **Elaborado** si se prepara al vender y no lleva stock (un 1/4 de pollo, un plato del día).",
          "Poné el **Precio de venta** (es obligatorio) y el **Costo**, lo que te cuesta a vos.",
          "Elegí la **Categoría** y la **Unidad de medida** (obligatoria). En **Ícono** tocá para elegir el dibujo que ve el cajero en el punto de venta; sin ícono se muestran las iniciales.",
          "Dejá marcado **Habilitado** y tocá **Guardar**."
        ]
      }
    ],
    "celular": [
      "Menú → **Inventario** → pestaña **Artículos** → **Nuevo**.",
      "Completá **Nombre del Artículo**, **Tipo de Artículo**, **Unidad de Medida**, **Categoría** e **Ícono**.",
      "En **Precios e Inventario** poné **Precio de Venta**, **Costo** y, si es un producto, el **Stock mínimo** (en el celular es obligatorio).",
      "Dejá el **Estado** en **Activo** y tocá **Guardar**."
    ],
    "importante": "crear un producto no le carga stock. Va a aparecer **Agotado** en el punto de venta hasta que cargues lo que tenés con una **Entrada** en **Movimientos** (ver \"Cargar stock\"). Un **Elaborado** no lleva stock y se puede vender de una.",
    "siNoAparece": "**Artículos** lo ve quien tiene el permiso \"Editar catálogo\" (de fábrica, el Administrador y el Encargado). Si no lo ves, pedíselo a tu encargado.",
    "relacionados": [
      "productos-stock",
      "productos-precio",
      "productos-combo"
    ]
  },
  {
    "id": "productos-combo",
    "titulo": "Armar un combo",
    "rama": "productos",
    "orden": 3,
    "frases": [
      "armar un combo",
      "crear un combo",
      "cuarto de pollo con papas y gaseosa",
      "combo familiar",
      "plato compuesto"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "productos",
    "destino": "/inventario/productos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Inventario** → **Artículos** y tocá **Nuevo**.",
          "Escribí el **Nombre** (ej. \"Combo 1/4 de pollo\"), en **Tipo** elegí **Combo** y poné el **Precio de venta**.",
          "En **Stock del combo** poné cuántos combos tenés para vender hoy (0 si no hay). Es obligatorio.",
          "En **Receta del combo**, usá **+ Agregar ingrediente…** para sumar lo que lleva (1/4 de pollo, papas, gaseosa) y poné la cantidad de cada uno.",
          "Elegí la **Unidad de medida** y tocá **Guardar**."
        ]
      }
    ],
    "celular": [
      "Menú → **Inventario** → pestaña **Artículos** → **Nuevo**.",
      "En **Tipo de Artículo** elegí **Combo** y completá nombre, unidad y **Precio de Venta**.",
      "En **Combos a ofrecer (Stock)** poné cuántos tenés.",
      "En **Productos del combo**, tocá **+ Agregar productos** y elegí lo que lleva.",
      "Tocá **Guardar**."
    ],
    "importante": "el combo tiene su propio stock. Venderlo baja el **Stock del combo**, no el de lo que lleva: las papas y la gaseosa no se descuentan solas. Cuando armes más combos, editá el combo y cambiá el **Stock del combo** (no se carga por **Movimientos**).",
    "siNoAparece": "el tipo **Combo** sólo se ofrece si tu plan incluye combos (de fábrica, el plan Profesional). Para cargarlo hace falta el permiso \"Editar catálogo\" (el Administrador y el Encargado).",
    "relacionados": [
      "productos-cargar",
      "productos-se-acabo",
      "productos-stock"
    ]
  },
  {
    "id": "productos-precio",
    "titulo": "Cambiar el precio de un producto",
    "rama": "productos",
    "orden": 2,
    "frases": [
      "cambiar el precio",
      "subir el precio del pollo",
      "actualizar precios",
      "el precio esta mal",
      "modificar precio de un plato"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "productos",
    "destino": "/inventario/productos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Inventario** → **Artículos** y buscá el producto en \"Buscar por nombre, descripción o código\".",
          "Tocalo y, en el **Detalle del artículo**, tocá **Editar**.",
          "Cambiá el **Precio de venta** y tocá **Guardar**."
        ]
      }
    ],
    "celular": [
      "Menú → **Inventario** → pestaña **Artículos** y tocá el producto.",
      "En **Detalle del Artículo**, tocá **Editar**.",
      "Cambiá el **Precio de Venta** y tocá **Actualizar**."
    ],
    "importante": "si tenés más de una sucursal y una tiene un precio propio para ese producto (**Almacenes** → la sucursal → **Precios propios de esta sucursal**), ahí se cobra ese precio y no el del catálogo.",
    "siNoAparece": "**Artículos** lo ve quien tiene el permiso \"Editar catálogo\" (de fábrica, el Administrador y el Encargado). Si al editar no ves el campo del precio, tu rol no tiene \"Ver precios y totales\": el precio lo cambia otra persona.",
    "relacionados": [
      "productos-cargar",
      "productos-combo"
    ]
  },
  {
    "id": "productos-se-acabo",
    "titulo": "Un producto se acabó o no aparece en el punto de venta",
    "rama": "productos",
    "orden": 5,
    "frases": [
      "se acabo el pollo",
      "dice agotado",
      "no aparece el producto en la caja",
      "no me deja vender un producto",
      "producto sin stock",
      "desaparecio un plato"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/inventario/productos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Si en el punto de venta dice **Agotado**, no le queda stock en el local de tu caja. Cargalo con una **Entrada** en **Inventario** → **Movimientos** (ver \"Cargar stock\"). Si es un **Combo**, editá el combo y cambiá el **Stock del combo**.",
          "Si no aparece, mirá arriba de la grilla: con una categoría elegida se ven sólo los de esa categoría. Tocá **Todos** y borrá lo escrito en \"Buscar producto o código\".",
          "Si sigue sin aparecer, en **Inventario** → **Artículos** buscalo. Si dice **Inactivo**, tocá **Editar**, marcá **Habilitado** y tocá **Guardar**.",
          "Si no está en la lista, elegí el estado **Dados de baja**, tocalo y tocá **Restaurar**."
        ]
      }
    ],
    "celular": [
      "Si en la venta dice **Sin stock**, cargalo con una **Entrada** en Menú → **Inventario** → **Movimientos**.",
      "Si no aparece, en Menú → **Inventario** → **Artículos** buscalo con los filtros de **Estado**: si está **Inactivo**, tocá **Editar**, poné el **Estado** en **Activo** y tocá **Actualizar**."
    ],
    "importante": "el stock que cuenta es el del almacén de la caja abierta. Si la mercadería entró a otro almacén, en tu caja sigue apareciendo **Agotado**. Un **Elaborado** nunca se agota por stock; si tu negocio tiene el **Menú digital**, un plato marcado **Agotado hoy** tampoco se ofrece hasta que lo desmarques.",
    "siNoAparece": "**Artículos** y **Movimientos** los maneja quien tiene \"Editar catálogo\" y \"Mover inventario\" (de fábrica, el Administrador y el Encargado). Si sos cajero, avisale a tu encargado.",
    "relacionados": [
      "productos-stock",
      "productos-combo",
      "productos-cargar"
    ]
  },
  {
    "id": "productos-stock",
    "titulo": "Cargar stock cuando llega mercadería",
    "rama": "productos",
    "orden": 4,
    "frases": [
      "llego mercaderia",
      "cargar stock",
      "entrada de mercaderia",
      "compre gaseosas",
      "el producto dice agotado y lo tengo",
      "sumar stock"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "movimientos",
    "destino": "/inventario/movimientos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Inventario** → **Movimientos** y tocá **Nuevo**.",
          "En **Tipo** dejá **Entrada** y elegí el **Almacén** donde guardás la mercadería. En **Comprobante** podés poner el número de factura o nota.",
          "En **Artículos**, buscá cada producto en \"Buscá el artículo para agregarlo…\".",
          "En cada línea poné la **Cantidad** y el **Costo** (viene con el último).",
          "Tocá **Guardar**: el stock se suma ahí mismo."
        ]
      }
    ],
    "celular": [
      "Menú → **Inventario** → pestaña **Movimientos** → **Nuevo**.",
      "En **Tipo de Movimiento** dejá **Entrada**, elegí el **Almacén** y tocá **Guardar**.",
      "Tocá **+ Artículo**, buscalo, poné la **Cantidad** y el **Costo Unitario** y tocá **Agregar**. Repetí con cada producto.",
      "Tocá **Aprobar Movimiento**: recién ahí se suma el stock."
    ],
    "importante": "crear un producto no le carga stock: entra siempre por acá. Un **Elaborado** no lleva stock, y el stock de un **Combo** se cambia editando el combo, no por **Movimientos**.",
    "siNoAparece": "**Movimientos** lo ve quien tiene \"Mover inventario\" (de fábrica, el Administrador y el Encargado) con el inventario en su plan. Si tu negocio tiene el doble control, el movimiento queda **Pendiente** hasta que lo apruebe quien tiene \"Aprobar movimientos\".",
    "relacionados": [
      "productos-cargar",
      "productos-se-acabo",
      "productos-combo"
    ]
  },
  {
    "id": "equipo-pin",
    "titulo": "Darle un PIN al encargado",
    "rama": "equipo",
    "orden": 2,
    "frases": [
      "darle un pin al encargado",
      "asignar pin",
      "quien autoriza las anulaciones",
      "cambiar el pin",
      "pin bloqueado"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "usuarios",
    "destino": "/usuarios",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Equipo** → **Usuarios** y tocá al encargado.",
          "En el **Detalle del usuario**, tocá **Asignar PIN** (o **Cambiar PIN** si ya tiene uno).",
          "Escribí 4 dígitos en **PIN** y otra vez en **Repetir PIN**, o tocá **Generar uno al azar**.",
          "Tocá **Guardar** y dáselo en persona: después no se vuelve a mostrar."
        ]
      }
    ],
    "celular": [
      "Menú → **Usuarios** y tocá al encargado.",
      "Tocá **Asignar PIN**.",
      "Escribí el **Nuevo PIN** y otra vez en **Repetir PIN**, y tocá **Guardar PIN**."
    ],
    "importante": "el PIN autoriza anular ventas (y fiar por encima del límite del cliente, si tenés fiado). Si alguien se equivoca 5 veces en 15 minutos, no puede usar el PIN por 15 minutos; con 10 equivocados en 24 horas se frena hasta que se levante solo o el administrador lo habilite en **Intentos de PIN**.",
    "siNoAparece": "el PIN lo da quien tiene \"Asignar el PIN\" (de fábrica, sólo el Administrador). El botón sale sólo si el rol de esa persona autoriza con PIN (de fábrica, el Administrador y el Encargado); si no, cambiale el rol primero.",
    "relacionados": [
      "equipo-usuario",
      "equipo-roles"
    ]
  },
  {
    "id": "equipo-roles",
    "titulo": "Qué puede hacer cada rol y por qué alguien no ve algo",
    "rama": "equipo",
    "orden": 3,
    "frases": [
      "que puede hacer cada rol",
      "el cajero no ve el inventario",
      "no me aparece en el menu",
      "cambiar permisos de un empleado",
      "crear un rol"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "usuarios",
    "destino": "/usuarios",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Para ver lo que puede hacer una persona, entrá a **Equipo** → **Usuarios**, tocala y mirá **Permisos del rol**: los define el rol, no la cuenta.",
          "Para cambiarlo, entrá a **Equipo** → **Roles** y tocá el rol. El **Administrador** dice **Sólo lectura**: tiene todo y no se edita.",
          "Marcá o desmarcá los permisos y tocá **Guardar**. Les llega a todos los que tienen ese rol, sin volver a entrar.",
          "Para un puesto nuevo, tocá **Nuevo rol**, poné el **Nombre**, marcá los permisos y tocá **Guardar**."
        ]
      },
      {
        "tipo": "texto",
        "texto": "Los roles que trae un restaurante de fábrica (tu negocio pudo cambiarlos):"
      },
      {
        "tipo": "lista",
        "items": [
          "**Administrador:** el dueño, ve y administra todo.",
          "**Encargado:** vende, anula, ve todas las cajas, mete y saca plata de la caja, autoriza con PIN, maneja artículos e inventario, ve reportes y gastos, y crea usuarios de menos nivel. No cambia el QR de cobro, ni los roles, ni da PIN.",
          "**Cajero:** vende, abre y cierra su caja, ve sus ventas, cobra mesas y maneja los pedidos de delivery. Para anular necesita el PIN de un encargado.",
          "**Mesero:** atiende sus mesas, manda comandas y cobra sus mesas; no vende en el punto de venta.",
          "**Repartidor:** entrega los pedidos que le asignan, con cobro contra entrega."
        ]
      }
    ],
    "celular": [
      "Menú → **Roles**: ves cada rol con sus permisos, sólo para mirar. Para crear, editar o borrar roles entrá a la web del negocio."
    ],
    "importante": "una pantalla aparece en el menú sólo si el rol tiene el permiso **y** tu plan la incluye. Lo que tu plan no trae no aparece para nadie, aunque el rol lo tenga: en el editor esos permisos van en **No incluidos en tu plan**.",
    "siNoAparece": "**Roles** lo ve sólo quien tiene \"Gestionar roles\" (de fábrica, sólo el Administrador). Si sos encargado, pedile al dueño que cambie el rol.",
    "relacionados": [
      "equipo-usuario",
      "equipo-pin"
    ]
  },
  {
    "id": "equipo-usuario",
    "titulo": "Crear el usuario de un empleado",
    "rama": "equipo",
    "orden": 1,
    "frases": [
      "crear un usuario",
      "agregar un cajero",
      "dar acceso a un empleado",
      "nuevo usuario",
      "limite de usuarios"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "usuarios",
    "destino": "/usuarios",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Equipo** → **Usuarios** y tocá **Nuevo**.",
          "Escribí el **Nombre completo**, el **Usuario** (con esto entra al sistema) y la **Contraseña** (mínimo 6 caracteres).",
          "Elegí el **Rol**: abajo se ve lo que puede hacer. Si tenés más de un local, elegí también la **Sucursal** donde trabaja.",
          "Tocá **Guardar**.",
          "Pasale su usuario y contraseña: entra con el alias del negocio en **Negocio**, su **Usuario** y su **Contraseña**."
        ]
      }
    ],
    "celular": [
      "Menú → **Usuarios** → **Nuevo**.",
      "Completá **Nombre completo**, **Nombre de usuario**, **Rol del usuario** y **Contraseña**.",
      "Tocá **Crear usuario**."
    ],
    "importante": "cada plan permite una cantidad de usuarios activos: de fábrica, Emprendedor 2, Básico 4 y Profesional sin límite. Si llegaste al tope, al tocar **Nuevo** te sale **Llegaste al límite de usuarios**: desactivá a alguien que ya no use el sistema (los inactivos no cuentan) o pedile a BamarDev usuarios extra.",
    "siNoAparece": "**Usuarios** lo ve quien tiene \"Administrar usuarios\" (de fábrica, el Administrador y el Encargado). El Encargado sólo puede dar roles de menos nivel que el suyo: no crea otro Encargado ni un Administrador.",
    "relacionados": [
      "equipo-roles",
      "equipo-pin"
    ]
  },
  {
    "id": "pagina-compartir",
    "titulo": "Compartir mi página y el cartel QR para el mostrador",
    "rama": "pagina-qr",
    "orden": 2,
    "frases": [
      "compartir mi pagina",
      "copiar el link de mi pagina",
      "enlace de mi pagina",
      "qr de mi pagina",
      "cartel qr",
      "imprimir qr para el mostrador",
      "poner el link en instagram",
      "mandar mi pagina por whatsapp"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "mi_pagina",
    "destino": "/mi-pagina",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Marketing** → **Mi página**. Revisá que arriba diga **Publicada**; si dice **Sin publicar**, tocá **Publicar**.",
          "En **Tu dirección** tocá **Copiar** para pegar el enlace en la bio de Instagram o TikTok, o **Compartir** para mandarlo directo por WhatsApp.",
          "Para el mostrador, tocá **Descargar cartel QR**: se abre **Cartel QR para el mostrador**, una hoja A5 con tu logo y el QR.",
          "Tocá **Descargar imagen** para guardarlo, o **Imprimir**."
        ]
      }
    ],
    "celular": [
      "Menú → **Mi página**.",
      "Tocá **Compartir mi página** para mandar el enlace por WhatsApp u otra app.",
      "Tocá **Ver mi QR** y después **Compartir el QR** para mandarte la imagen e imprimirla."
    ],
    "importante": "el QR del cartel lleva a tu página por un enlace corto: si después cambiás algo de la página, no hace falta reimprimirlo.",
    "siNoAparece": "lo comparte el administrador, con la página incluida en el plan. Si en el celular sale \"Tu página todavía no está publicada\", publicala desde la computadora en **Mi página**. Si dice \"Tu negocio todavía no tiene dirección pública\", pedísela a BamarDev.",
    "relacionados": [
      "pagina-configurar"
    ]
  },
  {
    "id": "pagina-configurar",
    "titulo": "Configurar mi página web",
    "rama": "pagina-qr",
    "orden": 1,
    "frases": [
      "armar mi pagina",
      "configurar mi pagina",
      "mi pagina web",
      "pagina para instagram",
      "link para la bio",
      "poner mi carta en la pagina",
      "mostrar mis productos en la pagina",
      "cambiar el logo de la pagina",
      "cambiar colores de la pagina",
      "publicar mi pagina",
      "pedidos por whatsapp",
      "horario en la pagina"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "mi_pagina",
    "destino": "/mi-pagina",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Entrá a **Marketing** → **Mi página**. Arriba de todo, en **Apariencia**, elegí el **Estilo** (confirmalo con **Usar este estilo**), subí tu logo y tu portada (**Subir logo**, **Subir foto**) y elegí color, forma de los botones y letra.",
          "En **Presentación** escribí la **Descripción corta** (por ejemplo: \"Pollo a la brasa y broaster desde 2009\") y, si querés, elegí el **Botón principal**, el botón grande de arriba.",
          "En el **Catálogo**, en **¿Qué muestra tu catálogo?**, elegí **Mis productos** y tocá **Elegir productos**: marcá los platos que querés mostrar y tocá **Guardar**. El precio sale del sistema y se actualiza solo.",
          "En **Redes y botones** tocá **Red social** o **Botón** para agregar tu WhatsApp, Facebook e Instagram. En **Sucursales en la página** cargá el horario y el mapa de cada local.",
          "Tocá **Guardar cambios** (la vista previa te muestra cómo queda) y, cuando esté lista, **Publicar**."
        ]
      }
    ],
    "importante": "si tenés el extra de pedidos, en **Pedidos y gift cards** marcá **Recibir pedidos por WhatsApp**: tus clientes suman platos del catálogo y te llega el pedido escrito, con el total, al WhatsApp que cargaste en **Redes y botones**.",
    "siNoAparece": "la página la arma el administrador, y sólo desde la computadora (en el celular se comparte, no se edita). Si no ves **Mi página**, tu plan no trae la página: pedísela a BamarDev. Si **Publicar** está apagado y dice \"Tu negocio todavía no tiene dirección pública\", pedile la dirección a BamarDev.",
    "relacionados": [
      "pagina-compartir",
      "qr-cargar"
    ]
  },
  {
    "id": "qr-cargar",
    "titulo": "Cargar el QR de cobro de mi banco",
    "rama": "pagina-qr",
    "orden": 3,
    "frases": [
      "cargar el qr",
      "subir mi qr",
      "qr del banco",
      "qr de cobro",
      "cambiar el qr",
      "no sale el qr para cobrar",
      "no hay qr del negocio",
      "donde pongo mi qr"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "seccion": "pos",
    "destino": "/pos",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Con la caja cerrada, entrá a **Punto de venta**: te aparece **Abrir caja**.",
          "En el recuadro **QR de cobro** tocá **Subir QR** (si ya hay uno, **Cambiar**) y elegí la imagen del QR que te dio tu banco.",
          "Listo: ahora dice \"Se le muestra al cliente cuando paga por QR.\" Lo reciben también los meseros y el reparto.",
          "Si la caja ya está abierta y todavía no hay QR, cargalo al cobrar: elegí pagar por QR y tocá **Cargar el QR**."
        ]
      }
    ],
    "celular": [
      "Menú → **Ventas**. Con la caja cerrada aparece **Apertura de caja**.",
      "En **QR PARA COBROS (OPCIONAL)** tocá **Sube tu QR de pago** y elegí la imagen de la galería.",
      "Sale \"QR guardado. Ya lo tienen los meseros y el reparto.\"",
      "Si la caja ya está abierta y al cobrar con QR dice \"Todavía no hay QR del negocio en este equipo. Tocá acá para cargarlo desde la galería.\", tocá ese texto y elegí la imagen."
    ],
    "importante": "el QR es la cuenta a la que entra la plata: usá el de la cuenta del negocio. Si lo quitás (**Quitar**), se borra en todos los equipos y ninguna caja puede mostrar un QR hasta que subas otro.",
    "siNoAparece": "el QR lo carga sólo el administrador. Si sos cajero, vas a ver \"Todavía no hay QR del negocio. Lo carga el administrador.\" y no lo podés cambiar. Si no aparece nada de QR al cobrar, tu plan no trae el cobro por QR: consultalo con BamarDev.",
    "relacionados": [
      "caja-abrir"
    ]
  },
  {
    "id": "licencia-pagar",
    "titulo": "Pagar la licencia con QR (1, 6 o 12 meses)",
    "rama": "licencia",
    "orden": 1,
    "frases": [
      "pagar la licencia",
      "pagar el sistema",
      "pagar la mensualidad",
      "renovar la licencia",
      "pagar con qr",
      "pagar 6 meses",
      "pagar un año",
      "adelantar el pago",
      "cuanto pago por el sistema"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "destino": "/pagar",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Si la barra de arriba avisa que la licencia vence, tocá **Pagar**. Si no podés entrar, en el inicio de sesión tocá **Pagar la licencia con QR**.",
          "En **Pagar con QR** escribí el alias de tu negocio (el mismo con el que entrás) y tocá **Ver el precio**.",
          "En **Elegí tu plazo** tocá 1 mes, 6 meses o 12 meses: cada uno dice cuánto sale por mes, cuánto ahorrás y hasta cuándo cubre. Tocá **Generar QR**.",
          "Escaneá el QR con la app de tu banco y pagá el **Total a pagar**.",
          "La pantalla se actualiza sola cuando el pago entra; si no, tocá **Ya pagué, verificar**. Al ver **¡Pago recibido!**, tocá **Iniciar sesión**."
        ]
      }
    ],
    "celular": [
      "Tocá **Pagar** en la barra de aviso, o **Pagar la licencia con QR** en el inicio de sesión.",
      "Si el celular ya conoce tu negocio, va directo al plazo; si no, escribí el alias en **Pagar con QR**.",
      "Elegí el plazo y tocá **Generar QR**.",
      "Escaneá el QR con la app de tu banco y, al terminar, tocá **Ya pagué**.",
      "Al ver **Pago acreditado**, volvé a entrar (**Iniciar sesión**) o seguí trabajando (**Volver**)."
    ],
    "importante": "si pagás antes de que venza, no perdés los días que te quedan: lo que pagás se suma a partir de la fecha de vencimiento. El monto lo calcula el sistema con el precio acordado con tu negocio.",
    "siNoAparece": "cualquier persona del negocio puede pagar; sólo hace falta el alias. Si la licencia está suspendida no se ofrece pagar con QR: hablá con BamarDev. Para pagar de otra forma (transferencia), tocá **Otras formas de pago** en el cartel del inicio de sesión, si aparece.",
    "relacionados": [
      "licencia-vence"
    ]
  },
  {
    "id": "licencia-plan-no-incluye",
    "titulo": "Me sale \"Tu plan no incluye esta sección\"",
    "rama": "licencia",
    "orden": 3,
    "frases": [
      "tu plan no incluye esta seccion",
      "mi plan no incluye",
      "no tengo esa opcion",
      "no me aparece en el menu",
      "quiero mas funciones",
      "cambiar de plan",
      "activar un extra",
      "tu usuario no tiene permiso",
      "no tengo permiso"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "\"Tu plan no incluye esta sección. Consultá con el administrador.\" quiere decir que eso no está en lo que el negocio contrató con BamarDev (el plan o un extra). No es un problema de tu usuario.",
          "Si el problema es tu usuario, el cartel es otro: \"Tu usuario no tiene permiso para esto. Consultá con el administrador.\" Eso lo arregla el administrador del negocio en los permisos de tu rol.",
          "Si sos empleado, en los dos casos avisale al administrador o al dueño.",
          "Si sos el dueño y querés sumarlo, pedíselo a BamarDev: se activa cambiando de plan o sumando el extra.",
          "Cuando BamarDev lo active, recargá la página (o cerrá y abrí la app) para que aparezca en el menú."
        ]
      }
    ],
    "importante": "lo que tu plan no trae normalmente ni aparece en el menú. Algunas pantallas lo dicen en el lugar, por ejemplo en Mi página: \"Es un extra: pedilo a BamarDev para activarlo.\"",
    "siNoAparece": "si al entrar sale \"Tu cuenta no tiene secciones\" (en el celular, \"Tu rol ya no tiene acceso\"), tu rol no tiene ningún permiso habilitado: pedile al administrador que lo revise.",
    "relacionados": [
      "licencia-pagar"
    ]
  },
  {
    "id": "licencia-vence",
    "titulo": "Me sale que la licencia vence, está vencida o suspendida",
    "rama": "licencia",
    "orden": 2,
    "frases": [
      "la licencia vence",
      "licencia vencida",
      "licencia suspendida",
      "cuenta suspendida",
      "me sale una barra amarilla",
      "me sale una barra roja",
      "no me deja entrar",
      "me bloqueo el sistema",
      "dias para pagar antes del bloqueo"
    ],
    "rubros": [
      "RESTAURANTE"
    ],
    "destino": "/pagar",
    "cuerpo": [
      {
        "tipo": "pasos",
        "items": [
          "Si vence pronto (los 7 días antes): arriba sale una barra amarilla, por ejemplo \"La licencia vence en 3 días.\" Seguís trabajando normal. Tocá **Pagar** para renovar.",
          "Si ya venció y estás en los 3 días de gracia: la barra se pone roja: \"La licencia venció. Te quedan 2 días para pagar antes del bloqueo.\" Todavía podés vender; tocá **Pagar** antes de que se acabe.",
          "Pasada la gracia, el sistema cierra la sesión y no deja entrar. En el inicio de sesión sale **Licencia vencida** con la fecha; tocá **Pagar con QR**. Apenas entra el pago, volvés a entrar.",
          "Si BamarDev la suspendió, sale **Licencia suspendida** (\"La licencia de tu negocio está suspendida. Contactá a BamarDev para reactivarla.\"). No se arregla pagando con QR: escribile a BamarDev."
        ]
      }
    ],
    "celular": [
      "Vence pronto o en gracia: la misma barra, con el botón **Pagar**.",
      "Vencida: en el inicio de sesión sale **Licencia vencida** con **Pagar con QR**.",
      "Suspendida mientras trabajabas: sale **Cuenta suspendida** con **Pagar ahora** y **Cerrar sesión**. En el inicio de sesión sale **Licencia suspendida**, sin botón de pagar."
    ],
    "importante": "la barra la ve todo el que esté usando el sistema, también los cajeros, y no se puede cerrar. Si lo paga otra persona, avisale al dueño.",
    "siNoAparece": "si pagaste y la barra sigue, recargá la página (o cerrá y abrí la app): se vuelve a revisar sola al volver a la pantalla y cada 15 minutos.",
    "relacionados": [
      "licencia-pagar"
    ]
  }
];
