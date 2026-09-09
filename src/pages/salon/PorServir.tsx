import { useState } from "react";
import { Boton, Cargando, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtNum } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { hace, porServir } from "./logicaSalon";

/**
 * Lo que falta llevar a las mesas.
 *
 * Es la lista de trabajo del mesero: mientras tenga algo acá, tiene algo que
 * hacer. Muestra las comandas de TODAS las mesas y no sólo las suyas — si un
 * compañero está en la cocina y el plato se enfría en el pase, el que pasa lo
 * lleva.
 *
 * Una sola lista y no dos secciones ("listos" / "en cocina"): hoy no hay panel
 * de cocina, así que todo entra como "en cocina" y la sección de arriba
 * quedaría siempre vacía. El orden hace el trabajo — primero lo que ya está
 * listo, después lo más viejo — y el estado se lee en el color del badge.
 */
export default function PorServir() {
  const salon = useApi(() => api.salon(), []);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const filas = porServir(salon.datos?.mesas ?? []);

  async function servir(mesaId: number, comandaId: string | number) {
    if (procesando) return;
    setError("");
    setProcesando(true);
    try {
      await api.marcarComandaServida(mesaId, Number(comandaId));
      salon.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-fondo">
      <header className="border-b border-borde bg-white px-4 py-3">
        <h1 className="text-lg font-extrabold text-texto">Por servir</h1>
        <p className="text-xs text-texto-3">
          {filas.length === 0
            ? "No hay nada esperando. Todo servido."
            : filas.length === 1
              ? "1 pedido para llevar a la mesa"
              : `${filas.length} pedidos para llevar a las mesas`}
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {error && <ErrorMsg>{error}</ErrorMsg>}
        {salon.error && <ErrorMsg>{salon.error}</ErrorMsg>}
        {salon.cargando && !salon.datos ? (
          <Cargando />
        ) : filas.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-texto-3">
            No hay nada esperando. Todo servido.
          </p>
        ) : (
          filas.map(({ mesa, comanda }) => {
            const lista = comanda.estado === "LISTA";
            return (
              <div
                key={`${mesa.id}-${comanda.id}`}
                className="mb-2 flex items-center gap-3 rounded-xl border border-borde bg-white p-3"
              >
                {/* El cuadro de la mesa toma el color del estado: verde cuando
                    la cocina ya lo dejó listo, ámbar mientras se cocina. Es lo
                    único que el mesero necesita para saber a dónde caminar, y
                    tiene que leerse sin frenar. */}
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-extrabold ${
                    lista ? "bg-[#ECFDF5] text-[#059669]" : "bg-[#FFFBEB] text-[#D97706]"
                  }`}
                >
                  {mesa.codigo}
                </span>

                <div className="min-w-0 flex-1">
                  {/* Los productos resumidos en una línea: es lo que el mesero
                      compara contra lo que hay en el pase antes de levantarlo. */}
                  <p className="line-clamp-2 text-sm font-bold text-texto">
                    {comanda.items
                      .map((i) => `${fmtNum(i.cantidad)}× ${i.nombre}`)
                      .join(" · ")}
                  </p>
                  <p className="truncate text-xs text-texto-3">
                    {mesa.zonaNombre}
                    {comanda.codigo ? ` · ${comanda.codigo}` : ""} · hace{" "}
                    {hace(comanda.enviadaEn)}
                  </p>
                </div>

                {/* Queda lejos del cuadro de la mesa para que no se toque de
                    paso. */}
                <Boton
                  icono="check"
                  onClick={() => servir(mesa.id, comanda.id)}
                  disabled={procesando}
                  className="shrink-0 py-1.5 text-[13px]"
                >
                  Servido
                </Boton>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
