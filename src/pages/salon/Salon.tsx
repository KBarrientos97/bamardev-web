import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import TirarParaActualizar from "../../components/TirarParaActualizar";
import { ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";
import type { EstadoMesa, Mesa } from "../../types/salon";
import { EsqueletoSalon } from "./Esqueletos";
import TarjetaMesa, { TarjetaMesaLibre } from "./TarjetaMesa";
import {
  conLocalDeZona,
  filtrarMesas,
  inicialesDe,
  porServir,
  primerNombre,
  resumirSalon,
  tandasDelSalon,
} from "./logicaSalon";

/**
 * El plano del salón. Es la pantalla en la que el mesero vive el turno.
 *
 * Orden de arriba hacia abajo = orden en que se mira:
 *   1. quién soy y qué tengo pendiente (barra + aviso)
 *   2. filtros: "Mis mesas" primero, después las zonas
 *   3. cómo está el salón en números, que también filtran
 *   4. las mesas, en tandas: para atender, con gente, libres (chicas)
 *
 * Una sola regla de navegación, para que no haya que pensarla: mesa **libre**
 * → se abre directo el flujo de sentar gente; cualquier otra → hoja de detalle
 * con todo lo de esa mesa.
 *
 * Lo que la maqueta de Android tenía y NO está: el monto grande "Bs 311 sin
 * cobrar". El mesero no cobra, así que ese número no cambia ninguna decisión
 * suya y se comía una fila entera; vive en "Mi turno", que es donde sí sirve.
 */
/** Cómo viene la carga del salón: "Por servir" la usa sin volver a pedirla. */
export interface EstadoSalon {
  cargando: boolean;
  error: string;
  recargar: () => void;
}

export default function Salon({
  refrescar,
  onEstado,
  onAbrirMesa,
  onVerMesa,
  onIrAPorServir,
  onIrAMiTurno,
  onMesas,
  onMeserosCobran,
}: {
  /**
   * Sube cuando el panel quiere el salón al día (después de tocar una mesa):
   * se recarga sin desmontarse, así no pierde el scroll ni muestra la carga.
   */
  refrescar?: number;
  onEstado?: (e: EstadoSalon) => void;
  onAbrirMesa: (mesa: Mesa) => void;
  onVerMesa: (mesa: Mesa) => void;
  onIrAPorServir: () => void;
  onIrAMiTurno: () => void;
  /** Avisa qué mesas hay cargadas: el detalle las necesita para pasar/juntar. */
  onMesas?: (mesas: Mesa[]) => void;
  /**
   * Avisa si el negocio dejó que el mesero cobre. Sale del salón —que esta
   * pantalla ya recarga sola— para que prenderlo en el panel se vea sin que el
   * mesero cierre sesión.
   */
  onMeserosCobran?: (valor: boolean) => void;
}) {
  const { usuario } = useAuth();
  // El selector de local sólo le sale al de organización con 2+ locales; el de
  // un local ve el suyo (el backend se lo fuerza) y su nombre en la barra.
  const suc = useSucursales();
  // `clave`: al cambiar de local, las mesas del anterior no se quedan a la vista
  // (y a mano) hasta que llegue la respuesta; el refresco de cada 15 s, con el
  // mismo local, sí conserva lo cargado.
  const salon = useApi(() => api.salon(suc.sucursalId), [suc.sucursalId], { clave: suc.sucursalId });

  /**
   * El salón se refresca solo cada 15 segundos (eran 30 hasta el 10-nov: el
   * dueño pidió que se vea antes lo que cambia el de al lado).
   *
   * Sin esto, la pantalla sólo se recargaba cuando ESTE mesero hacía algo: con
   * dos en turno, el que miraba veía mesas que el otro ya había liberado y
   * pedidos listos que no aparecían en "Por servir". En un salón el estado lo
   * cambia el de al lado todo el tiempo, así que es más sensible que la lista
   * del repartidor (que va a 60s).
   *
   * Sólo con la pestaña visible: refrescar en segundo plano gasta datos del
   * celular sin que nadie lo esté mirando. Mismo patrón que `Repartidor.tsx`.
   */
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") salon.recargar();
    }, 15_000);
    const alVolver = () => {
      if (document.visibilityState === "visible") salon.recargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
    // Sólo al montar: `recargar` es estable y resuscribirse en cada render
    // dejaría timers colgados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La zona elegida por id y no por código: dos locales pueden tener una zona
  // con el mismo código ("salon") y sus chips se marcarían a la vez.
  const [zonaId, setZonaId] = useState<number | null>(null);
  const [soloMias, setSoloMias] = useState(false);
  /**
   * El contador tocado ("5 Ocupadas"): filtra el salón a ese estado. Parecían
   * botones y no hacían nada (UX-MESEROS §1). Uno a la vez: combinar estados
   * no le sirve al mesero y complica entender qué está viendo.
   */
  const [estado, setEstado] = useState<EstadoMesa | null>(null);

  const zonas = useMemo(() => salon.datos?.zonas ?? [], [salon.datos]);
  // La mesa hereda el local de su zona: se lo pone la web para no ofrecer, al
  // pasar/juntar/unir, mesas de otro local (el backend responde 400).
  const mesas = useMemo(() => conLocalDeZona(salon.datos?.mesas ?? [], zonas), [salon.datos, zonas]);
  // También sin datos (al cambiar de local): el detalle no ofrece pasar/juntar
  // con las mesas del local anterior.
  useEffect(() => {
    onMesas?.(mesas);
  }, [mesas, onMesas]);

  const { cargando, error, recargar } = salon;
  useEffect(() => {
    onEstado?.({ cargando, error, recargar });
  }, [cargando, error, recargar, onEstado]);

  // El primer valor ya vino con la carga de entrada: sólo los cambios recargan.
  const refrescoVisto = useRef(refrescar);
  useEffect(() => {
    if (refrescoVisto.current === refrescar) return;
    refrescoVisto.current = refrescar;
    recargar();
  }, [refrescar, recargar]);

  // El flag viaja con el salón, que esta pantalla ya recarga sola: prenderlo
  // desde el panel se ve sin que el mesero cierre sesión.
  const meserosCobran = salon.datos?.meserosCobran === true;
  useEffect(() => {
    if (salon.datos) onMeserosCobran?.(meserosCobran);
  }, [salon.datos, meserosCobran, onMeserosCobran]);
  const zonaElegida = zonas.find((z) => z.id === zonaId) ?? null;
  // Con "Todas" y zonas de 2+ locales, cada zona dice de cuál es.
  const verLocalZonas = suc.mostrarColumna(zonas, (z) => z.sucursalId);
  const pendientes = useMemo(() => porServir(mesas), [mesas]);

  // Los números cuentan lo que hay en la zona y en "mis mesas" elegidas: en la
  // terraza, "Ocupadas" dice cuántas hay en la terraza. Si no, el contador y lo
  // que muestra al tocarlo no coincidirían.
  const delFiltro = useMemo(
    () =>
      filtrarMesas(mesas, {
        zonaCodigo: zonaElegida?.codigo,
        sucursalId: zonaElegida?.sucursalId,
        soloMias,
        miMeseroId: usuario?.id,
      }),
    [mesas, zonaElegida, soloMias, usuario?.id],
  );
  const resumen = useMemo(() => resumirSalon(delFiltro), [delFiltro]);
  const visibles = useMemo(
    () => (estado ? delFiltro.filter((m) => m.estado === estado) : delFiltro),
    [delFiltro, estado],
  );
  const tandas = useMemo(() => tandasDelSalon(visibles), [visibles]);
  const mias = useMemo(
    () => mesas.filter((m) => m.meseroId != null && m.meseroId === usuario?.id).length,
    [mesas, usuario?.id],
  );

  const nombre = usuario?.nombre ?? usuario?.username ?? "";
  const alTocarMesa = (mesa: Mesa) =>
    // Una mesa libre no necesita hoja de detalle: no hay nada que contar de
    // ella. Se entra directo a sentar gente, que es lo único que se puede
    // hacer, y así se ahorra un toque en el momento de más apuro del turno.
    mesa.estado === "LIBRE" ? onAbrirMesa(mesa) : onVerMesa(mesa);

  const contadores: { estado: EstadoMesa; etiqueta: string; valor: number; color: string }[] = [
    { estado: "OCUPADA", etiqueta: "Ocupadas", valor: resumen.ocupadas, color: "text-primary-700" },
    { estado: "CUENTA", etiqueta: "Por cobrar", valor: resumen.porCobrar, color: "text-danger-text" },
    { estado: "PAGADA", etiqueta: "Por liberar", valor: resumen.porLiberar, color: "text-texto-2" },
    { estado: "LIBRE", etiqueta: "Libres", valor: resumen.libres, color: "text-texto" },
  ];
  const elegido = contadores.find((c) => c.estado === estado);
  const tarjeta = (m: Mesa) => (
    <TarjetaMesa key={m.id} mesa={m} miMeseroId={usuario?.id} onClick={alTocarMesa} />
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-fondo">
      {/* ══════ Barra ══════ */}
      <header className="flex items-center gap-3 border-b border-borde bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold text-texto">Salón</h1>
          <p className="truncate text-xs text-texto-3">
            {/* Iba el nombre del turno de la CAJA ("Turno mañana" a las tres
                de la tarde, porque la caja abrió a la mañana): al mesero le
                parecía un error. Cuántas mesas tiene sí le dice algo. */}
            {primerNombre(nombre)}
            {mias > 0 && ` · ${mias} ${mias === 1 ? "mesa tuya" : "mesas tuyas"}`}
            {/* El local que se mira (el elegido, o el propio del que está
                asignado): sólo con 2+ locales; con uno `sedeVista` es vacío. */}
            {suc.sedeVista && ` · ${suc.sedeVista}`}
          </p>
        </div>
        <button
          onClick={onIrAMiTurno}
          title="Mi turno"
          aria-label="Mi turno"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-boton text-sm font-bold text-white"
        >
          {inicialesDe(nombre)}
        </button>
      </header>

      <TirarParaActualizar onActualizar={recargar} cargando={cargando} className="min-h-0 flex-1 p-4">
        {/* Aviso de lo que hay que llevar: es lo único que exige moverse ya. */}
        {pendientes.length > 0 && (
          <button
            onClick={onIrAPorServir}
            className="mb-3 flex min-h-12 w-full items-center gap-2 rounded-xl border border-warning-borde bg-warning-suave px-3.5 py-2.5 text-left text-[14px] text-warning-text"
          >
            <Icon name="bell" size={18} />
            <span className="font-bold">
              {pendientes.length === 1
                ? "1 pedido para llevar a la mesa"
                : `${pendientes.length} pedidos para llevar a las mesas`}
            </span>
            <span className="ml-auto shrink-0 text-[13px] font-semibold">Ver</span>
          </button>
        )}

        {salon.error && (
          <ErrorMsg onReintentar={salon.recargar}>{salon.error}</ErrorMsg>
        )}
        {salon.cargando && !salon.datos ? (
          <EsqueletoSalon />
        ) : (
          <>
            {/* ══════ Local (sólo la organización con 2+) ══════ */}
            {suc.elegir && (
              <div className="sin-barra -mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
                {suc.opciones.map(([valor, etiqueta]) => (
                  <Chip
                    key={valor || "todas"}
                    activo={suc.valorChip === valor}
                    onClick={() => {
                      suc.alElegir(valor);
                      setZonaId(null);
                    }}
                  >
                    {etiqueta}
                  </Chip>
                ))}
              </div>
            )}

            {/* ══════ Filtros ══════ */}
            <div className="sin-barra -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
              {/* "Mis mesas" va primero: es el filtro que más usa un mesero, y
                  al final de la fila quedaba fuera de la pantalla. Se cruza con
                  la zona en vez de reemplazarla: "mis mesas de la terraza" es
                  una pregunta real. */}
              <Chip activo={soloMias} onClick={() => setSoloMias((v) => !v)}>
                Mis mesas
              </Chip>
              <Chip activo={zonaId === null} onClick={() => setZonaId(null)}>
                Todas
              </Chip>
              {zonas.map((z) => (
                <Chip key={z.id} activo={zonaId === z.id} onClick={() => setZonaId(z.id)}>
                  {z.nombre}
                  {verLocalZonas && z.sucursalNombre ? ` · ${z.sucursalNombre}` : ""}
                </Chip>
              ))}
            </div>

            {/* ══════ Contadores (filtran) ══════ */}
            <div className="mt-3 grid grid-cols-4 gap-2">
              {contadores.map((c) => (
                <Kpi
                  key={c.estado}
                  valor={c.valor}
                  etiqueta={c.etiqueta}
                  color={c.color}
                  activo={estado === c.estado}
                  onClick={() => setEstado((e) => (e === c.estado ? null : c.estado))}
                />
              ))}
            </div>

            {/* Qué se está viendo: sin esto, con un contador tocado parecía
                que se habían perdido mesas. */}
            {elegido && (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-primary-50 px-3.5 py-2 text-[13px]">
                <span className="font-bold text-primary-700">
                  Viendo: {elegido.etiqueta} · {visibles.length}
                </span>
                <button onClick={() => setEstado(null)} className="font-bold text-primary-700 underline">
                  Ver todas
                </button>
              </div>
            )}

            {/* ══════ Mesas ══════ */}
            {visibles.length === 0 ? (
              <div className="py-12 text-center text-[13px] text-texto-3">
                <p>
                  {elegido
                    ? `No hay mesas en «${elegido.etiqueta}».`
                    : soloMias
                      ? "Todavía no tenés ninguna mesa abierta."
                      : "No hay mesas en esta zona."}
                </p>
                {elegido && (
                  <button
                    onClick={() => setEstado(null)}
                    className="mt-2 font-bold text-primary-700 underline"
                  >
                    Ver todas
                  </button>
                )}
              </div>
            ) : (
              <>
                <Tanda titulo="Para atender" mesas={tandas.atender}>
                  {tarjeta}
                </Tanda>
                <Tanda titulo={tandas.atender.length > 0 ? "Con gente" : ""} mesas={tandas.enUso}>
                  {tarjeta}
                </Tanda>
                {tandas.libres.length > 0 && (
                  <section className="mt-4">
                    <h2 className="mb-2 text-[12px] font-extrabold uppercase tracking-wide text-texto-2">
                      Libres · {tandas.libres.length}
                    </h2>
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
                      {tandas.libres.map((m) => (
                        <TarjetaMesaLibre key={m.id} mesa={m} onClick={alTocarMesa} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </TirarParaActualizar>
    </div>
  );
}

/** Una tanda de mesas con gente, con su título. Sin mesas no se dibuja. */
function Tanda({
  titulo,
  mesas,
  children,
}: {
  titulo: string;
  mesas: Mesa[];
  children: (m: Mesa) => React.ReactNode;
}) {
  if (mesas.length === 0) return null;
  return (
    <section className="mt-4">
      {titulo && (
        <h2 className="mb-2 text-[12px] font-extrabold uppercase tracking-wide text-texto-2">{titulo}</h2>
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">{mesas.map(children)}</div>
    </section>
  );
}

/**
 * Un contador del salón, que además filtra. El número va grande y arriba
 * porque es lo único que se mira; la etiqueta va chica debajo.
 */
function Kpi({
  valor,
  etiqueta,
  color,
  activo,
  onClick,
}: {
  valor: number;
  etiqueta: string;
  color: string;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={`min-h-[60px] rounded-xl border-[1.5px] px-1 py-2 text-center transition-colors ${
        activo ? "border-primary-boton bg-primary-50" : "border-borde bg-white hover:bg-muted"
      }`}
    >
      <span className={`block text-xl font-extrabold ${color}`}>{valor}</span>
      <span className="block truncate text-[11px] font-semibold text-texto-2">{etiqueta}</span>
    </button>
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
      aria-pressed={activo}
      className={`min-h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-[14px] font-semibold transition-colors ${
        activo
          ? "border-primary-boton bg-primary-boton text-white"
          : "border-borde bg-white text-texto-2 hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
