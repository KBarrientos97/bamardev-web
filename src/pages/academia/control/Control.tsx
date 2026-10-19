import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import MenuMas, { type AccionMenu } from "../../../components/MenuMas";
import PanelLateral from "../../../components/PanelLateral";
import { Boton, Cargando, ErrorMsg, Select } from "../../../components/ui";
import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { mesDe, sumarMeses, tituloMes } from "../../../lib/academia/calendario";
import { listaDeFotos, NOMBRE_FOTO } from "../../../lib/academia/fotos";
import { fechaCorta, nombreDe } from "../../../lib/academia/formato";
import { TIPOS_FOTO, type PanelControl, type TipoFoto } from "../../../lib/academia/tipos";
import { useFiltroSede } from "../../../lib/academia/useFiltroSede";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { textoEstadoPago } from "../../../lib/academia/vista";
import { fmtFecha, fmtMoney, tiempoRelativo } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";

type Mirar = "asistenSinPagar" | "pagaronNoVienen" | "descuentosConPin" | "ventasAnuladas";
type FotoPendiente = PanelControl["fotosPorRevisar"][number];

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
  const datos = useApi(() => apiAcademia.control(mes, sede.sucursalId), [mes, sede.sucursalId]);
  const d = datos.datos;

  const pendientes = (d?.fotosPorRevisar ?? []).filter((f) => !revisadas[f.alumnoId]);
  const meses = Array.from({ length: 6 }, (_, i) => sumarMeses(hoy, -i));
  const acciones: AccionMenu[] = [
    { clave: "excel", etiqueta: "Exportar Excel", icono: "download", detalle: "Pronto", deshabilitada: true, onClick: () => {} },
  ];

  return (
    <div className={`mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8 ${revisando ? "md:mr-[380px]" : ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-texto">Panel de control</h1>
          <p className="mt-0.5 text-[13px] text-texto-3">Lo que conviene mirar este mes</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-[12px] text-texto-3">
            Mes
            <Select value={mes} onChange={(e) => setMes(e.target.value)}>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {tituloMes(m)}
                </option>
              ))}
            </Select>
          </label>
          <Boton disabled={!pendientes.length} onClick={() => setRevisando(pendientes[0])}>
            {pendientes.length ? `Revisar ${pendientes.length} ${pendientes.length === 1 ? "foto" : "fotos"}` : "Fotos al día"}
          </Boton>
          <MenuMas etiqueta="Más acciones del panel" acciones={acciones} />
        </div>
      </header>

      {sede.selector}

      {datos.error && !d ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : (
        <>
          <section aria-labelledby="t-fotos" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="t-fotos" className="text-base font-bold text-texto">
                Fotos por revisar{" "}
                <span className={`tabular-nums ${pendientes.length ? "text-warning-text" : "text-texto-4"}`}>{pendientes.length}</span>
              </h2>
              <span className="text-[13px] text-texto-3">Inscripciones nuevas · foto y carnet por los dos lados</span>
            </div>
            {d.fotosPorRevisar.length === 0 ? (
              <p className="text-sm text-texto-3">No hay fotos por revisar.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {d.fotosPorRevisar.map((f) => {
                  const hecho = revisadas[f.alumnoId];
                  return (
                    <li key={f.alumnoId} className={`flex items-center justify-between gap-3 rounded-xl border border-borde p-3 ${hecho ? "opacity-60" : ""}`}>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-texto">{f.nombre}</span>
                        <span className="block truncate text-[12px] text-texto-3">
                          {f.inscritoPor} · {tiempoRelativo(f.inscritaEn).toLowerCase()}
                        </span>
                      </span>
                      {hecho ? (
                        <span className={`text-[13px] ${hecho === "ok" ? "text-texto-3" : "font-semibold text-danger-text"}`}>
                          {hecho === "ok" ? "Revisada" : "Observada"}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRevisando(f)}
                          aria-label={`Revisar la inscripción de ${f.nombre}`}
                          className="text-[13px] font-semibold text-primary-700 hover:underline"
                        >
                          Revisar
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <FotosObservadas filas={d.fotosObservadas ?? []} />

          <Sobrecupos filas={d.sobrecupos ?? []} variasSedes={sede.variasSedes} />

          <ParaMirar d={d} mirar={mirar} onMirar={setMirar} />

          <section aria-labelledby="t-personas" className="space-y-2">
            <h2 id="t-personas" className="text-base font-bold text-texto">
              Inscripciones por persona
            </h2>
            {d.inscripcionesPorUsuario.length === 0 ? (
              <p className="text-sm text-texto-3">Nadie inscribió este mes.</p>
            ) : (
              <PorPersona filas={d.inscripcionesPorUsuario} variasSedes={sede.variasSedes} />
            )}
          </section>
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
    </div>
  );
}

/**
 * Las observadas (QA ronda 2, B-06): el dueño marcó que algo no cuadra y ya
 * no esperan su revisión sino que la recepción cambie la foto. Antes se
 * caían de todas las listas; acá quedan a la vista, con el motivo, hasta que
 * alguien sube la foto nueva (y vuelven a "por revisar").
 */
function FotosObservadas({ filas }: { filas: NonNullable<PanelControl["fotosObservadas"]> }) {
  if (!filas.length) return null;
  return (
    <section aria-labelledby="t-observadas" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="t-observadas" className="text-base font-bold text-texto">
          Fotos observadas <span className="tabular-nums text-danger-text">{filas.length}</span>
        </h2>
        <span className="text-[13px] text-texto-3">Esperan que la recepción cambie la foto</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filas.map((f) => {
          const cuales = listaDeFotos(f.observadas);
          const quien = [f.observadaPor, f.observadaEn ? tiempoRelativo(f.observadaEn).toLowerCase() : null].filter(Boolean).join(" · ");
          return (
            <li key={f.alumnoId} className="flex items-start justify-between gap-3 rounded-xl border border-danger-text/30 p-3">
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
              <Link
                to={`/academia/alumnos/${f.alumnoId}`}
                aria-label={`Ver la ficha de ${f.nombre}`}
                className="shrink-0 text-[13px] font-semibold text-primary-700 hover:underline"
              >
                Ver ficha
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
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
    <section aria-labelledby="t-sobrecupos" className="space-y-3">
      <h2 id="t-sobrecupos" className="text-base font-bold text-texto">
        Grupos con sobrecupo <span className="tabular-nums text-warning-text">{filas.length}</span>
      </h2>
      <ul className="divide-y divide-borde-soft border-y border-borde-soft">
        {filas.map((g) => (
          <li key={g.grupoId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-texto">{g.nombre}</span>
              <span className="block truncate text-[12px] text-texto-3">
                {[g.carrera ? nombreDe(g.carrera) : null, variasSedes && g.sede ? nombreDe(g.sede) : null].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums text-warning-text">
              {g.inscritos}/{g.cupo} inscritos
            </span>
            <Link
              to={`/academia/grupos/${g.grupoId}`}
              aria-label={`Ver el grupo ${g.nombre}`}
              className="text-[13px] font-semibold text-primary-700 hover:underline"
            >
              Ver
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ParaMirar({ d, mirar, onMirar }: { d: PanelControl; mirar: Mirar; onMirar: (m: Mirar) => void }) {
  const p = usePalabras();
  // El backend manda todas las becas y promociones del mes (cambio #28): acá,
  // las que autorizó otra persona con su PIN.
  const conPin = d.descuentosConPin.filter((x) => x.conPin !== false);
  const pestanas: { clave: Mirar; label: string; n: number }[] = [
    { clave: "asistenSinPagar", label: "Vienen a clase pero no pagaron", n: d.asistenSinPagar.length },
    { clave: "pagaronNoVienen", label: "Pagaron pero nunca vinieron", n: d.pagaronNoVienen.length },
    { clave: "descuentosConPin", label: "Descuentos con PIN", n: conPin.length },
    { clave: "ventasAnuladas", label: "Ventas anuladas", n: d.ventasAnuladas.length },
  ];
  type Fila = { clave: string; titulo: string; sub?: string; b: string; c: string; d: string; urgente?: boolean; a?: string };
  const tablas: Record<Mirar, { cab: [string, string, string, string]; filas: Fila[] }> = {
    asistenSinPagar: {
      cab: [p.Alumno, "Asistencias del mes", "Estado de pago", "Lo inscribió"],
      filas: d.asistenSinPagar.map((x, i) => ({
        clave: `a${i}`,
        titulo: nombreDe(x.alumno),
        sub: nombreDe(x.grupo),
        b: String(x.asistencias),
        c: textoEstadoPago(x.estadoPago).texto,
        d: x.inscritoPor,
        urgente: true,
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
  return (
    <section aria-labelledby="t-mirar" className="space-y-3">
      <h2 id="t-mirar" className="text-base font-bold text-texto">
        Para mirar
      </h2>
      {/* scroll-lateral-ok: pestañas de filtro, el patrón aceptado (PLAN-TABLAS-MOVIL §2.6). */}
      <div role="tablist" aria-label="Qué mirar" className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {pestanas.map((x) => (
          <button
            key={x.clave}
            type="button"
            role="tab"
            aria-selected={mirar === x.clave}
            onClick={() => onMirar(x.clave)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-left ${mirar === x.clave ? "border-primary bg-primary-50" : "border-borde bg-white hover:bg-muted"}`}
          >
            <span className="block text-lg font-bold tabular-nums text-texto">{x.n}</span>
            <span className="block text-[12px] text-texto-3">{x.label}</span>
          </button>
        ))}
      </div>
      {t.filas.length === 0 ? (
        <p className="text-sm text-texto-3">Nada en esta {p.sede} este mes.</p>
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(180px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_60px] gap-3 px-3 text-[12px] text-texto-3 md:grid">
            {t.cab.map((c) => (
              <span key={c}>{c}</span>
            ))}
            <span />
          </div>
          <ul className="divide-y divide-borde-soft border-y border-borde-soft">
            {t.filas.map((f) => (
              <li key={f.clave} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-2.5 md:grid-cols-[minmax(180px,2fr)_minmax(100px,1fr)_minmax(100px,1fr)_minmax(100px,1fr)_60px] md:items-center">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-texto">{f.titulo}</span>
                  {f.sub && <span className="block truncate text-[12px] text-texto-3">{f.sub}</span>}
                </span>
                <span className="text-sm tabular-nums text-texto-2">{f.b}</span>
                <span className={`text-sm ${f.urgente ? "font-semibold text-danger-text" : "text-texto-2"}`}>{f.c}</span>
                <span className="text-sm text-texto-3">{f.d}</span>
                <span className="text-right">
                  {f.a && (
                    <Link to={f.a} className="text-[13px] font-semibold text-primary-700 hover:underline">
                      Ver
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function PorPersona({ filas, variasSedes }: { filas: PanelControl["inscripcionesPorUsuario"]; variasSedes: boolean }) {
  const max = Math.max(1, ...filas.map((f) => f.cantidad));
  return (
    <>
      <ul className="divide-y divide-borde-soft border-y border-borde-soft">
        {filas.map((f) => (
          <li key={`${f.usuario}-${nombreDe(f.sede)}`} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-texto">{f.usuario}</span>
              {variasSedes && <span className="block truncate text-[12px] text-texto-3">{nombreDe(f.sede)}</span>}
            </span>
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-primary-100">
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((f.cantidad / max) * 100)}%` }} />
              </span>
              <span className="w-8 text-right text-sm tabular-nums text-texto-2">{f.cantidad}</span>
            </span>
            <span className="w-28 text-right text-sm tabular-nums text-texto">
              {fmtMoney(f.cobrado)}
              {(f.descuentos || f.anulaciones) ? (
                <span className="block text-[12px] font-normal text-texto-3">
                  {[f.descuentos ? `${f.descuentos} desc.` : null, f.anulaciones ? `${f.anulaciones} anul.` : null].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <p className="flex justify-between px-3 text-sm font-bold text-texto">
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
              <Boton className="flex-1" disabled={ocupado} onClick={() => void revisar(true)}>
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
      <div className="space-y-4">
        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
          <Foto url={urls.FOTO} titulo={NOMBRE_FOTO.FOTO} alto />
          <dl className="space-y-1.5 text-sm">
            <div>
              <dt className="text-[12px] text-texto-3">Nombre tipeado</dt>
              <dd className="text-texto">{f.nombre}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-texto-3">CI</dt>
              <dd className="text-texto">{f.ci ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-texto-3">Fecha de nacimiento</dt>
              <dd className="text-texto">{f.fechaNacimiento ? fmtFecha(f.fechaNacimiento) : "—"}</dd>
            </div>
          </dl>
        </div>
        <Foto url={urls.CI_ANVERSO} titulo={NOMBRE_FOTO.CI_ANVERSO} />
        <Foto url={urls.CI_REVERSO} titulo={NOMBRE_FOTO.CI_REVERSO} />
        {observando && (
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
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </PanelLateral>
  );
}

function Foto({ url, titulo, alto = false }: { url?: string; titulo: string; alto?: boolean }) {
  return (
    <figure>
      <div className={`flex items-center justify-center overflow-hidden rounded-xl bg-muted ${alto ? "aspect-[3/4]" : "aspect-[16/10]"}`}>
        {url ? <img src={url} alt={titulo} className="h-full w-full object-cover" /> : <Icon name="camara" size={20} className="text-texto-4" />}
      </div>
      <figcaption className="mt-1 text-[12px] text-texto-3">{titulo}</figcaption>
    </figure>
  );
}
