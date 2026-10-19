import { useState } from "react";
import { apiSeguridad, type Frenado } from "../../lib/seguridad/apiSeguridad";
import {
  agrupar,
  conQueIncidente,
  cuando,
  cuandoFuturo,
  desenlaceDe,
  insigniaDe,
  lineaDeTiempo,
  nivelDe,
  paraQue,
} from "../../lib/seguridad/intentosPin";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { Boton, Campo, ErrorMsg, Input, Modal } from "../ui";

type Pestana = "sinVer" | 7 | 30;

const PESTANAS: [Pestana, string][] = [
  ["sinVer", "Sin revisar"],
  [7, "7 días"],
  [30, "30 días"],
];

/** Lo mandan "Ya lo vi" y "Habilitar": la franja de arriba se vuelve a mirar. */
export const EVENTO_INTENTOS_PIN = "intentos-pin-cambiaron";

/**
 * "Intentos de PIN" (18-oct-2026): quién escribió mal un PIN, para qué y a
 * qué hora exacta, agrupado por incidente (los intentos seguidos de una
 * persona), y habilitar a quien quedó frenado. Lo abre la franja de arriba
 * ("Sin revisar") y el botón de Usuarios ("7 días").
 *
 * Nunca muestra un PIN: el backend no lo guarda.
 */
export function ModalIntentosPin({ inicial = 7, onClose }: { inicial?: Pestana; onClose: () => void }) {
  const { usuario } = useAuth();
  const yoId = usuario?.id;
  const [pestana, setPestana] = useState<Pestana>(inicial);
  const datos = useApi(
    () => apiSeguridad.intentos(pestana === "sinVer" ? { sinVer: true } : { dias: pestana }),
    [pestana],
  );
  const [habilitando, setHabilitando] = useState<Frenado | null>(null);
  const [password, setPassword] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");
  const [errorHabilitar, setErrorHabilitar] = useState("");
  const r = datos.datos;
  const ahora = r?.ahora ?? new Date().toISOString();
  const ahoraMs = new Date(ahora).getTime();
  const frenados = r?.frenados ?? [];
  const incidentes = agrupar(r?.intentos ?? []);

  const avisarCambio = () => window.dispatchEvent(new Event(EVENTO_INTENTOS_PIN));

  async function yaLoVi() {
    if (!r?.intentos.length) return;
    setError("");
    try {
      await apiSeguridad.marcarVistos(Math.max(...r.intentos.map((i) => i.id)));
      datos.recargar();
      avisarCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar");
    }
  }

  async function habilitar() {
    if (!habilitando) return;
    setProcesando(true);
    setErrorHabilitar("");
    try {
      const res = await apiSeguridad.habilitar(
        habilitando.usuarioId,
        habilitando.usuarioId === yoId ? password : undefined,
      );
      setAviso(res.mensaje);
      setHabilitando(null);
      setPassword("");
      datos.recargar();
      avisarCambio();
    } catch (e) {
      setErrorHabilitar(e instanceof Error ? e.message : "No se pudo habilitar");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Intentos de PIN"
      subtitulo="Quién escribió mal un PIN, para qué y cuándo"
      onClose={onClose}
      ancho="max-w-2xl"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cerrar
          </Boton>
          {pestana === "sinVer" && (r?.intentos.length ?? 0) > 0 && <Boton onClick={yaLoVi}>Ya lo vi</Boton>}
        </>
      }
    >
      <div className="space-y-3">
        <div role="tablist" aria-label="Período" className="flex flex-wrap gap-1.5">
          {PESTANAS.map(([valor, etiqueta]) => (
            <button
              key={String(valor)}
              type="button"
              role="tab"
              aria-selected={pestana === valor}
              onClick={() => setPestana(valor)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                pestana === valor ? "bg-primary text-white" : "text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted"
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        {aviso && (
          <p role="status" className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] font-semibold text-primary-700">
            {aviso}
          </p>
        )}
        <ErrorMsg>{error || datos.error}</ErrorMsg>

        {frenados.length > 0 && (
          <section className="space-y-2 rounded-xl border border-danger-text/20 bg-danger-bg p-3.5">
            <h3 className="text-[13px] font-bold text-danger-text">Para decidir</h3>
            {frenados.map((f) => (
              <div key={f.usuarioId} className="flex flex-wrap items-center gap-2 text-[13px] text-texto-2">
                <p className="min-w-0 flex-1 basis-64">
                  <b className="text-texto">{f.nombre}</b>
                  {f.rol ? ` (${f.rol})` : ""} no puede pedir autorizaciones con PIN desde {cuando(f.desde, ahora)}: llegó
                  a 10 equivocados en 24 horas. El freno se levanta solo {cuandoFuturo(f.hasta, ahora)}.
                </p>
                <Boton variante="ghost" className="!px-3 !py-1.5" onClick={() => setHabilitando(f)}>
                  Habilitar de nuevo
                </Boton>
              </div>
            ))}
          </section>
        )}

        {datos.cargando && !r ? (
          <p className="py-6 text-center text-sm text-texto-4">Cargando…</p>
        ) : incidentes.length === 0 ? (
          <p className="py-6 text-center text-sm text-texto-3">
            {pestana === "sinVer"
              ? "No hay nada nuevo. Si alguien escribe mal un PIN, aparece acá con quién, para qué y a qué hora."
              : "Nadie escribió mal un PIN en estos días."}
          </p>
        ) : (
          <ul className="space-y-2">
            {incidentes.map((inc) => {
              const nivel = nivelDe(inc, ahoraMs, yoId);
              const insignia = insigniaDe(nivel);
              const soloHabilitado = inc.filas.every((f) => f.tipo === "HABILITADO");
              const descripciones = [
                ...new Set(inc.filas.filter((f) => f.tipo !== "HABILITADO").map((f) => paraQue(f))),
              ];
              const frenado = frenados.find((f) => f.usuarioId === inc.operador.id);
              return (
                <li
                  key={inc.filas[0].id}
                  className={`rounded-xl border px-3.5 py-3 text-[13px] ${
                    nivel === "alarma" ? "border-danger-text/30 bg-danger-bg" : "border-borde bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-texto">
                      {soloHabilitado
                        ? `Se habilitó de nuevo a ${inc.operador.nombre}`
                        : `Desde el usuario de ${inc.operador.nombre}${inc.operador.rol ? ` · ${inc.operador.rol}` : ""}`}
                    </span>
                    {!soloHabilitado && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          insignia.tono === "rojo"
                            ? "bg-danger-text text-white"
                            : insignia.tono === "gris"
                              ? "bg-muted text-texto-2"
                              : "bg-muted/60 text-texto-4"
                        }`}
                      >
                        {insignia.texto}
                      </span>
                    )}
                  </div>
                  {!soloHabilitado && (
                    <>
                      <p className="mt-1 font-semibold text-texto-2">{descripciones.join(" · ")}</p>
                      <p className="mt-0.5 text-texto-3">
                        {conQueIncidente(inc)} · {cuando(inc.filas[0].creadoEn, ahora)}
                      </p>
                    </>
                  )}
                  <ol className="mt-1.5 space-y-0.5 tabular-nums text-texto-3">
                    {inc.filas.map((f) => (
                      <li key={f.id}>{lineaDeTiempo(f)}</li>
                    ))}
                  </ol>
                  {!soloHabilitado && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-texto-2">{desenlaceDe(inc, nivel, frenado, ahora)}</span>
                      {inc.alarma === "BLOQUEO_DIA" && frenado && (
                        <Boton variante="ghost" className="!px-3 !py-1.5" onClick={() => setHabilitando(frenado)}>
                          Habilitar de nuevo
                        </Boton>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {r?.hayMas && (
          <p className="text-center text-xs text-texto-4">Se ven los últimos 200. Elegí menos días para ver los anteriores.</p>
        )}
        <p className="text-xs text-texto-4">
          El PIN que se escribió no se guarda nunca. El sistema sabe qué usuario estaba abierto, no quién tecleó: si un
          encargado escribió su PIN en la caja de la cajera, figura «desde el usuario» de ella. Equivocarse una vez y
          acertar enseguida suele ser un dedo torpe; lo que conviene mirar es quién lo intenta seguido, con el usuario de
          otro o a deshoras. Con la hora exacta lo podés buscar en la cámara.
        </p>
      </div>

      {habilitando && (
        <Modal
          abierto
          titulo={`Habilitar a ${habilitando.nombre}`}
          onClose={() => {
            setHabilitando(null);
            setPassword("");
            setErrorHabilitar("");
          }}
          ancho="max-w-sm"
          acciones={
            <>
              <Boton variante="ghost" onClick={() => setHabilitando(null)} disabled={procesando}>
                Cancelar
              </Boton>
              <Boton
                onClick={habilitar}
                disabled={procesando || (habilitando.usuarioId === yoId && !password)}
              >
                {procesando ? "Habilitando…" : "Habilitar"}
              </Boton>
            </>
          }
        >
          <div className="space-y-3 text-[13px] text-texto-2">
            <p>
              Va a poder volver a pedir autorizaciones con PIN. Antes preguntale qué pasó: queda anotado quién lo
              habilitó.
            </p>
            {habilitando.usuarioId === yoId && (
              <Campo label="Tu contraseña" hint="Para confirmar que sos vos y no alguien usando tu sesión.">
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </Campo>
            )}
            <ErrorMsg>{errorHabilitar}</ErrorMsg>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
