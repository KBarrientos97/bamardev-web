import { useState } from "react";
import { Icon } from "../../../components/Icon";
import { Vacio } from "../../../components/ui";
import { fmtMoney } from "../../../lib/format";
import { tarifaVigente, type EstadoBillar } from "../store";
import type { Mesa } from "../tipos";
import { ChipFiltro } from "../ui";
import { estadoAdminDe, type EstadoAdmin } from "./borrador";
import { Cifra } from "./piezas";

/**
 * Mesas de billar → Mesas (§7.14): las tarjetas de todas las mesas, con su
 * tipo, su tarifa y su estado. Tocar una la abre para editar.
 */

const ESTADO_ADMIN: Record<EstadoAdmin, { texto: string; clase: string; icono: "checkCirculo" | "llave" | "pausa" }> = {
  activa: { texto: "Activa", clase: "bg-primary-50 text-primary-700", icono: "checkCirculo" },
  fuera: { texto: "Fuera de servicio", clase: "bg-slate-100 text-slate-500", icono: "llave" },
  inactiva: { texto: "Inactiva", clase: "bg-slate-100 text-slate-500", icono: "pausa" },
};

export function TabMesas({
  e,
  editando,
  onEditar,
}: {
  e: EstadoBillar;
  /** La que está abierta en el formulario, para marcarla. */
  editando: number | null;
  onEditar: (id: number) => void;
}) {
  const [filtro, setFiltro] = useState<string>("todas");
  const [busqueda, setBusqueda] = useState("");
  const tipos = Object.values(e.tipos);
  const mesas = e.admin.mesas;
  const inactivas = mesas.filter((m) => m.inactiva).length;

  const pasa = (m: Mesa) => {
    const estado = estadoAdminDe(m);
    if (filtro === "fuera" && estado !== "fuera") return false;
    if (filtro === "inactiva" && estado !== "inactiva") return false;
    if (filtro.startsWith("tipo:") && m.tipo !== filtro.slice(5)) return false;
    const q = busqueda.trim().toLowerCase();
    return !q || `mesa ${m.id}`.includes(q) || String(m.id) === q || (m.alias ?? "").toLowerCase().includes(q);
  };
  const visibles = mesas.filter(pasa);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Cifra icono="numeral" tono="verde" etiqueta="Total" valor={mesas.length} />
        <Cifra
          icono="checkCirculo"
          tono="verde"
          etiqueta="Activas"
          valor={mesas.filter((m) => estadoAdminDe(m) === "activa").length}
        />
        <Cifra
          icono="llave"
          tono="gris"
          etiqueta="Fuera de servicio"
          valor={mesas.filter((m) => estadoAdminDe(m) === "fuera").length}
        />
        <Cifra icono="bola" tono="azul" etiqueta="Tipos" valor={tipos.length} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="relative sm:w-72">
          <span className="sr-only">Buscar mesa</span>
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-texto-4">
            <Icon name="search" size={17} />
          </span>
          <input
            value={busqueda}
            onChange={(ev) => setBusqueda(ev.target.value)}
            placeholder="Buscar mesa"
            className="h-10 w-full rounded-full border border-borde bg-white pl-10 pr-4 text-sm outline-none placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100"
          />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <ChipFiltro activo={filtro === "todas"} etiqueta="Todas" onClick={() => setFiltro("todas")} />
          {tipos.map((t) => (
            <ChipFiltro
              key={t.id}
              activo={filtro === `tipo:${t.id}`}
              etiqueta={t.nombre}
              onClick={() => setFiltro(`tipo:${t.id}`)}
            />
          ))}
          <ChipFiltro activo={filtro === "fuera"} etiqueta="Fuera de servicio" onClick={() => setFiltro("fuera")} />
          {inactivas > 0 && (
            <ChipFiltro activo={filtro === "inactiva"} etiqueta="Inactivas" onClick={() => setFiltro("inactiva")} />
          )}
        </div>
      </div>

      {visibles.length === 0 ? (
        <Vacio
          icono="numeral"
          titulo={mesas.length === 0 ? "Todavía no hay mesas" : "No hay mesas acá"}
          texto={
            mesas.length === 0
              ? "Creá la primera con Nueva mesa."
              : busqueda
                ? `Ninguna mesa coincide con "${busqueda}".`
                : "Probá con otro filtro."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {visibles.map((m) => (
            <TarjetaAdmin
              key={m.id}
              m={m}
              e={e}
              elegida={m.id === editando}
              onClick={() => onEditar(m.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TarjetaAdmin({ m, e, elegida, onClick }: { m: Mesa; e: EstadoBillar; elegida: boolean; onClick: () => void }) {
  const t = tarifaVigente(e, m);
  const estado = estadoAdminDe(m);
  const est = ESTADO_ADMIN[estado];
  const apagada = estado !== "activa";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Editar Mesa ${m.id}`}
      className={`card group flex flex-col p-4 text-left transition-shadow hover:shadow-md ${
        apagada ? "bg-slate-50/80" : ""
      } ${elegida ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex w-full items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold tabular-nums ${
            apagada ? "bg-slate-100 text-slate-400" : "bg-primary-50 text-primary-700"
          }`}
        >
          {m.id}
        </span>
        <div className={`min-w-0 flex-1 ${apagada ? "opacity-60" : ""}`}>
          <p className="text-[15px] font-bold text-texto">Mesa {m.id}</p>
          <p className="truncate text-[13px] text-texto-3">{m.alias || "Sin apodo"}</p>
        </div>
        <span className="text-texto-4 group-hover:text-texto-2">
          <Icon name="edit" size={17} />
        </span>
      </div>
      <div className="mt-3 flex w-full flex-wrap items-center gap-2">
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{t.nombre}</span>
        <span className={`text-[13px] font-bold tabular-nums ${apagada ? "text-texto-3" : "text-primary-700"}`}>
          {fmtMoney(t.tarifa)}/h
        </span>
        {m.tarifaPropia && <span className="text-[11px] text-texto-4">propia</span>}
        <span
          className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${est.clase}`}
        >
          <Icon name={est.icono} size={12} strokeWidth={2.5} />
          {est.texto}
        </span>
      </div>
      {estado === "fuera" && m.fueraMotivo && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-texto-4">
          <Icon name="llave" size={13} />
          {m.fueraMotivo}
        </p>
      )}
      {m.estado === "abierta" && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-primary-700">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          En juego ahora
        </p>
      )}
    </button>
  );
}
