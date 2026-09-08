import { useEffect, useMemo, useState } from "react";
import { Cargando, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { Mesa } from "../../types/salon";
import TarjetaMesa from "./TarjetaMesa";
import {
  filtrarMesas,
  inicialesDe,
  porServir,
  primerNombre,
  resumirSalon,
} from "./logicaSalon";

/**
 * El plano del salón. Es la pantalla en la que el mesero vive el turno.
 *
 * Orden de arriba hacia abajo = orden en que se mira:
 *   1. quién soy y qué tengo pendiente (barra + aviso)
 *   2. cómo está el salón en números (libres / ocupadas / por cobrar)
 *   3. filtros de zona
 *   4. las mesas
 *
 * Una sola regla de navegación, para que no haya que pensarla: mesa **libre**
 * → se abre directo el flujo de sentar gente; cualquier otra → hoja de detalle
 * con todo lo de esa mesa.
 *
 * Lo que la maqueta de Android tenía y NO está: el monto grande "Bs 311 sin
 * cobrar". El mesero no cobra, así que ese número no cambia ninguna decisión
 * suya y se comía una fila entera; vive en "Mi turno", que es donde sí sirve.
 */
export default function Salon({
  onAbrirMesa,
  onVerMesa,
  onIrAPorServir,
  onIrAMiTurno,
  onMesas,
}: {
  onAbrirMesa: (mesa: Mesa) => void;
  onVerMesa: (mesa: Mesa) => void;
  onIrAPorServir: () => void;
  onIrAMiTurno: () => void;
  /** Avisa qué mesas hay cargadas: el detalle las necesita para pasar/juntar. */
  onMesas?: (mesas: Mesa[]) => void;
}) {
  const { usuario } = useAuth();
  const salon = useApi(() => api.salon(), []);
  const turno = useApi(() => api.turnoMesero(), []);

  const [zona, setZona] = useState<string | null>(null);
  const [soloMias, setSoloMias] = useState(false);

  const mesas = useMemo(() => salon.datos?.mesas ?? [], [salon.datos]);
  useEffect(() => {
    if (mesas.length > 0) onMesas?.(mesas);
  }, [mesas, onMesas]);
  const zonas = salon.datos?.zonas ?? [];
  const resumen = useMemo(() => resumirSalon(mesas), [mesas]);
  const pendientes = useMemo(() => porServir(mesas), [mesas]);

  const visibles = useMemo(
    () => filtrarMesas(mesas, { zonaCodigo: zona, soloMias, miMeseroId: usuario?.id }),
    [mesas, zona, soloMias, usuario?.id],
  );

  const nombre = usuario?.nombre ?? usuario?.username ?? "";
  const nombreTurno = turno.datos?.turno ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-fondo">
      {/* ══════ Barra ══════ */}
      <header className="flex items-center gap-3 border-b border-borde bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold text-texto">Salón</h1>
          <p className="truncate text-xs text-texto-3">
            {/* El turno lo dice el servidor (sale del reloj del NEGOCIO, no
                del navegador): escrito a mano decía "turno tarde" también a
                las tres de la mañana. */}
            {nombreTurno ? `${primerNombre(nombre)} · ${nombreTurno}` : primerNombre(nombre)}
          </p>
        </div>
        <button
          onClick={onIrAMiTurno}
          title="Mi turno"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white"
        >
          {inicialesDe(nombre)}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* Aviso de lo que hay que llevar: es lo único que exige moverse ya. */}
        {pendientes.length > 0 && (
          <button
            onClick={onIrAPorServir}
            className="mb-3 flex w-full items-center gap-2 rounded-xl border border-[#FCD34D] bg-[#FFFBEB] px-3.5 py-2.5 text-left text-[13px] text-[#D97706]"
          >
            <span className="font-bold">
              {pendientes.length === 1
                ? "1 pedido para llevar a la mesa"
                : `${pendientes.length} pedidos para llevar a las mesas`}
            </span>
            <span className="ml-auto shrink-0 text-xs">tocá para verlos</span>
          </button>
        )}

        {salon.error && <ErrorMsg>{salon.error}</ErrorMsg>}
        {salon.cargando && !salon.datos ? (
          <Cargando />
        ) : (
          <>
            {/* ══════ KPIs ══════ */}
            <div className="grid grid-cols-3 gap-2">
              <Kpi valor={resumen.libres} etiqueta="Libres" color="text-primary" />
              <Kpi valor={resumen.ocupadas} etiqueta="Ocupadas" color="text-[#D97706]" />
              <Kpi valor={resumen.porCobrar} etiqueta="Por cobrar" color="text-[#DC2626]" />
            </div>
            {/* Sólo cuando hay: una mesa ya cobrada esperando es una acción
                pendiente, no un número más del tablero. */}
            {resumen.porLiberar > 0 && (
              <div className="mt-2">
                <Kpi
                  valor={resumen.porLiberar}
                  etiqueta="Por liberar"
                  color="text-[#059669]"
                />
              </div>
            )}

            {/* ══════ Filtros ══════ */}
            <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
              <Chip activo={zona === null} onClick={() => setZona(null)}>
                Todas
              </Chip>
              {zonas.map((z) => (
                <Chip key={z.id} activo={zona === z.codigo} onClick={() => setZona(z.codigo)}>
                  {z.nombre}
                </Chip>
              ))}
              {/* "Mis mesas" se cruza con la zona en vez de reemplazarla:
                  "mis mesas de la terraza" es una pregunta real. */}
              <Chip activo={soloMias} onClick={() => setSoloMias((v) => !v)}>
                Mis mesas
              </Chip>
            </div>

            {/* ══════ Mesas ══════ */}
            {visibles.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-texto-3">
                {soloMias
                  ? "Todavía no tenés ninguna mesa abierta."
                  : "No hay mesas en esta zona."}
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {visibles.map((m) => (
                  <TarjetaMesa
                    key={m.id}
                    mesa={m}
                    miMeseroId={usuario?.id}
                    onClick={(mesa) =>
                      // Una mesa libre no necesita hoja de detalle: no hay nada
                      // que contar de ella. Se entra directo a sentar gente,
                      // que es lo único que se puede hacer, y así se ahorra un
                      // toque en el momento de más apuro del turno.
                      mesa.estado === "LIBRE" ? onAbrirMesa(mesa) : onVerMesa(mesa)
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({
  valor,
  etiqueta,
  color,
}: {
  valor: number;
  etiqueta: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-borde bg-white px-3 py-2.5 text-center">
      {/* El número va grande y arriba porque es lo único que se mira; la
          etiqueta va chica debajo. */}
      <p className={`text-xl font-extrabold ${color}`}>{valor}</p>
      <p className="truncate text-[10px] uppercase tracking-wide text-texto-3">{etiqueta}</p>
    </div>
  );
}

/**
 * Píldora de filtro. Se acomoda a su texto y no se reparte el ancho: viven en
 * un scroll horizontal. El alto es cómodo a propósito — se tocan con el pulgar
 * y con la otra mano ocupada.
 */
function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
        activo
          ? "border-primary bg-primary text-white"
          : "border-borde bg-white text-texto-2 hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
