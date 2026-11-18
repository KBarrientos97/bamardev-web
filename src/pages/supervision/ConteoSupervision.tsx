import { useState } from "react";
import { AvisoOk, Boton, ErrorMsg, Modal, useAviso } from "../../components/ui";
import { api } from "../../lib/api";
import { nombreConteo } from "../../lib/conteo";
import { fmtNum } from "../../lib/format";
import type { EstadoConteoSucursal, ItemConteoSucursal } from "../../types";
import { BotonB, Tarjeta } from "../billar/ui";
import { cuando } from "./Supervision.datos";

/**
 * «Vasos en Las Brisas» (17-nov): cuántos quedan de cada categoría contada en
 * el local que mira el dueño, y el botón para reponer.
 *
 * Reponer SUMA al saldo (no lo fija): el dueño llega con una caja de vasos y
 * dice cuántos trae, no tiene que saber cuántos quedaban en ese instante. Fijar
 * el total es cosa de la apertura, que es cuando el cajero cuenta con las manos
 * en el cajón; por eso acá no hay un campo para «poner 100».
 *
 * Un negativo se pinta en rojo: se vendió más de lo que se había contado.
 */
export default function ConteoSupervision({
  conteo,
  sucursal,
  ahora,
  onCambio,
}: {
  conteo: EstadoConteoSucursal;
  /** El nombre del local que se mira. */
  sucursal: string;
  /** La hora del servidor (para el «lun 09:00» del conteo). */
  ahora: number;
  /** Después de reponer: que la Supervisión vuelva a pedir lo suyo. */
  onCambio: () => void;
}) {
  const nombre = nombreConteo(conteo.nombre);
  const [reponiendo, setReponiendo] = useState(false);
  const [aviso, setAviso] = useAviso(8000);

  return (
    <Tarjeta
      icono="box"
      titulo={`${nombre} en ${sucursal}`}
      extra={
        <BotonB icono="plus" onClick={() => setReponiendo(true)}>
          Reponer
        </BotonB>
      }
      cuerpo="p-0"
    >
      {aviso && (
        <div className="px-4 pt-3 sm:px-5">
          <AvisoOk>{aviso}</AvisoOk>
        </div>
      )}
      <ul className="divide-y divide-borde-soft">
        {conteo.items.map((i) => (
          <li key={i.categoriaId} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-texto">{i.nombre}</p>
              <p className="text-[12px] text-texto-3">{detalle(i, ahora)}</p>
            </div>
            <div className="shrink-0 text-right">
              {i.quedan == null ? (
                <p className="text-sm font-semibold text-texto-3">Sin contar</p>
              ) : (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Quedan</p>
                  <p className={`text-xl font-extrabold leading-tight tabular-nums ${i.quedan < 0 ? "text-danger-text" : "text-texto"}`}>
                    {fmtNum(i.quedan)}
                  </p>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {reponiendo && (
        <ReponerConteo
          conteo={conteo}
          sucursal={sucursal}
          onClose={() => setReponiendo(false)}
          onListo={(total) => {
            setReponiendo(false);
            setAviso(`Listo: se repusieron ${fmtNum(total)} ${nombre.toLocaleLowerCase("es")}.`);
            onCambio();
          }}
        />
      )}
    </Tarjeta>
  );
}

/** «Contados 100 · lun 09:00 · vendidos 80 · repuestos 0», o por qué no hay conteo. */
function detalle(i: ItemConteoSucursal, ahora: number): string {
  if (i.contado == null || i.contadoEn == null) return "Todavía no se contó en este local";
  return `Contados ${fmtNum(i.contado)} · ${cuando(i.contadoEn, ahora)} · vendidos ${fmtNum(i.vendido)} · repuestos ${fmtNum(i.repuesto)}`;
}

function ReponerConteo({
  conteo,
  sucursal,
  onClose,
  onListo,
}: {
  conteo: EstadoConteoSucursal;
  sucursal: string;
  onClose: () => void;
  /** Con cuántas unidades se repuso en total. */
  onListo: (total: number) => void;
}) {
  const nombre = nombreConteo(conteo.nombre);
  const [agregar, setAgregar] = useState<Record<number, number>>({});
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const lineas = conteo.items
    .map((i) => ({ categoriaId: i.categoriaId, cantidad: agregar[i.categoriaId] ?? 0 }))
    .filter((l) => l.cantidad > 0);
  const total = lineas.reduce((acc, l) => acc + l.cantidad, 0);

  const fijar = (id: number, valor: number) =>
    setAgregar((a) => ({ ...a, [id]: Math.min(100_000, Math.max(0, Math.floor(valor) || 0)) }));

  async function guardar() {
    if (lineas.length === 0 || procesando) return;
    setProcesando(true);
    setError("");
    try {
      await api.reponerConteo({ sucursalId: conteo.sucursalId, lineas });
      onListo(total);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo guardar. Probá de nuevo.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={`Reponer ${nombre.toLocaleLowerCase("es")}`}
      subtitulo={sucursal}
      onClose={onClose}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={procesando}>
            Cancelar
          </Boton>
          <Boton onClick={() => void guardar()} disabled={procesando || lineas.length === 0}>
            {procesando ? "Guardando…" : total > 0 ? `Reponer ${fmtNum(total)}` : "Reponer"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-texto-3">Escribí cuántos agregás: se suman a lo que queda, no lo reemplazan.</p>
        <ErrorMsg>{error}</ErrorMsg>
        <ul className="divide-y divide-borde-soft">
          {conteo.items.map((i) => {
            const n = agregar[i.categoriaId] ?? 0;
            return (
              <li key={i.categoriaId} className="py-2.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-texto-2">{i.nombre}</span>
                    <span className="block text-[12px] text-texto-3">
                      {i.quedan == null ? "sin contar todavía" : `quedan ${fmtNum(i.quedan)}`}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => fijar(i.categoriaId, n - 1)}
                    disabled={n === 0}
                    aria-label={`Quitar uno de ${i.nombre}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-borde text-texto-2 disabled:opacity-40"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    value={n === 0 ? "" : n}
                    onChange={(e) => fijar(i.categoriaId, Number(e.target.value))}
                    placeholder="0"
                    aria-label={`Agregar de ${i.nombre}`}
                    className="w-16 rounded-lg border border-borde px-2 py-1 text-center text-[13px] outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => fijar(i.categoriaId, n + 1)}
                    aria-label={`Agregar uno de ${i.nombre}`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-borde text-texto-2"
                  >
                    +
                  </button>
                </div>
                {/* Sin contar, lo repuesto es el primer conteo: el total arranca en lo que se agrega. */}
                {n > 0 && (
                  <p className="mt-1 text-right text-[12px] font-semibold text-primary-700">
                    → quedan {fmtNum((i.quedan ?? 0) + n)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
