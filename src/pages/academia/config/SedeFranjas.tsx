import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/Icon";
import { AvisoOk, Boton, Cargando, ErrorMsg, Input, useAviso } from "../../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../../lib/academia/apiAcademia";
import { duracionFranja } from "../../../lib/academia/calendario";
import {
  filaSiguiente,
  filasDeLosDetalles,
  mismasFilas,
  problemasDeLasFilas,
  type FilaFranja,
} from "../../../lib/academia/sedes";
import type { FranjasDeSede, ResultadoTipicas } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { ApiError } from "../../../lib/api";
import { avisarPrimerosPasos } from "../../../lib/academia/primerosPasos";
import { useApi } from "../../../lib/useApi";
import { BotonFila, BotonIcono, Chip, LISTA, Tarjeta } from "../piezas";

/**
 * Las franjas horarias de UNA sede (C5): las filas de su calendario. Antes se
 * cargaban en Ajustes, lejos de la sede y una por una; ahora viven acá y hay un
 * botón «Usar las típicas» para arrancar de una.
 *
 * Se edita una lista en pantalla y se guarda con un botón (el backend
 * reemplaza la lista completa de la sede), no al soltar cada campo: con un
 * guardado automático, una franja a medio tipear (10:00 a 10:00) falla en cada
 * toque. La lista se valida antes de mandar y la fila con problema se marca.
 *
 * Las franjas que el instituto cargó antes «para todas las sedes» se ven con
 * su etiqueta; al guardar, el backend las copia a esta sede y desde entonces
 * cada sede maneja las suyas.
 */

const MAX_FRANJAS = 20;

const aFilas = (d: FranjasDeSede): FilaFranja[] =>
  d.franjas.map((f) => ({ inicio: f.inicio, fin: f.fin, ...(f.todasLasSedes ? { todasLasSedes: true } : {}) }));

/**
 * Cuántos grupos usa cada franja (`inicio-fin`), sacado del calendario de la
 * sede. Sólo se pide al abrir las franjas de ESA sede (no con la lista de sedes)
 * y se vuelve a pedir al guardar (ronda 2, M5). `fallo` es para no dejar quitar
 * una franja cuando no se pudo saber si tiene grupos.
 */
function useGruposPorFranja(sede: number) {
  const cal = useApi(() => apiAcademia.calendario({ sede, meses: 12 }), [sede]);
  const { datos, error, cargando, recargar } = cal;
  return useMemo(() => {
    const uso = new Map<string, number>();
    for (const fila of datos?.filas ?? []) {
      const ids = new Set(fila.celdas.flatMap((c) => c.grupos.map((g) => g.grupoId)));
      uso.set(`${fila.inicio}-${fila.fin}`, ids.size);
    }
    return { uso, listo: !!datos, fallo: !datos && !!error, cargando, recargar };
  }, [datos, error, cargando, recargar]);
}

export default function SedeFranjas({
  sedeId,
  puedeEditar,
  onCambio,
}: {
  sedeId: number;
  /** Cargar y modificar pide `academia.configurar`. */
  puedeEditar: boolean;
  /** Avisa que las franjas cambiaron (la lista de sedes refresca su conteo). */
  onCambio?: () => void;
}) {
  const carga = useApi(() => apiAcademia.franjasSede(sedeId), [sedeId]);
  const { uso, listo: usoListo, fallo: usoFallo, cargando: usoCargando, recargar: recargarUso } = useGruposPorFranja(sedeId);
  const p = usePalabras();

  const [base, setBase] = useState<FilaFranja[]>([]);
  const [filas, setFilas] = useState<FilaFranja[]>([]);
  const [malas, setMalas] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [resumen, setResumen] = useState<ResultadoTipicas | null>(null);
  const [aviso, setAviso] = useAviso();

  useEffect(() => {
    if (!carga.datos) return;
    const f = aFilas(carga.datos);
    setBase(f);
    setFilas(f);
    setMalas(new Set());
  }, [carga.datos]);

  const sinGuardar = !mismasFilas(filas, base);
  const hayDeTodas = filas.some((f) => f.todasLasSedes);

  function editar(i: number, campo: "inicio" | "fin", valor: string) {
    setFilas((prev) => prev.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
    setMalas(new Set());
    setError("");
    setResumen(null);
  }

  function agregar() {
    setFilas((prev) => [...prev, filaSiguiente(prev)]);
    setMalas(new Set());
    setError("");
    setResumen(null);
  }

  function quitar(i: number) {
    setFilas((prev) => prev.filter((_, j) => j !== i));
    setMalas(new Set());
    setError("");
    setResumen(null);
  }

  /** PUT con la lista completa. Un 409 por guardado simultáneo se reintenta una vez. */
  async function guardar() {
    const mias = filas;
    const problemas = problemasDeLasFilas(mias);
    if (problemas.mensajes.length) {
      setMalas(problemas.filas);
      setError(problemas.mensajes[0]);
      return;
    }
    setGuardando(true);
    setError("");
    setResumen(null);
    const enviar = () => apiAcademia.guardarFranjasSede(sedeId, mias.map((f) => ({ inicio: f.inicio, fin: f.fin })));
    try {
      let r: FranjasDeSede;
      try {
        r = await enviar();
      } catch (e) {
        if (!(e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.FRANJAS_CAMBIARON)) throw e;
        // Otra pantalla guardó a la vez: la lista de esta sede es lo que se quiere, se manda de nuevo.
        r = await enviar();
      }
      const f = aFilas(r);
      setBase(f);
      setFilas(f);
      setMalas(new Set());
      setAviso("Franjas guardadas.");
      onCambio?.();
      avisarPrimerosPasos();
      // Los grupos por franja que se veían eran de antes de guardar (M5).
      recargarUso();
    } catch (e) {
      if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.FRANJAS_INVALIDAS) {
        const detalles = Array.isArray(e.detalle.detalles) ? (e.detalle.detalles as string[]) : [];
        setMalas(filasDeLosDetalles(detalles, mias));
        setError(detalles.length ? detalles.join(" ") : e.message);
      } else if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.FRANJAS_CAMBIARON) {
        setError("Alguien más estaba cambiando las franjas y no pudimos guardar. Tocá Guardar de nuevo.");
      } else {
        setError(e instanceof Error ? e.message : "No se pudieron guardar las franjas");
      }
    } finally {
      setGuardando(false);
    }
  }

  async function usarTipicas() {
    setGuardando(true);
    setError("");
    setResumen(null);
    try {
      const r = await apiAcademia.franjasTipicas(sedeId);
      const f = aFilas(r);
      setBase(f);
      setFilas(f);
      setMalas(new Set());
      setResumen(r);
      if (r.agregadas.length) onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar las franjas típicas");
    } finally {
      setGuardando(false);
    }
  }

  function descartar() {
    setFilas(base);
    setMalas(new Set());
    setError("");
  }

  const botonTipicas = (
    <BotonFila
      variante={filas.length === 0 ? "primary" : "soft"}
      icono="clock"
      onClick={() => void usarTipicas()}
      disabled={guardando || sinGuardar}
      title="08–10, 10–12, 14–16, 16–18 y 19–21"
    >
      Usar las típicas
    </BotonFila>
  );

  return (
    <Tarjeta
      id="t-franjas"
      titulo="Franjas horarias"
      contador={filas.length}
      bajada={`Las filas del calendario de esta ${p.sede}: en qué horarios das clase. Pueden ser de 1, 2 o 3 horas.`}
      sinRelleno
    >
      {carga.error && !carga.datos ? (
        <div className="p-4 sm:p-5">
          <ErrorMsg onReintentar={carga.recargar}>{carga.error}</ErrorMsg>
        </div>
      ) : !carga.datos ? (
        <Cargando />
      ) : (
        <div>
          {filas.length === 0 ? (
            <div className="space-y-3 px-4 py-5 sm:px-5">
              <p className="rounded-xl bg-muted px-4 py-3 text-sm text-texto-3">
                Esta {p.sede} todavía no tiene franjas: el calendario arma una fila por cada horario de grupo.
                {sinGuardar && ` Quitaste todas: al guardar, queda sin ninguna.`}
                {puedeEditar && " Con las típicas arrancás de una y después las ajustás."}
              </p>
              {puedeEditar && (
                <div className="flex flex-wrap gap-2">
                  {botonTipicas}
                  <BotonFila icono="plus" variante="ghost" onClick={agregar} disabled={guardando}>
                    Agregar una franja
                  </BotonFila>
                </div>
              )}
            </div>
          ) : (
            <ul className={LISTA.lista}>
              {filas.map((f, i) => {
                const grupos = uso.get(`${f.inicio}-${f.fin}`) ?? 0;
                const mala = malas.has(i);
                // Una franja ya guardada sólo se quita si se SABE que no tiene grupos: si no
                // se pudo cargar el uso (o todavía carga), el tacho queda apagado (M5).
                const guardada = base.some((b) => b.inicio === f.inicio && b.fin === f.fin);
                const sinSaberUso = guardada && !usoListo;
                return (
                  <li
                    key={i}
                    aria-invalid={mala || undefined}
                    className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2.5 sm:px-5 ${mala ? "bg-danger-bg/60" : ""}`}
                  >
                    <label>
                      <span className="sr-only">Desde, franja {i + 1}</span>
                      <Input
                        type="time"
                        step={1800}
                        value={f.inicio}
                        disabled={!puedeEditar}
                        aria-invalid={mala || undefined}
                        onChange={(e) => editar(i, "inicio", e.target.value)}
                      />
                    </label>
                    <span className="text-center text-sm text-texto-3">a</span>
                    <label>
                      <span className="sr-only">Hasta, franja {i + 1}</span>
                      <Input
                        type="time"
                        step={1800}
                        value={f.fin}
                        disabled={!puedeEditar}
                        aria-invalid={mala || undefined}
                        onChange={(e) => editar(i, "fin", e.target.value)}
                      />
                    </label>
                    {puedeEditar ? (
                      <BotonIcono
                        icono="trash"
                        etiqueta={`Quitar franja ${f.inicio}–${f.fin}`}
                        disabled={guardando || grupos > 0 || sinSaberUso}
                        title={grupos > 0 ? "Tiene grupos: no se puede quitar" : sinSaberUso ? "Todavía no se sabe si tiene grupos" : "Quitar franja"}
                        onClick={() => quitar(i)}
                        className="hover:border-danger/40 hover:text-danger-text disabled:hover:border-borde disabled:hover:bg-white disabled:hover:text-texto-2"
                      />
                    ) : (
                      <span />
                    )}
                    <span className="col-span-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-texto-3">
                      <span className="tabular-nums">{duracionFranja(f)}</span>
                      {usoListo && <span>· {grupos === 0 ? "libre" : grupos === 1 ? "1 grupo" : `${grupos} grupos`}</span>}
                      {/* La razón a la vista: el `title` no se ve en el celular (B8). */}
                      {puedeEditar && grupos > 0 && <span>· no se puede quitar</span>}
                      {f.todasLasSedes && <Chip tono="azul">De todas las sedes</Chip>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {puedeEditar && usoFallo && (
            <div className="flex flex-wrap items-center gap-2 border-t border-borde-soft px-4 py-3 text-[13px] text-texto-2 sm:px-5">
              <Icon name="info" size={16} />
              <span>No pudimos comprobar qué franjas tienen grupos, así que por ahora no se puede quitar ninguna de las guardadas.</span>
              <BotonFila variante="ghost" onClick={recargarUso} disabled={usoCargando}>
                Reintentar
              </BotonFila>
            </div>
          )}

          {hayDeTodas && (
            <p className="flex items-start gap-2 border-t border-borde-soft px-4 py-3 text-[13px] text-texto-3 sm:px-5">
              <Icon name="info" size={16} />
              <span>
                Las marcadas «De todas las sedes» se cargaron antes para todas. Al guardar quedan copiadas a esta {p.sede}, y desde ahí cada {p.sede} maneja
                las suyas.
              </span>
            </p>
          )}

          <div className="space-y-3 px-4 py-4 sm:px-5">
            <AvisoOk>{aviso}</AvisoOk>
            <ErrorMsg>{error}</ErrorMsg>
            {resumen && <ResumenTipicas r={resumen} />}
            {/* Sin filas pero con cambios (se quitaron todas) también: si no, no había
                cómo guardar ni descartar (ronda 1, W1). Agregar y las típicas ya están arriba. */}
            {puedeEditar && (filas.length > 0 || sinGuardar) && (
              <div className="flex flex-wrap items-center gap-2">
                <Boton onClick={() => void guardar()} disabled={guardando || !sinGuardar}>
                  {guardando ? "Guardando…" : "Guardar franjas"}
                </Boton>
                {sinGuardar && (
                  <Boton variante="ghost" onClick={descartar} disabled={guardando}>
                    Descartar cambios
                  </Boton>
                )}
                {filas.length > 0 && (
                  <>
                    <BotonFila icono="plus" variante="ghost" onClick={agregar} disabled={guardando || filas.length >= MAX_FRANJAS}>
                      Agregar franja
                    </BotonFila>
                    {botonTipicas}
                  </>
                )}
              </div>
            )}
            {sinGuardar && <p className="text-[13px] text-texto-3">Tenés cambios sin guardar: guardalos o descartalos para usar las típicas.</p>}
          </div>
        </div>
      )}
    </Tarjeta>
  );
}

/** Qué hicieron las típicas: lo que se agregó y lo que se dejó afuera, con el porqué. */
function ResumenTipicas({ r }: { r: ResultadoTipicas }) {
  const rango = (x: { inicio: string; fin: string }) => `${x.inicio}–${x.fin}`;
  return (
    <div role="status" aria-label="Resultado de las franjas típicas" className="space-y-2 rounded-xl bg-primary-50 px-4 py-3 text-sm text-texto-2">
      {r.agregadas.length > 0 ? (
        <p>
          <b>{r.agregadas.length === 1 ? "Se agregó 1 franja" : `Se agregaron ${r.agregadas.length} franjas`}:</b> {r.agregadas.map(rango).join(", ")}.
        </p>
      ) : (
        <p>No había nada para agregar: las típicas ya estaban o se pisan con las que tenés.</p>
      )}
      {r.omitidas.length > 0 && (
        <div>
          <p className="font-semibold">No se agregaron:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
            {r.omitidas.map((o) => (
              <li key={`${o.inicio}-${o.fin}`}>
                {rango(o)} · {o.motivo === "YA_ESTA" ? "Ya estaba" : `Se pisa con ${rango(o.con)}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
