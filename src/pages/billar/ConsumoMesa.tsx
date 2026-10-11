import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Vacio } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { round2 } from "./calculo";
import { totalCarrito, useCarritoBillar } from "./carrito";
import { Catalogo, LineasPedido, PantallaPedido } from "./Catalogo";
import { CajaCerradaAviso } from "./ModalesCaja";
import { useAhora } from "./reloj";
import { agruparItems, billar, useBillar } from "./store";
import { BotonB, Circulo, Encabezado, Fila, Rotulo } from "./ui";
import { vistaDe } from "./vista";

/**
 * Agregar consumo a una mesa (§7.4): el POS, con destino "Mesa N". Confirmar
 * carga a la cuenta (no cobra) y descuenta el stock, como una venta.
 */
export default function ConsumoMesa() {
  const { mesaId } = useParams();
  const e = useBillar();
  const ahora = useAhora();
  const navigate = useNavigate();
  const { carrito, poner, vaciar, items } = useCarritoBillar();
  const [verCuenta, setVerCuenta] = useState(false);
  const mesa = e.mesas.find((m) => m.id === Number(mesaId));
  const volver = `/billar?mesa=${mesaId}`;

  const botonVolver = (
    <BotonB icono="arrowLeft" onClick={() => navigate(volver)} aria-label="Volver a la mesa">
      <span className="hidden sm:inline">Volver a la mesa</span>
    </BotonB>
  );

  if (!e.caja.abierta) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo="Punto de venta" />
        <CajaCerradaAviso />
      </div>
    );
  }
  if (!mesa || mesa.estado !== "abierta" || !mesa.sesion) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo="Punto de venta">{botonVolver}</Encabezado>
        <Vacio
          icono="bola"
          titulo={`La Mesa ${mesaId} no está abierta`}
          texto="Los consumos se cargan a una mesa en juego."
          accion={<BotonB onClick={() => navigate("/billar")}>Ir al tablero</BotonB>}
        />
      </div>
    );
  }

  const v = vistaDe(e, mesa, ahora);
  const c = v.cuenta!;
  const nuevos = totalCarrito(carrito, e.productos);
  const cantidad = items.reduce((t, i) => t + i.cant, 0);
  const yaEnCuenta = agruparItems(mesa.sesion.consumos);
  const agregar = (id: number) => poner(id, (carrito.get(id) ?? 0) + 1);

  const confirmar = () => {
    billar.agregarConsumos(mesa.id, items);
    // Vacío antes de irse: un segundo toque en el mismo instante no carga dos veces.
    vaciar();
    billar.avisar({ tono: "verde", titulo: `Se cargó ${fmtMoney(nuevos)} a la Mesa ${mesa.id}`, texto: "Sin cobrar: va a la cuenta de la mesa." });
    navigate(volver);
  };

  const pedido = (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-borde px-5 py-4">
        <Circulo icono="bola" />
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold text-texto">Mesa {mesa.id}</p>
          <p className="truncate text-[12px] text-texto-3">
            {v.tipo.nombre} · {mesa.sesion.cliente ?? "Sin cliente"}
          </p>
        </div>
        {cantidad > 0 && (
          <button type="button" onClick={vaciar} className="mr-10 text-[13px] font-semibold text-rose-700 hover:underline lg:mr-0">
            Vaciar
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <Rotulo extra={cantidad ? `${cantidad} ${cantidad === 1 ? "producto" : "productos"}` : undefined}>Nuevos</Rotulo>
        {cantidad === 0 ? (
          <p className="py-4 text-center text-[13px] text-texto-3">Tocá un producto para cargarlo a la mesa.</p>
        ) : (
          <LineasPedido carrito={carrito} productos={e.productos} onPoner={poner} />
        )}
        <div className="rounded-xl border border-borde">
          <button
            type="button"
            onClick={() => setVerCuenta((x) => !x)}
            aria-expanded={verCuenta}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-semibold text-texto"
          >
            <Icon name="fileText" size={16} />
            <span className="flex-1">
              Ya en la cuenta: {yaEnCuenta.reduce((t, i) => t + i.cant, 0)} ítems · {fmtMoney(c.consumosBs)}
            </span>
            <Icon name="chevronDown" size={16} className={verCuenta ? "rotate-180" : ""} />
          </button>
          {verCuenta && (
            <ul className="border-t border-borde-soft px-4 py-2 text-[13px]">
              {yaEnCuenta.length === 0 ? (
                <li className="py-1.5 text-texto-3">Todavía nada.</li>
              ) : (
                yaEnCuenta.map((i) => (
                  <li key={`${i.productoId}-${i.precio}`} className="flex justify-between py-1.5 text-texto-2">
                    <span>
                      {i.cant}× {i.nombre}
                    </span>
                    <span className="font-semibold tabular-nums text-texto">{fmtMoney(i.precio * i.cant)}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      </div>
      <div className="shrink-0 space-y-3 border-t border-borde px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="space-y-1 text-[13px]">
          <Fila etiqueta="Saldo actual" valor={fmtMoney(c.saldo)} />
          <Fila etiqueta="Nuevos consumos" valor={fmtMoney(nuevos)} />
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-[15px] font-semibold text-texto">Saldo después</span>
            <span className="text-xl font-extrabold tabular-nums text-texto">{fmtMoney(round2(c.saldo + nuevos))}</span>
          </div>
        </div>
        <BotonB variante="verde" grande icono="plus" className="w-full" disabled={cantidad === 0} onClick={confirmar}>
          Agregar a Mesa {mesa.id} · {fmtMoney(nuevos)}
        </BotonB>
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Encabezado titulo="Punto de venta">{botonVolver}</Encabezado>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2.5 text-[13px] text-blue-800 sm:px-6">
        <p className="flex items-center gap-2">
          <Icon name="bola" size={16} />
          <span>
            Cargando a <b>Mesa {mesa.id}</b> · Saldo actual <b className="tabular-nums">{fmtMoney(c.saldo)}</b>
          </span>
        </p>
        <Link to={volver} className="font-semibold hover:underline">
          Volver a la mesa
        </Link>
      </div>
      <PantallaPedido
        catalogo={<Catalogo productos={e.productos} carrito={carrito} onAgregar={agregar} />}
        pedido={pedido}
        cantidad={cantidad}
        total={nuevos}
      />
    </div>
  );
}
