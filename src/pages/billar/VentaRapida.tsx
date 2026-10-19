import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { quedoEnDuda } from "../../lib/cupo";
import { fmtMoney } from "../../lib/format";
import { useBloqueoCupo } from "../../lib/useBloqueoCupo";
import { totalCarrito, useCarritoBillar } from "./carrito";
import { Catalogo, LineasPedido, PantallaPedido } from "./Catalogo";
import { FormCobro } from "./Cobro";
import { huellaDeCobro, useIntentoDeCobro } from "../pos/useIntentoDeCobro";
import { useCobro } from "./useCobro";
import { useAccion } from "./useAccion";
import { CajaCerradaAviso } from "./ModalesCaja";
import { huellaConsumos } from "./reintentos";
import { billar, cargarProductos, useBillar } from "./store";
import { BotonB, Encabezado, ErrorAccion, Rotulo } from "./ui";

/**
 * Venta rápida, sin mesa (§7.7): el que pasa a comprar una soda o una cerveza.
 * Es una venta normal del POS (`POST /ventas`): comprobante del turno, stock
 * y caja como cualquier otra. No hay fiado acá: el fiado es al cerrar una
 * mesa. Si al final se quedan a jugar, el pedido se carga a una mesa abierta
 * sin cobrarlo.
 */
export default function VentaRapida() {
  const e = useBillar();
  const navigate = useNavigate();
  const { carrito, poner, vaciar, items } = useCarritoBillar();
  const [cobrando, setCobrando] = useState(false);
  const [aMesa, setAMesa] = useState(false);
  const total = totalCarrito(carrito, e.productos);
  const cantidad = items.reduce((t, i) => t + i.cant, 0);
  const cobro = useCobro(total);
  const abiertas = e.mesas.filter((m) => m.estado === "abierta");
  const accion = useAccion();
  const intento = useIntentoDeCobro();
  const intentoMesa = useIntentoDeCobro();
  /**
   * Plan Emprendedor: es una venta del POS y consume del cupo del día igual
   * (cargarla a una mesa no: la mesa ya consumió al abrirse). Sin lugar ni
   * créditos se abre la hoja de comprar créditos, como en el POS, en vez del
   * "Llegaste a tus N ventas de hoy" en rojo sin salida (QA del 19-oct). Sin
   * cupo (Básico, Profesional) deja pasar todo y no pide nada.
   */
  const {
    verificar: hayLugarParaVender,
    manejarError: rechazoPorCupo,
    registrar: registrarConsumo,
  } = useBloqueoCupo("VENTA", { refrescarAlMontar: true });
  // El cobro anterior quedó sin respuesta (corte, 5xx): pudo haber entrado con
  // el último lugar del día. El reintento va con el mismo `clienteRequestId`
  // y el backend devuelve la venta sin consumir de nuevo, así que va al
  // servidor aunque el contador diga lleno (como en el POS).
  const cobroEnDuda = useRef(false);
  const hayLugar = () => cobroEnDuda.current || hayLugarParaVender();

  const volver = (
    <BotonB icono="arrowLeft" onClick={() => navigate("/billar")} aria-label="Volver al billar">
      <span className="hidden sm:inline">Volver al billar</span>
    </BotonB>
  );

  if (!e.caja.abierta) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo="Venta rápida">{volver}</Encabezado>
        <CajaCerradaAviso />
      </div>
    );
  }

  const confirmar = async () => {
    const pago = cobro.pago;
    if (!pago) return;
    if (!hayLugar()) return;
    const cambio = cobro.cambio;
    let r: { codigo: string; yaEntro: string | null } = { codigo: "", yaEntro: null };
    const ok = await accion.ejecutar(
      async () => {
        // El mismo id mientras el pedido sea el mismo: un reintento no vende dos veces.
        const venta = await billar.ventaRapida(items, pago, intento.actual(huellaDeCobro(items)));
        registrarConsumo(venta);
        r = venta;
      },
      (err) => {
        cobroEnDuda.current = quedoEnDuda(err);
        // Otro equipo usó el último lugar del día (403 CUPO_AGOTADO): la hoja
        // de compra y no el cartel rojo. El cobro queda armado para
        // reintentar después de comprar.
        return rechazoPorCupo(err);
      },
    );
    if (!ok) {
      void cargarProductos();
      return;
    }
    cobroEnDuda.current = false;
    intento.registrado();
    billar.avisar(
      r.yaEntro
        ? {
            tono: "ambar",
            titulo: `La venta ${r.codigo} ya había entrado`,
            texto: `Se cobró ${r.yaEntro}: no la cobres de nuevo.`,
            accion: { tipo: "ticket", codigo: r.codigo },
          }
        : {
            tono: "verde",
            titulo: `Venta rápida ${r.codigo} · ${fmtMoney(total)}`,
            texto: cobro.metodo === "Efectivo" ? `Cambio ${fmtMoney(cambio)}` : cobro.metodo,
            accion: { tipo: "ticket", codigo: r.codigo },
          },
    );
    vaciar();
    setCobrando(false);
    cobro.reiniciar();
  };

  const cargarAMesa = async (mesaId: number) => {
    setAMesa(false);
    // Otro id que el de la venta: cargar a una mesa es otra acción. El mismo
    // mientras el pedido y la mesa sean los mismos, para que el reintento no
    // cargue todo dos veces a la cuenta.
    const sesionId = abiertas.find((m) => m.id === mesaId)?.sesion?.id ?? String(mesaId);
    const clave = intentoMesa.actual(huellaConsumos(sesionId, items));
    if (!(await accion.ejecutar(() => billar.agregarConsumos(mesaId, items, clave)))) {
      void cargarProductos();
      return;
    }
    intentoMesa.registrado();
    vaciar();
    billar.avisar({ tono: "verde", titulo: `Se cargó ${fmtMoney(total)} a la Mesa ${mesaId}`, texto: "Sin cobrar: va a la cuenta de la mesa." });
    navigate(`/billar?mesa=${mesaId}`);
  };

  const pedido = cobrando ? (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-borde px-5 py-4">
        <button
          type="button"
          onClick={() => setCobrando(false)}
          aria-label="Volver al pedido"
          className="flex h-9 w-9 items-center justify-center rounded-full text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
        >
          <Icon name="arrowLeft" size={16} />
        </button>
        <p className="text-[17px] font-bold text-texto">Cobrar venta rápida</p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <div className="rounded-2xl bg-gradient-to-br from-primary-boton to-primary-700 px-5 py-4 text-white">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">Total a cobrar</p>
          <p className="text-3xl font-extrabold tabular-nums">{fmtMoney(total)}</p>
          <p className="text-[13px] text-white/85">
            {cantidad} {cantidad === 1 ? "producto" : "productos"}
          </p>
        </div>
        <FormCobro cobro={cobro} />
      </div>
      <div className="shrink-0 border-t border-borde px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <ErrorAccion texto={accion.error} />
        <BotonB
          variante="verde"
          grande
          icono="check"
          className="mt-3 w-full"
          disabled={!cobro.pago || accion.enviando}
          onClick={confirmar}
        >
          {accion.enviando ? "Registrando…" : `Confirmar venta · ${fmtMoney(total)}`}
        </BotonB>
      </div>
    </>
  ) : (
    <>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-borde px-5 py-4">
        <p className="text-[17px] font-bold text-texto">Pedido</p>
        {cantidad > 0 && (
          <button type="button" onClick={vaciar} className="mr-10 text-[13px] font-semibold text-rose-700 hover:underline lg:mr-0">
            Vaciar
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <Rotulo extra={cantidad ? `${cantidad} ${cantidad === 1 ? "producto" : "productos"}` : undefined}>Productos</Rotulo>
        {cantidad === 0 ? (
          <p className="py-4 text-center text-[13px] text-texto-3">Tocá un producto para agregarlo.</p>
        ) : (
          <LineasPedido carrito={carrito} productos={e.productos} onPoner={poner} />
        )}
      </div>
      <div className="shrink-0 space-y-2.5 border-t border-borde px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-bold uppercase text-texto">Total</span>
          <span className="text-2xl font-extrabold tabular-nums text-texto">{fmtMoney(total)}</span>
        </div>
        {!cobrando && <ErrorAccion texto={accion.error} />}
        {/* Sin lugar en el cupo, la hoja de compra antes de pasar al cobro:
            no hacerle cargar el pago al cajero para rebotar al final. */}
        <BotonB
          variante="verde"
          grande
          icono="billetera"
          className="w-full"
          disabled={cantidad === 0}
          onClick={() => hayLugar() && setCobrando(true)}
        >
          Cobrar {fmtMoney(total)}
        </BotonB>
        <div className="relative">
          <BotonB
            className="w-full"
            disabled={cantidad === 0 || abiertas.length === 0 || accion.enviando}
            onClick={() => setAMesa((x) => !x)}
            aria-expanded={aMesa}
            title={abiertas.length === 0 ? "No hay mesas abiertas" : undefined}
          >
            Mejor cargarlo a una mesa
            <Icon name="chevronDown" size={16} className={aMesa ? "rotate-180" : ""} />
          </BotonB>
          {aMesa && cantidad > 0 && (
            <ul className="absolute bottom-12 left-0 right-0 z-20 max-h-64 overflow-y-auto rounded-xl border border-borde bg-white py-1 shadow-xl">
              {abiertas.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => void cargarAMesa(m.id)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[13px] hover:bg-muted"
                  >
                    <span className="font-semibold text-texto">Mesa {m.id}</span>
                    <span className="truncate text-texto-3">{m.sesion?.cliente ?? e.tipos[m.tipo]?.nombre}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Encabezado titulo="Venta rápida">{volver}</Encabezado>
      <div className="flex shrink-0 items-center gap-2 border-b border-primary-100 bg-primary-50 px-4 py-2.5 text-[13px] text-primary-700 sm:px-6">
        <Icon name="cart" size={16} />
        <span>
          Venta <b>sin mesa</b> · se cobra al momento y descuenta stock
        </span>
      </div>
      <PantallaPedido
        catalogo={<Catalogo productos={e.productos} carrito={carrito} onAgregar={(id) => poner(id, (carrito.get(id) ?? 0) + 1)} />}
        pedido={pedido}
        cantidad={cantidad}
        total={total}
      />
    </div>
  );
}
