import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import InputMonto from "../../components/InputMonto";
import { Badge, Boton, Cargando, ErrorMsg, Input, Select } from "../../components/ui";
import { ApiError, api } from "../../lib/api";
import { fmtMoney, fmtNum } from "../../lib/format";
import { enlaceWhatsApp } from "../../lib/mensajePedido";
import { urlRuta } from "../../lib/mapa";
import { apiPedidosWeb } from "../../lib/pedidosWeb/apiPrivada";
import { EVENTO_PEDIDOS_WEB } from "../../lib/pedidosWeb/contador";
import type { CodigoRechazo, PedidoWeb } from "../../lib/pedidosWeb/tipos";
import { leerMonto, montoParaEditar } from "../../lib/montoTecleado";
import { Telefono } from "../../lib/telefono";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { MOTIVOS_RECHAZO, haceCuanto, totalDe } from "./logica";

// MapLibre (~1 MB) se baja recién cuando se abre un pedido con ubicación.
const MapaPedido = lazy(() => import("../pagina/MapaSeguimiento"));

type Modo = "ver" | "aceptar" | "rechazar";

/**
 * El detalle de un pedido web (13-nov), en la misma pantalla que la bandeja y
 * no en una hoja encima: productos, nota, cliente (con llamar y WhatsApp), el
 * mapa con el pin, la distancia, cómo paga y el envío sugerido.
 *
 * Una barra fija abajo con la acción principal. Aceptar y Rechazar abren su
 * formulario ACÁ, reemplazando la barra, sin apilar nada.
 */
export default function DetallePedidoWeb({
  fila,
  onVolver,
  onHecho,
  onConflicto,
}: {
  /** La fila de la bandeja: se ve de inmediato mientras llega el detalle. */
  fila: PedidoWeb;
  onVolver: () => void;
  /** Se aceptó o rechazó: vuelve a la lista con este aviso. */
  onHecho: (mensaje: string) => void;
  /** Alguien más ya lo tomó (409) o ya no espera: vuelve a la lista con este error. */
  onConflicto: (mensaje: string) => void;
}) {
  const { negocio } = useAuth();
  const detalle = useApi(() => apiPedidosWeb.detalle(fila.id), [fila.id]);
  const p: PedidoWeb = { ...fila, ...(detalle.datos ?? {}) };
  const [modo, setModo] = useState<Modo>("ver");
  const esNuevo = p.estado === "NUEVO";
  const delivery = p.tipo === "DELIVERY";

  const tel = Telefono.paraLlamada(p.telefono);
  const wa = Telefono.paraWhatsApp(p.telefono);
  const mensaje = `Hola ${p.nombre}, te escribimos de ${negocio?.nombre ?? "el local"} por tu pedido N° ${String(p.numero).padStart(2, "0")}.`;
  const pin = p.latitud != null && p.longitud != null ? { latitud: p.latitud, longitud: p.longitud } : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-5 pb-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onVolver}
          aria-label="Volver a los pedidos"
          className="rounded-lg p-1.5 text-texto-2 hover:bg-muted"
        >
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-texto">
            Pedido N° {String(p.numero).padStart(2, "0")} · {p.nombre}
          </h1>
          <p className="text-[13px] text-texto-3">
            {haceCuanto(p.creadoEn)}
            {p.sucursal ? ` · ${p.sucursal}` : ""}
          </p>
        </div>
        <Badge tono={delivery ? "azul" : "morado"}>{delivery ? "Delivery" : "Recoger"}</Badge>
      </div>

      {!esNuevo && (
        <div className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-2">
          {p.estado === "ACEPTADO" && `Aceptado${p.aceptadoPor ? ` por ${p.aceptadoPor}` : ""}${p.repartidor ? ` · lo lleva ${p.repartidor.nombre}` : ""}.`}
          {p.estado === "RECHAZADO" && `Rechazado${p.motivoRechazo ? `: ${p.motivoRechazo}` : ""}.`}
          {p.estado === "VENCIDO" && "Venció: nadie lo respondió a tiempo."}
          {p.estado === "CANCELADO" && "Lo canceló el cliente."}
        </div>
      )}

      <section className="card space-y-3 p-4" aria-label="Cliente">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-texto">{p.nombre}</p>
            <p className="text-[13px] text-texto-3">{Telefono.paraMostrar(p.telefono)}</p>
          </div>
          {tel && wa && (
            <div className="flex shrink-0 gap-2">
              <a
                href={`tel:${tel}`}
                className="flex items-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-2.5 text-[13px] font-semibold text-texto-2 hover:bg-muted"
              >
                <Icon name="phone" size={15} /> Llamar
              </a>
              <a
                href={enlaceWhatsApp(wa, mensaje)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-borde bg-white px-3 py-2.5 text-[13px] font-semibold text-texto-2 hover:bg-muted"
              >
                <Icon name="phone" size={15} /> WhatsApp
              </a>
            </div>
          )}
        </div>
      </section>

      <section className="card p-4" aria-label="Productos">
        {detalle.cargando && p.lineas.length === 0 ? (
          <Cargando />
        ) : (
          <ul className="divide-y divide-borde-soft">
            {p.lineas.map((l, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-2.5">
                <p className="text-sm text-texto">
                  <span className="font-bold">{fmtNum(l.cantidad)}×</span> {l.titulo}
                </p>
                <span className="shrink-0 text-sm font-bold">{fmtMoney(l.subtotal)}</span>
              </li>
            ))}
          </ul>
        )}
        {p.nota && (
          <p className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-[13px] italic text-warning-text">Nota del cliente: {p.nota}</p>
        )}
        <dl className="mt-3 space-y-1 border-t border-borde pt-3 text-sm">
          <div className="flex justify-between text-texto-2">
            <dt>Productos</dt>
            <dd>{fmtMoney(p.subtotal)}</dd>
          </div>
          {delivery && (
            <div className="flex justify-between text-texto-2">
              <dt>Envío sugerido{p.distanciaKm != null ? ` (${fmtNum(p.distanciaKm)} km)` : ""}</dt>
              <dd>{fmtMoney(p.envioSugerido)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-borde pt-1.5 text-base font-extrabold text-texto">
            <dt>Total</dt>
            <dd>{fmtMoney(totalDe(p))}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[13px] text-texto-2">
          Paga con <strong>{p.formaPago === "QR" ? "QR" : "efectivo"}</strong>
          {p.formaPago === "EFECTIVO" && p.pagaCon != null && (
            <>
              : trae {fmtMoney(p.pagaCon)}, cambio {fmtMoney(Math.max(0, Math.round((p.pagaCon - totalDe(p)) * 100) / 100))}
            </>
          )}
          .
        </p>
      </section>

      {delivery && (
        <section className="card space-y-3 p-4" aria-label="Entrega">
          <div>
            <p className="text-sm font-bold text-texto">{p.direccion}</p>
            {p.referencia && <p className="text-[13px] text-texto-3">{p.referencia}</p>}
          </div>
          {pin ? (
            <>
              <Suspense fallback={<div className="h-56 rounded-2xl bg-muted" />}>
                <MapaPedido destino={pin} local={null} moto={null} color="#047857" etiquetaDestino="El cliente" alto={220} />
              </Suspense>
              <a
                href={urlRuta({ lat: pin.latitud, lng: pin.longitud })}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-700 hover:underline"
              >
                <Icon name="pin" size={15} /> Abrir el pin en Google Maps
              </a>
              {p.precisionM != null && p.precisionM > 100 && (
                <p className="text-xs text-warning-text">El cliente usó su GPS con poca precisión (±{p.precisionM} m): confirmá la dirección por WhatsApp.</p>
              )}
            </>
          ) : (
            <p className="text-[13px] text-texto-3">Sin ubicación en el mapa: guiate por la dirección.</p>
          )}
        </section>
      )}

      {modo === "aceptar" && esNuevo && (
        <FormAceptar pedido={p} onCancelar={() => setModo("ver")} onHecho={onHecho} onConflicto={onConflicto} />
      )}
      {modo === "rechazar" && esNuevo && (
        <FormRechazar pedido={p} onCancelar={() => setModo("ver")} onHecho={onHecho} onConflicto={onConflicto} />
      )}

      {/* La barra fija: una acción principal. Con el formulario abierto, sus botones van en él. */}
      {esNuevo && modo === "ver" && (
        <div className="sticky bottom-0 -mx-5 flex gap-2 border-t border-borde bg-white/95 px-5 pb-3 pt-3 backdrop-blur">
          <Boton variante="ghost" className="min-h-12 flex-1" onClick={() => setModo("rechazar")}>
            Rechazar
          </Boton>
          <Boton className="min-h-12 flex-[2]" icono="check" onClick={() => setModo("aceptar")}>
            Aceptar pedido
          </Boton>
        </div>
      )}
    </div>
  );
}

/** Si el cuerpo del error es un 409 o un «ya no está esperando», el pedido ya no es de esta caja. */
function esConflicto(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 409;
}

function avisarCambio() {
  window.dispatchEvent(new Event(EVENTO_PEDIDOS_WEB));
}

function FormAceptar({
  pedido,
  onCancelar,
  onHecho,
  onConflicto,
}: {
  pedido: PedidoWeb;
  onCancelar: () => void;
  onHecho: (m: string) => void;
  onConflicto: (m: string) => void;
}) {
  const delivery = pedido.tipo === "DELIVERY";
  const repartidores = useApi(() => (delivery ? api.getRepartidores() : Promise.resolve([])), [delivery]);
  const [repartidorId, setRepartidorId] = useState("");
  const [envio, setEnvio] = useState(montoParaEditar(pedido.envioSugerido));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const tarifa = delivery ? leerMonto(envio) : 0;
  const cambio = delivery && tarifa != null && Math.abs(tarifa - pedido.envioSugerido) > 0.004;
  const lista = useMemo(() => repartidores.datos ?? [], [repartidores.datos]);
  // Un solo repartidor: ya viene elegido.
  useEffect(() => {
    if (!repartidorId && lista.length === 1) setRepartidorId(String(lista[0].id));
  }, [lista, repartidorId]);

  let falta = "";
  if (delivery && !repartidorId) falta = "Elegí quién lo lleva.";
  else if (tarifa == null || tarifa < 0) falta = "Escribí el envío.";
  else if (cambio && motivo.trim().length < 3) falta = "Contá en pocas palabras por qué cambiás el envío.";

  async function aceptar() {
    if (falta || enviando || tarifa == null) return;
    setError("");
    setEnviando(true);
    try {
      await apiPedidosWeb.aceptar(pedido.id, {
        ...(delivery ? { repartidorId: Number(repartidorId) } : {}),
        tarifaEnvio: tarifa,
        ...(cambio ? { motivoTarifa: motivo.trim() } : {}),
      });
      avisarCambio();
      onHecho(`Aceptaste el pedido N° ${String(pedido.numero).padStart(2, "0")}.`);
    } catch (e) {
      avisarCambio();
      // «Ya lo aceptó Rosa»: se avisa en la lista, que se refresca sola.
      if (esConflicto(e)) onConflicto(e.message);
      else setError(e instanceof Error ? e.message : "No se pudo aceptar el pedido");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card space-y-3 p-4" aria-label="Aceptar el pedido">
      <h2 className="text-sm font-bold text-texto">Aceptar el pedido</h2>
      {delivery && (
        <>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">¿Quién lo lleva?</span>
            <Select aria-label="Repartidor" value={repartidorId} onChange={(e) => setRepartidorId(e.target.value)}>
              <option value="">Elegí un repartidor</option>
              {lista.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </Select>
            {!repartidores.cargando && lista.length === 0 && (
              <span className="mt-1 block text-xs text-danger-text">No hay repartidores cargados: creá un usuario con el rol Repartidor.</span>
            )}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">Envío (sugerido {fmtMoney(pedido.envioSugerido)})</span>
            <InputMonto aria-label="Envío" value={envio} onChange={setEnvio} className="w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm" />
          </label>
          {cambio && (
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">¿Por qué cambiás el envío?</span>
              <Input aria-label="Motivo del envío" value={motivo} maxLength={80} placeholder="Calle en obra, está lejos…" onChange={(e) => setMotivo(e.target.value)} />
            </label>
          )}
        </>
      )}
      {!delivery && <p className="text-[13px] text-texto-3">Es para recoger: no lleva repartidor ni envío. Se arma la venta y el cliente lo retira.</p>}
      <p className="text-xs text-texto-3">Se crea la venta en tu caja abierta de esa sucursal.</p>
      <ErrorMsg>{error}</ErrorMsg>
      <div className="flex gap-2">
        <Boton variante="ghost" className="min-h-12 flex-1" onClick={onCancelar} disabled={enviando}>
          Volver
        </Boton>
        <Boton className="min-h-12 flex-[2]" icono="check" onClick={aceptar} disabled={!!falta || enviando}>
          {enviando ? "Aceptando…" : falta ? falta : "Aceptar pedido"}
        </Boton>
      </div>
    </section>
  );
}

function FormRechazar({
  pedido,
  onCancelar,
  onHecho,
  onConflicto,
}: {
  pedido: PedidoWeb;
  onCancelar: () => void;
  onHecho: (m: string) => void;
  onConflicto: (m: string) => void;
}) {
  const [codigo, setCodigo] = useState<CodigoRechazo | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const otro = codigo === "OTRO";
  const falta = !codigo ? "Elegí un motivo." : otro && motivo.trim().length < 3 ? "Escribí el motivo." : "";

  async function rechazar() {
    if (falta || !codigo || enviando) return;
    setError("");
    setEnviando(true);
    try {
      await apiPedidosWeb.rechazar(pedido.id, { codigo, ...(otro ? { motivo: motivo.trim() } : {}) });
      avisarCambio();
      onHecho(`Rechazaste el pedido N° ${String(pedido.numero).padStart(2, "0")}. El cliente ya lo ve.`);
    } catch (e) {
      avisarCambio();
      if (esConflicto(e)) onConflicto(e.message);
      else setError(e instanceof Error ? e.message : "No se pudo rechazar el pedido");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="card space-y-3 p-4" aria-label="Rechazar el pedido">
      <h2 className="text-sm font-bold text-texto">¿Por qué lo rechazás?</h2>
      <p className="text-[13px] text-texto-3">El cliente ve el motivo en su pantalla.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Motivo">
        {MOTIVOS_RECHAZO.map(([k, texto]) => (
          <button
            key={k}
            type="button"
            aria-pressed={codigo === k}
            onClick={() => setCodigo(k)}
            className={`whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              codigo === k ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            {texto}
          </button>
        ))}
      </div>
      {otro && <Input aria-label="Motivo" value={motivo} maxLength={120} placeholder="Contale al cliente qué pasó" onChange={(e) => setMotivo(e.target.value)} />}
      <ErrorMsg>{error}</ErrorMsg>
      <div className="flex gap-2">
        <Boton variante="ghost" className="min-h-12 flex-1" onClick={onCancelar} disabled={enviando}>
          Volver
        </Boton>
        <Boton variante="danger" className="min-h-12 flex-[2]" onClick={rechazar} disabled={!!falta || enviando}>
          {enviando ? "Rechazando…" : falta ? falta : "Rechazar pedido"}
        </Boton>
      </div>
    </section>
  );
}
