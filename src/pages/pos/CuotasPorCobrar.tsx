import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Cargando, ErrorMsg, Input } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { cuotasIniciales, montoValido, pagadorPorDefecto, type CobroCuotas, type LineaCuota } from "../../lib/academia/cobroCuotas";
import { fechaCorta, nombreDe } from "../../lib/academia/formato";
import type { AlumnoPorCobrar, CarritoInscripcion, Ref } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { fmtMoney } from "../../lib/format";

/** ¿La sede del grupo es otra que la de la caja? Por id si vino, si no por nombre. */
function esOtraSede(sede: string | Ref | null | undefined, caja: { id: number; nombre: string | null } | null): boolean {
  if (!sede || !caja) return false;
  if (typeof sede !== "string") return sede.id !== caja.id;
  return !!caja.nombre && sede.trim().toLowerCase() !== caja.nombre.trim().toLowerCase();
}

/**
 * E9 · Módulos por cobrar (PLAN-ACADEMIAS §5, ronda 2), dentro del POS, con
 * el mismo patrón que "Citas por cobrar" de belleza: se busca al estudiante
 * por nombre, CI o código, se eligen sus cuotas pendientes (las vencidas
 * arriba y marcadas) y de cada una "Todo" o "Una parte" (el adelanto, que
 * deja el resto de saldo), y van al carrito. Después se suman poleras o
 * materiales y se cobra con lo de siempre.
 *
 * Desde "Inscribir y cobrar" llega lo que se acordó que paga hoy, ya
 * repartido entre sus cuotas.
 *
 * Cobrar una cuota de otra sede está permitido (PA §10.2): se avisa.
 */
export default function CuotasPorCobrar({
  caja,
  inicial,
  onAtras,
  onAgregar,
}: {
  /** La sede de la caja abierta, para el aviso de otra sede. */
  caja: { id: number; nombre: string | null } | null;
  /** Entrar ya con un alumno: desde el grupo, la ficha, Cobranza o la inscripción. */
  inicial?: { inscripcionId?: number; alumnoId?: number; q?: string; sede?: Ref; monto?: number };
  onAtras: () => void;
  onAgregar: (cobro: CobroCuotas) => void;
}) {
  const p = usePalabras();
  const [q, setQ] = useState(inicial?.q ?? "");
  const [buscado, setBuscado] = useState((inicial?.q ?? "").trim());
  const [resultados, setResultados] = useState<AlumnoPorCobrar[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  const [elegido, setElegido] = useState<{ fila: Pick<AlumnoPorCobrar, "inscripcionId" | "nombre" | "codigo" | "grupo" | "sede">; carrito: CarritoInscripcion } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [filas, setFilas] = useState<{ linea: LineaCuota; elegida: boolean; texto: string; parte: boolean }[]>([]);
  const [pagadorId, setPagadorId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBuscado(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Sin sede: el alumno de otra sede también se cobra acá.
  useEffect(() => {
    if (buscado.length < 2) {
      setResultados(null);
      return;
    }
    let vigente = true;
    setBuscando(true);
    setError("");
    apiAcademia
      .cuotasPorCobrar(buscado)
      .then((r) => {
        if (!vigente) return;
        setResultados(r.alumnos);
        // Desde Cobranza sin la inscripción: si el alumno buscado aparece, se abre solo.
        const directo = inicial?.alumnoId != null ? r.alumnos.find((a) => a.alumnoId === inicial.alumnoId) : undefined;
        if (directo && !elegido) void elegir(directo);
      })
      .catch((e: unknown) => vigente && setError(e instanceof Error ? e.message : "No se pudo buscar"))
      .finally(() => vigente && setBuscando(false));
    return () => {
      vigente = false;
    };
    // `elegir` y `elegido` no disparan otra búsqueda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscado]);

  // Con la inscripción en la mano (el grupo, la ficha, "Inscribir y cobrar"), directo a sus cuotas.
  useEffect(() => {
    if (inicial?.inscripcionId == null) return;
    void elegir({ inscripcionId: inicial.inscripcionId, nombre: "", codigo: null, grupo: "", sede: inicial.sede ?? "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicial?.inscripcionId]);

  async function elegir(fila: Pick<AlumnoPorCobrar, "inscripcionId" | "nombre" | "codigo" | "grupo" | "sede">) {
    setError("");
    setCargando(true);
    try {
      const carrito = await apiAcademia.carrito(fila.inscripcionId);
      setElegido({ fila, carrito });
      // Lo acordado al inscribir vale sólo para la inscripción con la que se entró.
      const monto = fila.inscripcionId === inicial?.inscripcionId ? inicial?.monto : undefined;
      setFilas(
        cuotasIniciales(carrito, monto).map((x) => ({ ...x, texto: String(x.linea.monto), parte: x.linea.monto < x.linea.saldo })),
      );
      setPagadorId(pagadorPorDefecto(carrito.pagadores));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron traer sus cuotas");
    } finally {
      setCargando(false);
    }
  }

  const elegidas = filas.filter((f) => f.elegida);
  const invalida = elegidas.find((f) => !montoValido(Number(f.texto), f.linea.saldo));
  const total = Math.round(elegidas.reduce((s, f) => s + (Number(f.texto) || 0), 0) * 100) / 100;
  const sedeGrupo = elegido ? nombreDe(elegido.fila.sede) || null : null;
  const otraSede = elegido ? esOtraSede(elegido.fila.sede, caja) : false;

  function agregar() {
    if (!elegido || !elegidas.length || invalida) return;
    onAgregar({
      inscripcionId: elegido.fila.inscripcionId,
      alumno: elegido.carrito.alumno,
      pagadores: elegido.carrito.pagadores,
      pagadorId,
      sedeGrupo,
      otraSede,
      lineas: elegidas.map((f) => ({ ...f.linea, monto: Math.round(Number(f.texto) * 100) / 100 })),
    });
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col">
      <div className="flex items-center gap-2 border-b border-borde bg-white px-4 py-3">
        <button
          onClick={elegido && inicial?.inscripcionId == null ? () => setElegido(null) : onAtras}
          aria-label="Volver"
          className="rounded-lg p-1.5 text-texto-2 hover:bg-muted"
        >
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold text-texto">{p.Materias} por cobrar</h1>
          <p className="truncate text-xs text-texto-3">
            {elegido ? elegido.carrito.alumno.nombre : `Buscá al ${p.alumno} por nombre, CI o código.`}
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <ErrorMsg>{error}</ErrorMsg>
        {cargando ? (
          <Cargando texto="Trayendo sus cuotas…" />
        ) : elegido ? (
          <>
            {otraSede && sedeGrupo && (
              <p role="status" className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] font-semibold text-warning-text">
                Grupo de {sedeGrupo} · se cobra en {caja?.nombre ?? "esta caja"}
              </p>
            )}
            {filas.length === 0 ? (
              <p className="text-sm text-texto-3">No tiene cuotas pendientes.</p>
            ) : (
              <ul className="space-y-2.5">
                {filas.map((f, i) => {
                  const mal = f.elegida && !montoValido(Number(f.texto), f.linea.saldo);
                  return (
                    <li key={f.linea.cuotaId} className={`card space-y-2 p-3.5 ${f.elegida ? "border-primary/50" : ""}`}>
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-[var(--color-primary-boton)]"
                          checked={f.elegida}
                          onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, elegida: e.target.checked } : x)))}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-texto">{f.linea.descripcion}</span>
                          <span className={`block text-xs ${f.linea.vencida ? "font-semibold text-danger-text" : "text-texto-3"}`}>
                            {f.linea.vencida ? "Vencida" : "Vence"} {fechaCorta(elegido.carrito.lineas.find((l) => l.cuotaId === f.linea.cuotaId)?.vence)} · saldo{" "}
                            {fmtMoney(f.linea.saldo)}
                          </span>
                        </span>
                      </label>
                      {f.elegida && (
                        <div className="space-y-2 pl-7">
                          <div role="radiogroup" aria-label={`Cuánto cobrar de ${f.linea.descripcion}`} className="flex gap-2">
                            {([false, true] as const).map((parte) => (
                              <button
                                key={String(parte)}
                                type="button"
                                role="radio"
                                aria-checked={f.parte === parte}
                                onClick={() =>
                                  setFilas(
                                    filas.map((x, j) =>
                                      j === i ? { ...x, parte, texto: parte ? x.texto : String(x.linea.saldo) } : x,
                                    ),
                                  )
                                }
                                className={`rounded-full px-3 py-1 text-[13px] font-semibold ${
                                  f.parte === parte ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2"
                                }`}
                              >
                                {parte ? "Una parte" : "Todo"}
                              </button>
                            ))}
                          </div>
                          {f.parte && (
                            <>
                              <label className="block text-xs text-texto-3" htmlFor={`monto-${f.linea.cuotaId}`}>
                                Monto del adelanto (máx. {fmtMoney(f.linea.saldo)})
                              </label>
                              <Input
                                id={`monto-${f.linea.cuotaId}`}
                                type="number"
                                value={f.texto}
                                onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))}
                                className={mal ? "border-danger" : ""}
                              />
                              {mal ? (
                                <p className="mt-1 text-xs text-danger-text">Más que cero y nunca por encima del saldo.</p>
                              ) : (
                                Number(f.texto) < f.linea.saldo && (
                                  <p className="mt-1 text-xs text-texto-3">Quedan {fmtMoney(f.linea.saldo - Number(f.texto))} de saldo.</p>
                                )
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {elegido.carrito.pagadores.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-[13px] font-semibold text-texto-2">Quién paga</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quién paga">
                  {elegido.carrito.pagadores.map((x) => (
                    <button
                      key={x.clienteId}
                      type="button"
                      role="radio"
                      aria-checked={pagadorId === x.clienteId}
                      onClick={() => setPagadorId(x.clienteId)}
                      className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                        pagadorId === x.clienteId ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2"
                      }`}
                    >
                      {x.nombre} · {x.rol === "TUTOR" ? "tutor" : p.alumno}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <Input
              aria-label={`Buscar ${p.alumno}`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, CI o código"
              autoFocus
            />
            {buscando && <Cargando texto="Buscando…" />}
            {resultados && !buscando && resultados.length === 0 && (
              <p className="text-sm text-texto-3">Nadie con cuotas pendientes con «{buscado}».</p>
            )}
            {resultados?.map((a) => (
              <button
                key={a.inscripcionId}
                type="button"
                onClick={() => void elegir(a)}
                className="card flex w-full items-center gap-3 p-3.5 text-left hover:border-primary/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-texto">{a.nombre}</span>
                  <span className="block truncate text-[13px] text-texto-3">
                    {[a.codigo, nombreDe(a.grupo), nombreDe(a.sede)].filter(Boolean).join(" · ")}
                  </span>
                  {esOtraSede(a.sede, caja) && <span className="text-[12px] font-semibold text-warning-text">Otra {p.sede}</span>}
                </span>
                <span className={`shrink-0 text-sm font-bold tabular-nums ${a.vencido ? "text-danger-text" : "text-texto"}`}>
                  {fmtMoney(a.saldo)}
                </span>
              </button>
            ))}
          </>
        )}
      </div>

      {elegido && filas.length > 0 && (
        <div className="border-t border-borde bg-white p-4">
          <Boton className="w-full" disabled={!elegidas.length || !!invalida} onClick={agregar}>
            Agregar al carrito · {fmtMoney(total)}
          </Boton>
        </div>
      )}
    </div>
  );
}
