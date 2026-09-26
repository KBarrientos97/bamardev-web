import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { Boton, Cargando, ErrorMsg, Modal, Vacio } from "../../components/ui";
import { fmtFecha, fmtMoney, fmtNum } from "../../lib/format";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import type { ContadorTramo, LotePorVencer, TramoVencimiento } from "../../types";
import { TRAMOS, textoVida, type FiltroVencimientos } from "./medicamento";
import type { PrecargaSalida } from "./mercaderia";

/**
 * Vencimientos: la pantalla que evita que la plata se pudra en el estante.
 *
 * Es la única de farmacia que **no** sirve para atender a alguien: sirve para
 * decidir. Por eso lo primero que se ve no es una lista sino un número —cuánto
 * cuesta lo que está por vencer— y recién después qué lo compone. "9 lotes por
 * vencer" no mueve a nadie; "Bs 2.807 que se te vencen en tres meses" sí.
 *
 * El orden de la lista es el orden en el que hay que actuar: primero lo que ya
 * venció (sacarlo del estante hoy), después lo que vence en 30 días (devolver
 * al proveedor o rematar), y así.
 */

/** El tramo con el que se llega desde el Dashboard; cualquier otra cosa, ninguno. */
function tramoDe(state: unknown): TramoVencimiento | null {
  const t = (state as Partial<FiltroVencimientos> | null)?.tramo;
  return TRAMOS.some((x) => x.clave === t) ? (t as TramoVencimiento) : null;
}

export default function Vencimientos() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const datos = useApi(() => api.vencimientos(), []);
  const [tramo, setTramo] = useState<TramoVencimiento | null>(() => tramoDe(state));
  const [elegido, setElegido] = useState<LotePorVencer | null>(null);

  /**
   * Del lote a la baja, sin volver a escribir nada. Se abre el formulario de
   * salida cargado —almacén, motivo, producto y las unidades que quedan— pero
   * NO se guarda: la baja la firma una persona, y de paso puede corregir la
   * cantidad si en el estante hay menos de lo que dice el sistema.
   */
  function darDeBaja(l: LotePorVencer, motivo: string) {
    const precarga: PrecargaSalida = {
      productoId: l.producto.id,
      almacenId: l.almacen.id,
      cantidad: l.cantidad,
      motivo,
    };
    navigate("/inventario/movimientos/salida", { state: precarga });
  }

  const detalle = datos.datos?.detalle ?? [];
  const filtrado = useMemo(
    () => (tramo ? detalle.filter((d) => d.tramo === tramo) : detalle),
    [detalle, tramo],
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Vencimientos"
        subtitulo="Los lotes ordenados por lo que vence primero"
      />

      <ErrorMsg>{datos.error}</ErrorMsg>

      {datos.cargando ? (
        <Cargando texto="Revisando los lotes…" />
      ) : !datos.datos ? null : (
        <>
          {/* El número que le habla al dueño. Va arriba de todo y en grande:
              es la razón por la que esta pantalla existe. */}
          <div className="card flex flex-wrap items-baseline justify-between gap-2 p-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
                Valor en riesgo
              </p>
              <p className="text-3xl font-extrabold text-texto">
                {fmtMoney(datos.datos.valorEnRiesgo)}
              </p>
            </div>
            <p className="max-w-xs text-[13px] text-texto-3">
              Lo que costó la mercadería que ya venció o vence dentro de los
              próximos 90 días.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {TRAMOS.map((t) => (
              <Contador
                key={t.clave}
                tramo={t}
                datos={datos.datos![t.campo]}
                activo={tramo === t.clave}
                onClick={() => setTramo(tramo === t.clave ? null : t.clave)}
              />
            ))}
          </div>

          {filtrado.length === 0 ? (
            <div className="card">
              <Vacio
                icono="calendar"
                titulo={tramo ? "Nada en este tramo" : "Nada por vencer"}
                texto={
                  tramo
                    ? "Tocá el contador de nuevo para ver todos."
                    : "Ningún lote vence en los próximos 90 días. Los lotes se cargan al ingresar mercadería."
                }
              />
            </div>
          ) : (
            <div className="card overflow-hidden">
              <ul className="divide-y divide-borde-soft">
                {filtrado.map((l) => (
                  <Fila
                    key={`${l.loteId}-${l.almacen.id}`}
                    lote={l}
                    onClick={() => setElegido(l)}
                  />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {elegido && (
        <DetalleLote
          lote={elegido}
          onClose={() => setElegido(null)}
          onDarDeBaja={(motivo) => darDeBaja(elegido, motivo)}
        />
      )}
    </div>
  );
}

function Contador({
  tramo: t,
  datos,
  activo,
  onClick,
}: {
  tramo: (typeof TRAMOS)[number];
  datos: ContadorTramo;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`card p-4 text-left transition-shadow hover:shadow-md ${
        activo ? "ring-2 ring-primary" : ""
      }`}
    >
      <p className={`text-3xl font-extrabold ${datos.lotes ? t.texto : "text-texto-4"}`}>
        {datos.lotes}
      </p>
      <p className="text-[13px] font-bold text-texto">{t.titulo}</p>
      <p className="text-xs text-texto-3">
        {datos.lotes ? fmtMoney(datos.valor) : t.ayuda}
      </p>
    </button>
  );
}

function Fila({ lote: l, onClick }: { lote: LotePorVencer; onClick: () => void }) {
  const t = TRAMOS.find((x) => x.clave === l.tramo) ?? TRAMOS[3];

  return (
    <li>
      <button
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
      >
        {/* La barra de color a la izquierda: deja leer la urgencia de la lista
            entera sin detenerse en cada fila. */}
        <span aria-hidden className={`h-10 w-1 shrink-0 rounded-full ${t.barra}`} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-texto">{l.producto.nombre}</p>
          <p className="truncate text-[13px] text-texto-3">
            Lote {l.codigo}
            {l.producto.laboratorio && ` · ${l.producto.laboratorio}`}
            {l.almacen && ` · ${l.almacen.nombre}`}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className={`text-[13px] font-bold ${t.texto}`}>{textoVida(l.diasRestantes)}</p>
          <p className="text-xs text-texto-3">{fmtFecha(l.vencimiento ?? "")}</p>
        </div>

        <div className="hidden shrink-0 text-right sm:block">
          <p className="text-[13px] font-bold text-texto">{fmtMoney(l.valor)}</p>
          <p className="text-xs text-texto-3">{fmtNum(l.cantidad)} u.</p>
        </div>

        <Icon name="chevronRight" size={16} className="shrink-0 text-texto-4" />
      </button>
    </li>
  );
}

/**
 * El lote, abierto.
 *
 * La lista contesta "qué se está por perder"; esto contesta "cuál es y qué hago
 * con él". Por eso no es una ficha de sólo lectura: las dos salidas que tiene un
 * lote que vence —darlo de baja o devolverlo al proveedor— son botones, y dejan
 * el formulario de salida cargado con todo puesto.
 *
 * En una tabla de seis columnas esto serían seis columnas más, y en un teléfono
 * no entra ninguna. Acá la lista se queda simple y el detalle aparece cuando se
 * lo pide.
 */
function DetalleLote({
  lote: l,
  onClose,
  onDarDeBaja,
}: {
  lote: LotePorVencer;
  onClose: () => void;
  onDarDeBaja: (motivo: string) => void;
}) {
  const t = TRAMOS.find((x) => x.clave === l.tramo) ?? TRAMOS[3];
  const vencido = l.diasRestantes < 0;

  return (
    <Modal
      abierto
      titulo={l.producto.nombre}
      onClose={onClose}
      encabezado={
        <div className={`px-5 pb-4 pt-5 ${t.barra} text-white`}>
          <p className="pr-12 text-xl font-bold leading-tight">{l.producto.nombre}</p>
          <p className="mt-0.5 text-[13px] text-white/85">
            Lote {l.codigo}
            {l.producto.laboratorio && ` · ${l.producto.laboratorio}`}
          </p>
          <span className="mt-2.5 inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
            {textoVida(l.diasRestantes)} · {t.ayuda}
          </span>
        </div>
      }
      acciones={
        <>
          <Boton variante="ghost" icono="truck" onClick={() => onDarDeBaja("Devolución a proveedor")}>
            Devolver al proveedor
          </Boton>
          <Boton variante="danger" icono="trendingDown" onClick={() => onDarDeBaja("Vencimiento")}>
            Dar de baja
          </Boton>
        </>
      }
    >
      <div className="space-y-4 p-4 sm:p-5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">
          <Dato titulo="Vence" valor={fmtFecha(l.vencimiento ?? "")} />
          <Dato titulo="Dónde está" valor={l.almacen.nombre} />
          <Dato titulo="Queda" valor={`${fmtNum(l.cantidad)} u.`} />
          <Dato
            titulo="Costo unitario"
            valor={l.costoUnitario === null ? "—" : fmtMoney(l.costoUnitario)}
          />
        </dl>

        {/* La plata, sola y abajo: es la que decide si conviene rematarlo o
            devolverlo, y se compara con el total de arriba. */}
        <div className={`rounded-xl px-4 py-3 ${t.fondo}`}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-texto-4">
            Valor inmovilizado
          </p>
          <p className={`text-2xl font-extrabold ${t.texto}`}>{fmtMoney(l.valor)}</p>
        </div>

        <p className="text-[13px] leading-relaxed text-texto-3">
          {vencido
            ? "Este lote ya no se puede vender. Al darlo de baja queda el movimiento con el motivo, que es lo que después arma el número de mermas."
            : "Todavía se puede vender. Muchas droguerías reciben devoluciones con dos o tres meses de anticipación: si va a volver, conviene mandarlo ahora."}{" "}
          La baja se carga como un movimiento PENDIENTE: el stock recién se mueve
          cuando alguien la aprueba.
        </p>
      </div>
    </Modal>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-texto-4">
        {titulo}
      </dt>
      <dd className="text-[15px] font-semibold text-texto">{valor}</dd>
    </div>
  );
}
