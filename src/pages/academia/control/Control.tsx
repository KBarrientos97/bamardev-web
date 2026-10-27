import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "../../../components/Icon";
import PanelLateral from "../../../components/PanelLateral";
import { Boton, Cargando, ErrorMsg, Select } from "../../../components/ui";
import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { mesDe, sumarMeses, tituloMes } from "../../../lib/academia/calendario";
import { listaDeFotos, NOMBRE_FOTO } from "../../../lib/academia/fotos";
import { fechaCorta, horarioGrupo, nombreDe } from "../../../lib/academia/formato";
import { TIPOS_FOTO, type PanelControl, type TipoFoto } from "../../../lib/academia/tipos";
import { useFiltroSede } from "../../../lib/academia/useFiltroSede";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { fmtFecha, fmtMoney, tiempoRelativo } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import PrimerosPasos from "../PrimerosPasos";
import {
  BotonFila,
  Chip,
  EncabezadoPagina,
  EstadoPagoTexto,
  GrillaKpi,
  KpiTarjeta,
  LISTA,
  PaginaAcademia,
  ResumenPanel,
  SeccionPanel,
  TABLA,
  Tarjeta,
} from "../piezas";

type Mirar = "asistenSinPagar" | "pagaronNoVienen" | "descuentosConPin" | "ventasAnuladas";
type FotoPendiente = PanelControl["fotosPorRevisar"][number];

/**
 * Fotos por revisar de a 10 (UX 13): con 150 inscripciones de marzo la lista
 * era una pared. El backend las manda todas; se pagina acá.
 */
const FOTOS_POR_PAGINA = 10;

/**
 * N9 · Panel de control del dueño (ronda 2, S7): lo que conviene mirar en el
 * mes para que nadie infle los cursos ni se quede con plata. Arriba, las
 * fotos por revisar de las inscripciones nuevas (se revisan una tras otra en
 * el panel: "Está bien" o "Algo no cuadra" con el motivo). Después, "Para
 * mirar": quién viene sin pagar, quién pagó y no viene, los descuentos con
 * PIN y las ventas anuladas. Al pie, cuántas inscripciones hizo cada persona.
 */
export default function Control() {
  const sede = useFiltroSede();
  const hoy = mesDe(new Date());
  const [mes, setMes] = useState(hoy);
  const [mirar, setMirar] = useState<Mirar>("asistenSinPagar");
  const [revisando, setRevisando] = useState<FotoPendiente | null>(null);
  const [revisadas, setRevisadas] = useState<Record<number, "ok" | "observada">>({});
  const [paginaFotos, setPaginaFotos] = useState(1);
  const [aprobando, setAprobando] = useState<number | null>(null);
  const [errorFotos, setErrorFotos] = useState("");
  const datos = useApi(() => apiAcademia.control(mes, sede.sucursalId), [mes, sede.sucursalId]);
  const d = datos.datos;

  const pendientes = (d?.fotosPorRevisar ?? []).filter((f) => !revisadas[f.alumnoId]);
  const todasFotos = d?.fotosPorRevisar ?? [];
  // La lista llega cortada (50): el total dice cuántas hay de verdad (ronda 2, M2).
  const totalFotos = Math.max(d?.fotosPorRevisarTotal ?? todasFotos.length, todasFotos.length);
  const faltanVer = totalFotos - todasFotos.length;
  const pendientesTotal = pendientes.length + faltanVer;
  const paginasFotos = Math.max(1, Math.ceil(todasFotos.length / FOTOS_POR_PAGINA));
  const paginaVista = Math.min(paginaFotos, paginasFotos);
  const fotosDeLaPagina = todasFotos.slice((paginaVista - 1) * FOTOS_POR_PAGINA, paginaVista * FOTOS_POR_PAGINA);

  /**
   * A3: "Está bien" sin entrar al panel, para el que ya las vio (o confía en
   * quien inscribió). Lo que no cuadra se sigue marcando desde "Revisar".
   */
  async function aprobar(f: FotoPendiente) {
    setErrorFotos("");
    setAprobando(f.alumnoId);
    try {
      await apiAcademia.revisarFotos(f.alumnoId, { ok: true });
      setRevisadas((r) => ({ ...r, [f.alumnoId]: "ok" }));
    } catch (e) {
      setErrorFotos(e instanceof Error ? e.message : "No se pudieron aprobar las fotos");
    } finally {
      setAprobando(null);
    }
  }
  const meses = Array.from({ length: 6 }, (_, i) => sumarMeses(hoy, -i));

  return (
    // Con el panel abierto se corre a la izquierda; `w-auto` porque el `w-full` del marco más el margen se salía de la pantalla.
    <PaginaAcademia className={revisando ? "md:mr-[380px] md:w-auto" : ""}>
      <EncabezadoPagina
        titulo="Panel de control"
        bajada="Lo que conviene mirar este mes"
        acciones={
          <>
            <div className="w-36 sm:w-44">
              <Select aria-label="Mes" value={mes} onChange={(e) => setMes(e.target.value)}>
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {tituloMes(m)}
                  </option>
                ))}
              </Select>
            </div>
            <Boton disabled={!pendientes.length} onClick={() => setRevisando(pendientes[0])}>
              {pendientes.length
                ? faltanVer > 0
                  ? `Revisar ${pendientes.length} de ${pendientesTotal} fotos`
                  : `Revisar ${pendientes.length} ${pendientes.length === 1 ? "foto" : "fotos"}`
                : "Fotos al día"}
            </Boton>
          </>
        }
      />

      {/* El administrador aterriza acá: sin esto, un instituto recién dado de alta veía tarjetas vacías y ningún aviso de por dónde empezar (ronda 2, R2). */}
      <PrimerosPasos />

      {sede.selector}

      {datos.error && !d ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : (
        <>
          <Tarjeta
            id="t-fotos"
            titulo="Fotos por revisar"
            contador={pendientesTotal}
            bajada="Inscripciones nuevas · foto y carnet por los dos lados"
            sinRelleno
          >
            {errorFotos && (
              <div className="px-4 pt-3 sm:px-5">
                <ErrorMsg>{errorFotos}</ErrorMsg>
              </div>
            )}
            {d.fotosPorRevisar.length === 0 ? (
              <p className="p-4 text-sm text-texto-3 sm:p-5">No hay fotos por revisar.</p>
            ) : (
              // En el celular, una lista con divisores; desde sm, una grilla de tarjetitas (de a dos con el panel abierto).
              <ul className={`divide-y divide-borde-soft sm:grid sm:grid-cols-2 sm:gap-3 sm:divide-y-0 sm:p-5 ${revisando ? "" : "lg:grid-cols-3"}`}>
                {fotosDeLaPagina.map((f) => {
                  const hecho = revisadas[f.alumnoId];
                  return (
                    <li
                      key={f.alumnoId}
                      className={`flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 transition-colors sm:rounded-xl sm:border sm:border-borde-soft sm:p-3 sm:hover:border-primary-200 ${
                        hecho ? "bg-muted opacity-70" : "bg-white"
                      }`}
                    >
                      <span className="flex min-w-0 flex-1 basis-44 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700"
                        >
                          <Icon name="camara" size={16} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-texto">{f.nombre}</span>
                          <span className="block truncate text-[12px] text-texto-3">
                            {f.inscritoPor} · {tiempoRelativo(f.inscritaEn).toLowerCase()}
                          </span>
                        </span>
                      </span>
                      {hecho ? (
                        <Chip tono={hecho === "ok" ? "verde" : "rojo"}>{hecho === "ok" ? "Revisada" : "Observada"}</Chip>
                      ) : (
                        <span className="flex shrink-0 items-center gap-2">
                          <BotonFila
                            variante="ghost"
                            onClick={() => setRevisando(f)}
                            aria-label={`Revisar la inscripción de ${f.nombre}`}
                          >
                            Revisar
                          </BotonFila>
                          <BotonFila
                            icono="check"
                            disabled={aprobando != null}
                            onClick={() => void aprobar(f)}
                            aria-label={`Aprobar las fotos de ${f.nombre}`}
                          >
                            {aprobando === f.alumnoId ? "Guardando…" : "Está bien"}
                          </BotonFila>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {faltanVer > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde-soft px-4 py-2.5 text-[13px] text-texto-2 sm:px-5">
                <span>
                  Se muestran las primeras {todasFotos.length}, y {faltanVer} más. Al revisarlas, actualizá para ver las que siguen.
                </span>
                <BotonFila variante="ghost" onClick={datos.recargar}>
                  Actualizar
                </BotonFila>
              </div>
            )}
            {paginasFotos > 1 && (
              <nav
                aria-label="Páginas de fotos por revisar"
                className="flex items-center justify-between gap-3 border-t border-borde-soft px-4 py-2.5 text-[13px] text-texto-2 sm:px-5"
              >
                <span className="tabular-nums">
                  {(paginaVista - 1) * FOTOS_POR_PAGINA + 1}–{Math.min(todasFotos.length, paginaVista * FOTOS_POR_PAGINA)} de{" "}
                  {todasFotos.length}
                </span>
                <span className="flex gap-2">
                  <BotonFila variante="ghost" disabled={paginaVista <= 1} onClick={() => setPaginaFotos(paginaVista - 1)}>
                    Anteriores
                  </BotonFila>
                  <BotonFila variante="ghost" disabled={paginaVista >= paginasFotos} onClick={() => setPaginaFotos(paginaVista + 1)}>
                    Siguientes
                  </BotonFila>
                </span>
              </nav>
            )}
          </Tarjeta>

          <FotosObservadas filas={d.fotosObservadas ?? []} total={d.fotosObservadasTotal} />

          <FotosFaltan filas={d.fotosFaltan ?? []} total={d.fotosFaltanTotal} />

          <Sobrecupos filas={d.sobrecupos ?? []} variasSedes={sede.variasSedes} />

          <GruposSinDocente filas={d.gruposSinDocente ?? []} total={d.gruposSinDocenteTotal} />

          <ParaMirar d={d} mirar={mirar} onMirar={setMirar} />

          <Tarjeta id="t-personas" titulo="Inscripciones por persona" sinRelleno>
            {d.inscripcionesPorUsuario.length === 0 ? (
              <p className="p-4 text-sm text-texto-3 sm:p-5">Nadie inscribió este mes.</p>
            ) : (
              <PorPersona filas={d.inscripcionesPorUsuario} variasSedes={sede.variasSedes} />
            )}
          </Tarjeta>
        </>
      )}

      {revisando && (
        <PanelRevision
          key={revisando.alumnoId}
          f={revisando}
          restan={pendientes.filter((x) => x.alumnoId !== revisando.alumnoId).length}
          onCerrar={() => setRevisando(null)}
          onRevisada={(resultado) => {
            setRevisadas((r) => ({ ...r, [revisando.alumnoId]: resultado }));
            const siguiente = pendientes.find((x) => x.alumnoId !== revisando.alumnoId);
            setRevisando(siguiente ?? null);
          }}
        />
      )}
    </PaginaAcademia>
  );
}

/** «y 30 más»: la lista llega cortada y el total dice cuántas hay de verdad (ronda 2, M2). */
function YNMas({ mostradas, total }: { mostradas: number; total?: number }) {
  if (total == null || total <= mostradas) return null;
  return <p className="border-t border-borde-soft px-4 py-2.5 text-[13px] text-texto-3 sm:px-5">y {total - mostradas} más</p>;
}

/**
 * Las observadas (QA ronda 2, B-06): el dueño marcó que algo no cuadra y ya
 * no esperan su revisión sino que la recepción cambie la foto. Antes se
 * caían de todas las listas; acá quedan a la vista, con el motivo, hasta que
 * alguien sube la foto nueva (y vuelven a "por revisar").
 */
function FotosObservadas({ filas, total }: { filas: NonNullable<PanelControl["fotosObservadas"]>; total?: number }) {
  if (!filas.length) return null;
  return (
    <Tarjeta id="t-observadas" titulo="Fotos observadas" contador={Math.max(total ?? 0, filas.length)} bajada="Esperan que la recepción cambie la foto" sinRelleno>
      <ul className={LISTA.lista}>
        {filas.map((f) => {
          const cuales = listaDeFotos(f.observadas);
          const quien = [f.observadaPor, f.observadaEn ? tiempoRelativo(f.observadaEn).toLowerCase() : null].filter(Boolean).join(" · ");
          return (
            <li key={f.alumnoId} className={`flex flex-wrap items-center justify-between gap-3 ${LISTA.itemHover}`}>
              <span className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-bg text-danger-text"
                >
                  <Icon name="alert" size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-texto">{f.nombre}</span>
                  <span className="block text-[13px] text-danger-text">
                    {f.observacion ?? "Observada"}
                    {cuales && <span className="text-texto-3"> · {cuales}</span>}
                  </span>
                  {(quien || f.grupo) && (
                    <span className="block truncate text-[12px] text-texto-3">
                      {[f.grupo ? nombreDe(f.grupo) : null, quien ? `observó ${quien}` : null].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
              </span>
              <BotonFila variante="ghost" icono="user" a={`/academia/alumnos/${f.alumnoId}`} aria-label={`Ver la ficha de ${f.nombre}`}>
                Ver ficha
              </BotonFila>
            </li>
          );
        })}
      </ul>
      <YNMas mostradas={filas.length} total={total} />
    </Tarjeta>
  );
}

/**
 * «Faltan fotos» (D3, 26-oct): quienes llegaron sin el carnet y se inscribieron
 * igual, con las fotos para después. No esperan al dueño sino a la recepción,
 * que las tiene que cargar en la ficha. Si el instituto no las pide, el backend
 * manda la lista vacía y el bloque no se dibuja.
 */
function FotosFaltan({ filas, total }: { filas: NonNullable<PanelControl["fotosFaltan"]>; total?: number }) {
  if (!filas.length) return null;
  return (
    <Tarjeta id="t-faltan-fotos" titulo="Faltan fotos" contador={Math.max(total ?? 0, filas.length)} bajada="Se inscribieron sin las fotos: hay que cargarlas" sinRelleno>
      <ul className={LISTA.lista}>
        {filas.map((f) => {
          const cuales = listaDeFotos(f.faltan ?? []);
          return (
            <li key={f.alumnoId} className={`flex flex-wrap items-center justify-between gap-3 ${LISTA.itemHover}`}>
              <span className="flex min-w-0 flex-1 items-start gap-3">
                <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-bg text-warning-text">
                  <Icon name="camara" size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-texto">{f.nombre}</span>
                  <span className="block text-[13px] text-warning-text">{cuales ? `Falta: ${cuales}` : "Faltan fotos"}</span>
                  <span className="block truncate text-[12px] text-texto-3">
                    {[f.grupo ? nombreDe(f.grupo) : null, f.inscritoPor ? `inscribió ${f.inscritoPor}` : null, f.inscritaEn ? tiempoRelativo(f.inscritaEn).toLowerCase() : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </span>
              <BotonFila variante="ghost" icono="user" a={`/academia/alumnos/${f.alumnoId}`} aria-label={`Ver la ficha de ${f.nombre}`}>
                Ver ficha
              </BotonFila>
            </li>
          );
        })}
      </ul>
      <YNMas mostradas={filas.length} total={total} />
    </Tarjeta>
  );
}

/**
 * Grupos con más inscritos que su cupo (B-31): el sobrecupo confirmado y la
 * inscripción con el grupo cerrado son a propósito, pero el dueño tiene que
 * enterarse para conseguir aula o abrir otro grupo.
 */
function Sobrecupos({ filas, variasSedes }: { filas: NonNullable<PanelControl["sobrecupos"]>; variasSedes: boolean }) {
  if (!filas.length) return null;
  return (
    <Tarjeta id="t-sobrecupos" titulo="Grupos con sobrecupo" contador={filas.length} sinRelleno>
      <ul className={LISTA.lista}>
        {filas.map((g) => (
          <li
            key={g.grupoId}
            className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] ${LISTA.itemHover}`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-texto">{g.nombre}</span>
              <span className="block truncate text-[12px] text-texto-3">
                {[g.carrera ? nombreDe(g.carrera) : null, variasSedes && g.sede ? nombreDe(g.sede) : null].filter(Boolean).join(" · ")}
              </span>
            </span>
            <Chip tono="ambar" className="tabular-nums max-sm:col-start-1 max-sm:row-start-2 max-sm:justify-self-start">
              {g.inscritos}/{g.cupo} inscritos
            </Chip>
            <BotonFila variante="ghost" a={`/academia/grupos/${g.grupoId}`} aria-label={`Ver el grupo ${g.nombre}`} className="max-sm:row-span-2">
              Ver
              <Icon name="chevronRight" size={15} />
            </BotonFila>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

/**
 * Grupos con módulos sin docente (D9, 26-oct): «Elegir después» al abrir un
 * grupo es válido, pero si nadie asigna al docente la planilla de ese módulo
 * queda sin dueño. El que empieza antes, primero; el botón abre el grupo, que
 * es donde se asigna. Sin ninguno, el bloque no se dibuja.
 */
function GruposSinDocente({ filas, total }: { filas: NonNullable<PanelControl["gruposSinDocente"]>; total?: number }) {
  const p = usePalabras();
  if (!filas.length) return null;
  return (
    <Tarjeta id="t-sin-docente" titulo="Grupos sin docente" contador={Math.max(total ?? 0, filas.length)} bajada={`Hay ${p.materias} que empiezan sin quién los dicte`} sinRelleno>
      <ul className={LISTA.lista}>
        {filas.map((g) => (
          <li
            key={g.grupoId}
            className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] ${LISTA.itemHover}`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-texto">{g.nombre}</span>
              <span className="block truncate text-[12px] text-texto-3">
                {[nombreDe(g.carrera), nombreDe(g.sede), horarioGrupo(g.horario)].filter(Boolean).join(" · ")}
              </span>
              <span className="block text-[13px] text-warning-text">
                Sin docente: {g.modulos.map((m) => `M${m.orden} ${m.nombre}`).join(", ")}
              </span>
            </span>
            {/* La fecha es la del primer módulo sin docente, no la del grupo: la lista
                habla de ese módulo (ronda 1, D11). Sin módulos, la del grupo. */}
            <Chip tono="ambar" className="max-sm:col-start-1 max-sm:row-start-2 max-sm:justify-self-start">
              {g.modulos.length ? `Empieza el M${g.modulos[0].orden} el ${fechaCorta(g.modulos[0].desde)}` : `Inicio ${fechaCorta(g.inicio)}`}
            </Chip>
            <BotonFila variante="ghost" a={`/academia/grupos/${g.grupoId}`} aria-label={`Abrir el grupo ${g.nombre} para asignar docente`} className="max-sm:row-span-2">
              Abrir grupo
              <Icon name="chevronRight" size={15} />
            </BotonFila>
          </li>
        ))}
      </ul>
      <YNMas mostradas={filas.length} total={total} />
    </Tarjeta>
  );
}

function ParaMirar({ d, mirar, onMirar }: { d: PanelControl; mirar: Mirar; onMirar: (m: Mirar) => void }) {
  const p = usePalabras();
  // El backend manda todas las becas y promociones del mes (cambio #28): acá,
  // las que autorizó otra persona con su PIN.
  const conPin = d.descuentosConPin.filter((x) => x.conPin !== false);
  const pestanas: { clave: Mirar; label: string; n: number; urgente?: boolean }[] = [
    { clave: "asistenSinPagar", label: "Vienen a clase pero no pagaron", n: d.asistenSinPagar.length, urgente: true },
    { clave: "pagaronNoVienen", label: "Pagaron pero nunca vinieron", n: d.pagaronNoVienen.length },
    { clave: "descuentosConPin", label: "Descuentos con PIN", n: conPin.length },
    { clave: "ventasAnuladas", label: "Ventas anuladas", n: d.ventasAnuladas.length },
  ];
  type Fila = { clave: string; titulo: string; sub?: string; b: string; c: ReactNode; d: string; a?: string };
  const tablas: Record<Mirar, { cab: [string, string, string, string]; filas: Fila[] }> = {
    asistenSinPagar: {
      cab: [p.Alumno, "Asistencias del mes", "Estado de pago", "Lo inscribió"],
      filas: d.asistenSinPagar.map((x, i) => ({
        clave: `a${i}`,
        titulo: nombreDe(x.alumno),
        sub: nombreDe(x.grupo),
        b: String(x.asistencias),
        c: <EstadoPagoTexto estado={x.estadoPago} />,
        d: x.inscritoPor,
        a: typeof x.alumno === "string" ? undefined : `/academia/alumnos/${x.alumno.id}`,
      })),
    },
    pagaronNoVienen: {
      cab: [p.Alumno, "Asistencias del mes", "Clases del mes", "Lo inscribió"],
      filas: d.pagaronNoVienen.map((x, i) => ({
        clave: `p${i}`,
        titulo: nombreDe(x.alumno),
        sub: nombreDe(x.grupo),
        b: String(x.asistencias),
        c: String(x.clasesDelMes),
        d: x.inscritoPor,
        a: typeof x.alumno === "string" ? undefined : `/academia/alumnos/${x.alumno.id}`,
      })),
    },
    descuentosConPin: {
      cab: [p.Alumno, "Descuento", "Quién autorizó", "Lo pidió"],
      filas: conPin.map((x) => ({
        clave: `d${x.inscripcionId}`,
        titulo: nombreDe(x.alumno),
        sub: [x.grupo ? nombreDe(x.grupo) : null, fechaCorta(x.en), x.motivo].filter(Boolean).join(" · "),
        b: x.descuento,
        c: x.autorizadoPor ?? "—",
        d: x.pidio ?? "—",
        a: typeof x.alumno === "string" ? undefined : `/academia/alumnos/${x.alumno.id}`,
      })),
    },
    ventasAnuladas: {
      cab: ["Venta", "Monto", "Cuándo", "La anuló"],
      filas: d.ventasAnuladas.map((x) => ({
        clave: `v${x.ventaId}`,
        titulo: x.comprobante ? `Recibo ${x.comprobante}` : `Venta ${x.ventaId}`,
        sub: [x.sede ? nombreDe(x.sede) : null, x.vendio ? `vendió ${x.vendio}` : null, x.motivo].filter(Boolean).join(" · "),
        b: fmtMoney(x.total),
        c: fmtFecha(x.en),
        d: x.anuladaPor,
      })),
    },
  };
  const t = tablas[mirar];
  const elegida = pestanas.find((x) => x.clave === mirar);
  // Una sola estructura para escritorio y celular: en escritorio es una
  // grilla de columnas; en el celular los tres datos bajan a un renglón
  // (`md:contents` los devuelve a sus columnas desde md).
  const col = "md:grid-cols-[minmax(180px,2fr)_minmax(100px,1fr)_minmax(110px,1fr)_minmax(100px,1fr)_88px]";
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Los indicadores SON las pestañas de "Para mirar": tocar uno cambia la tabla de abajo. */}
      <div role="group" aria-label="Qué mirar">
        <GrillaKpi>
          {pestanas.map((x) => (
            <KpiTarjeta
              key={x.clave}
              etiqueta={x.label}
              valor={x.n}
              tono={x.n > 0 ? (x.urgente ? "urgente" : "ambar") : "normal"}
              seleccionado={mirar === x.clave}
              onClick={() => onMirar(x.clave)}
            />
          ))}
        </GrillaKpi>
      </div>
      <Tarjeta id="t-mirar" titulo="Para mirar" contador={t.filas.length} bajada={elegida?.label} sinRelleno>
        {t.filas.length === 0 ? (
          <p className="p-4 text-sm text-texto-3 sm:p-5">Nada en esta {p.sede} este mes.</p>
        ) : (
          <>
            <div className={`hidden gap-3 px-4 py-2.5 sm:px-5 md:grid ${col} ${TABLA.encabezado}`}>
              {t.cab.map((c) => (
                <span key={c}>{c}</span>
              ))}
              <span />
            </div>
            <ul className={`${LISTA.lista} border-t border-borde-soft md:border-t-0`}>
              {t.filas.map((f) => (
                <li key={f.clave} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 ${col} ${LISTA.itemHover}`}>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-texto">{f.titulo}</span>
                    {f.sub && <span className="block truncate text-[12px] text-texto-3">{f.sub}</span>}
                  </span>
                  <span className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 md:contents">
                    <span className="text-sm tabular-nums text-texto-2">
                      <span className="text-texto-4 md:hidden">{t.cab[1]}: </span>
                      {f.b}
                    </span>
                    <span className="text-sm text-texto-2">
                      <span className="text-texto-4 md:hidden">{t.cab[2]}: </span>
                      {f.c}
                    </span>
                    <span className="text-sm text-texto-3">
                      <span className="text-texto-4 md:hidden">{t.cab[3]}: </span>
                      {f.d}
                    </span>
                  </span>
                  <span className="max-md:col-start-2 max-md:row-start-1 md:text-right">
                    {f.a && (
                      <BotonFila variante="ghost" a={f.a}>
                        Ver
                      </BotonFila>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Tarjeta>
    </div>
  );
}

function PorPersona({ filas, variasSedes }: { filas: PanelControl["inscripcionesPorUsuario"]; variasSedes: boolean }) {
  const max = Math.max(1, ...filas.map((f) => f.cantidad));
  return (
    <>
      <ul className={LISTA.lista}>
        {filas.map((f) => (
          <li
            key={`${f.usuario}-${nombreDe(f.sede)}`}
            className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] ${LISTA.itemHover}`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-texto">{f.usuario}</span>
              {variasSedes && <span className="block truncate text-[12px] text-texto-3">{nombreDe(f.sede)}</span>}
            </span>
            <span className="flex items-center gap-2 max-sm:col-span-2 max-sm:row-start-2">
              <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-primary-100">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((f.cantidad / max) * 100)}%` }} />
              </span>
              <span className="w-8 text-right text-sm font-semibold tabular-nums text-texto-2">{f.cantidad}</span>
            </span>
            <span className="w-28 text-right text-sm font-semibold tabular-nums text-texto max-sm:col-start-2 max-sm:row-start-1">
              {fmtMoney(f.cobrado)}
              {f.descuentos || f.anulaciones ? (
                <span className="block text-[12px] font-normal text-texto-3">
                  {[f.descuentos ? `${f.descuentos} desc.` : null, f.anulaciones ? `${f.anulaciones} anul.` : null].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between border-t border-borde-soft bg-muted px-4 py-3 text-sm font-bold text-texto sm:px-5">
        <span>Total {filas.reduce((s, f) => s + f.cantidad, 0)} inscripciones</span>
        <span className="tabular-nums">{fmtMoney(filas.reduce((s, f) => s + f.cobrado, 0))}</span>
      </p>
    </>
  );
}

/**
 * La revisión de una inscripción: las 3 fotos al lado de lo que se tipeó
 * (nombre, CI, nacimiento) para ver si cuadra. "Está bien" la marca
 * revisada; "Algo no cuadra" pide el motivo y la deja observada. Después
 * pasa a la siguiente.
 */
function PanelRevision({
  f,
  restan,
  onCerrar,
  onRevisada,
}: {
  f: FotoPendiente;
  restan: number;
  onCerrar: () => void;
  onRevisada: (r: "ok" | "observada") => void;
}) {
  const [urls, setUrls] = useState<Partial<Record<TipoFoto, string>>>({});
  const [observando, setObservando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    const creadas: string[] = [];
    for (const tipo of TIPOS_FOTO) {
      apiAcademia
        .fotoComoUrl(f.alumnoId, tipo)
        .then((u) => {
          creadas.push(u);
          if (vigente) setUrls((x) => ({ ...x, [tipo]: u }));
        })
        .catch(() => {
          /* queda el marco vacío */
        });
    }
    return () => {
      vigente = false;
      creadas.forEach((u) => URL.revokeObjectURL?.(u));
    };
  }, [f.alumnoId]);

  async function revisar(ok: boolean) {
    if (!ok && motivo.trim().length < 3) return setError("Contá en pocas palabras qué no cuadra.");
    setOcupado(true);
    setError("");
    try {
      await apiAcademia.revisarFotos(f.alumnoId, ok ? { ok: true } : { ok: false, observacion: motivo.trim() });
      onRevisada(ok ? "ok" : "observada");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <PanelLateral
      abierto
      titulo={f.nombre}
      subtitulo={`${f.inscritoPor} · ${fechaCorta(f.inscritaEn)} · ${nombreDe(f.grupo)}`}
      onClose={onCerrar}
      acciones={
        <>
          {observando ? (
            <div className="flex gap-2">
              <Boton className="flex-1" variante="danger" disabled={ocupado} onClick={() => void revisar(false)}>
                Guardar motivo
              </Boton>
              <Boton variante="ghost" onClick={() => setObservando(false)}>
                Cancelar
              </Boton>
            </div>
          ) : (
            <div className="flex gap-2">
              <Boton className="flex-1" icono="check" disabled={ocupado} onClick={() => void revisar(true)}>
                Está bien
              </Boton>
              <Boton variante="ghost" className="flex-1" onClick={() => setObservando(true)}>
                Algo no cuadra
              </Boton>
            </div>
          )}
          <span className="text-center text-[12px] text-texto-3">{restan ? `Quedan ${restan} por revisar` : "Es la última"}</span>
        </>
      }
    >
      <div>
        <SeccionPanel titulo="Lo que se tipeó">
          <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
            <Foto url={urls.FOTO} titulo={NOMBRE_FOTO.FOTO} alto />
            <ResumenPanel className="self-start">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Nombre tipeado</dt>
                  <dd className="font-semibold text-texto">{f.nombre}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">CI</dt>
                  <dd className="tabular-nums text-texto">{f.ci ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Fecha de nacimiento</dt>
                  <dd className="tabular-nums text-texto">{f.fechaNacimiento ? fmtFecha(f.fechaNacimiento) : "—"}</dd>
                </div>
              </dl>
            </ResumenPanel>
          </div>
        </SeccionPanel>
        <SeccionPanel titulo="Carnet">
          <div className="space-y-3">
            <Foto url={urls.CI_ANVERSO} titulo={NOMBRE_FOTO.CI_ANVERSO} />
            <Foto url={urls.CI_REVERSO} titulo={NOMBRE_FOTO.CI_REVERSO} />
          </div>
        </SeccionPanel>
        {observando && (
          <SeccionPanel titulo="Motivo">
            <label className="block">
              <span className="mb-1 block text-[13px] font-semibold text-texto-2">¿Qué no cuadra?</span>
              <textarea
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Por ejemplo: la foto no coincide con la del carnet"
                className="w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
              />
            </label>
          </SeccionPanel>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </PanelLateral>
  );
}

function Foto({ url, titulo, alto = false }: { url?: string; titulo: string; alto?: boolean }) {
  return (
    <figure>
      <div
        className={`flex items-center justify-center overflow-hidden rounded-xl border border-borde-soft bg-muted ${alto ? "aspect-[3/4]" : "aspect-[16/10]"}`}
      >
        {url ? <img src={url} alt={titulo} className="h-full w-full object-cover" /> : <Icon name="camara" size={20} className="text-texto-4" />}
      </div>
      <figcaption className="mt-1 text-[12px] text-texto-3">{titulo}</figcaption>
    </figure>
  );
}
