import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon, type NombreIcono } from "../../components/Icon";
import { Vacio } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { useIntentoDeCobro } from "../pos/useIntentoDeCobro";
import { round2 } from "./calculo";
import { totalCarrito, useCarritoBillar } from "./carrito";
import { Catalogo, LineasPedido, PantallaPedido } from "./Catalogo";
import { CajaCerradaAviso } from "./ModalesCaja";
import { huellaConsumos } from "./reintentos";
import { useAhora } from "./reloj";
import { agruparItems, billar, cargarProductos, useBillar } from "./store";
import type { ItemConsumo } from "./tipos";
import { useAccion } from "./useAccion";
import { BotonB, Circulo, Encabezado, ErrorAccion, Fila, Rotulo } from "./ui";
import { vistaCuenta, vistaDe } from "./vista";

/**
 * Agregar consumo a una mesa (§7.4): el POS, con destino "Mesa N". Confirmar
 * carga a la cuenta (no cobra). El stock se descuenta al cobrar la mesa, como
 * en el salón; mientras tanto lo cargado ya no se ofrece a otra mesa.
 */
export default function ConsumoMesa() {
  const { mesaId } = useParams();
  const e = useBillar();
  const ahora = useAhora();
  const navigate = useNavigate();
  const mesa = e.mesas.find((m) => m.id === Number(mesaId));
  const volver = `/billar?mesa=${mesaId}`;

  const botonVolver = (
    <BotonB icono="arrowLeft" onClick={() => navigate(volver)} aria-label="Volver a la mesa">
      <span className="hidden sm:inline">Volver a la mesa</span>
    </BotonB>
  );

  if (!e.caja.abierta) return <SinCaja />;
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
  return (
    <PantallaConsumo
      destino={`Mesa ${mesa.id}`}
      icono="bola"
      subtitulo={`${v.tipo.nombre} · ${mesa.sesion.cliente ?? "Sin cliente"}`}
      volver={volver}
      botonVolver={botonVolver}
      textoVolver="Volver a la mesa"
      sesionId={mesa.sesion.id}
      consumos={mesa.sesion.consumos}
      consumosBs={c.consumosBs}
      saldo={c.saldo}
      cargar={(items, clave) => billar.agregarConsumos(mesa.id, items, clave)}
      avisoCargado={(nuevos) => ({
        titulo: `Se cargó ${fmtMoney(nuevos)} a la Mesa ${mesa.id}`,
        texto: "Sin cobrar: va a la cuenta de la mesa.",
      })}
      paraVacio="Tocá un producto para cargarlo a la mesa."
    />
  );
}

/**
 * Agregar consumo a una cuenta abierta (sin mesa, 21-oct): la misma pantalla
 * con destino "Cuenta «Juan»". Tampoco cobra: va a la cuenta.
 */
export function ConsumoCuenta() {
  const { cuentaId } = useParams();
  const e = useBillar();
  const navigate = useNavigate();
  const cuenta = e.cuentas.find((c) => c.id === Number(cuentaId));
  const volver = `/billar?ver=cuentas&cuenta=${cuentaId}`;

  const botonVolver = (
    <BotonB icono="arrowLeft" onClick={() => navigate(volver)} aria-label="Volver a la cuenta">
      <span className="hidden sm:inline">Volver a la cuenta</span>
    </BotonB>
  );

  if (!e.caja.abierta) return <SinCaja />;
  if (!cuenta) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Encabezado titulo="Punto de venta">{botonVolver}</Encabezado>
        <Vacio
          icono="users"
          titulo="Esa cuenta ya no está abierta"
          texto="Se cobró o se anuló. Los consumos se cargan a una cuenta abierta."
          accion={<BotonB onClick={() => navigate("/billar?ver=cuentas")}>Ir a las cuentas</BotonB>}
        />
      </div>
    );
  }

  const { calc } = vistaCuenta(cuenta, Date.now());
  return (
    <PantallaConsumo
      destino={`Cuenta «${cuenta.nombre}»`}
      icono="users"
      subtitulo="Cuenta abierta · sin mesa ni tiempo"
      volver={volver}
      botonVolver={botonVolver}
      textoVolver="Volver a la cuenta"
      sesionId={cuenta.sesion.id}
      consumos={cuenta.sesion.consumos}
      consumosBs={calc.consumosBs}
      saldo={calc.saldo}
      cargar={(items, clave) => billar.agregarConsumosCuenta(cuenta.id, items, clave)}
      avisoCargado={(nuevos) => ({
        titulo: `Se cargó ${fmtMoney(nuevos)} a la cuenta «${cuenta.nombre}»`,
        texto: "Sin cobrar: va a la cuenta.",
      })}
      paraVacio="Tocá un producto para cargarlo a la cuenta."
    />
  );
}

function SinCaja() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Encabezado titulo="Punto de venta" />
      <CajaCerradaAviso />
    </div>
  );
}

/** El catálogo con el pedido al costado: lo común a la mesa y a la cuenta abierta. */
function PantallaConsumo({
  destino,
  icono,
  subtitulo,
  volver,
  botonVolver,
  textoVolver,
  sesionId,
  consumos,
  consumosBs,
  saldo,
  cargar,
  avisoCargado,
  paraVacio,
}: {
  /** "Mesa 5", "Cuenta «Juan»". */
  destino: string;
  icono: NombreIcono;
  subtitulo: string;
  volver: string;
  botonVolver: ReactNode;
  textoVolver: string;
  sesionId: string;
  consumos: ItemConsumo[];
  consumosBs: number;
  saldo: number;
  cargar: (items: { productoId: number; cant: number }[], clave: string) => Promise<unknown>;
  avisoCargado: (nuevos: number) => { titulo: string; texto: string };
  paraVacio: string;
}) {
  const e = useBillar();
  const navigate = useNavigate();
  const { carrito, poner, vaciar, items } = useCarritoBillar();
  const [verCuenta, setVerCuenta] = useState(false);
  const accion = useAccion();
  const intento = useIntentoDeCobro();

  const nuevos = totalCarrito(carrito, e.productos);
  const cantidad = items.reduce((t, i) => t + i.cant, 0);
  const yaEnCuenta = agruparItems(consumos);
  const agregar = (id: number) => poner(id, (carrito.get(id) ?? 0) + 1);

  const confirmar = async () => {
    // El mismo id mientras el pedido sea el mismo: con wifi malo el reintento
    // de "Agregar" cargaba todo otra vez a la cuenta.
    const clave = intento.actual(huellaConsumos(sesionId, items));
    const ok = await accion.ejecutar(() => cargar(items, clave));
    if (!ok) {
      // Si fue por stock, el catálogo de la pantalla ya no es el de verdad.
      void cargarProductos();
      return;
    }
    intento.registrado();
    vaciar();
    billar.avisar({ tono: "verde", ...avisoCargado(nuevos) });
    navigate(volver);
  };

  const pedido = (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-borde px-5 py-4">
        <Circulo icono={icono} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold text-texto">{destino}</p>
          <p className="truncate text-[12px] text-texto-3">{subtitulo}</p>
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
          <p className="py-4 text-center text-[13px] text-texto-3">{paraVacio}</p>
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
              Ya en la cuenta: {yaEnCuenta.reduce((t, i) => t + i.cant, 0)} ítems · {fmtMoney(consumosBs)}
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
          <Fila etiqueta="Saldo actual" valor={fmtMoney(saldo)} />
          <Fila etiqueta="Nuevos consumos" valor={fmtMoney(nuevos)} />
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-[15px] font-semibold text-texto">Saldo después</span>
            <span className="text-xl font-extrabold tabular-nums text-texto">{fmtMoney(round2(saldo + nuevos))}</span>
          </div>
        </div>
        <ErrorAccion texto={accion.error} />
        <BotonB
          variante="verde"
          grande
          icono="plus"
          className="w-full"
          disabled={cantidad === 0 || accion.enviando}
          onClick={confirmar}
        >
          {accion.enviando ? "Cargando…" : `Agregar a ${destino} · ${fmtMoney(nuevos)}`}
        </BotonB>
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Encabezado titulo="Punto de venta">{botonVolver}</Encabezado>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2.5 text-[13px] text-blue-800 sm:px-6">
        <p className="flex items-center gap-2">
          <Icon name={icono} size={16} />
          <span>
            Cargando a <b>{destino}</b> · Saldo actual <b className="tabular-nums">{fmtMoney(saldo)}</b>
          </span>
        </p>
        <Link to={volver} className="font-semibold hover:underline">
          {textoVolver}
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
