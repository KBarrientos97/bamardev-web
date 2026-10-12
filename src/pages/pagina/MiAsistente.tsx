import { useState } from "react";
import { EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Kpi,
  Modal,
  useAviso,
  Vacio,
} from "../../components/ui";
import {
  apiAsistente,
  type PreguntaAsistente,
  type PreguntaAsistenteInput,
} from "../../lib/chat/apiAsistente";
import { useApi } from "../../lib/useApi";

/**
 * "Mi asistente": lo que el dueño hace con el asistente de su página (extra
 * `asistente_pagina`, IDEAS/3b §5).
 *
 * · Preguntas frecuentes: le enseña lo que los datos no dicen ("¿aceptan QR?").
 * · Lo que no entendió: agregado ("12 veces: tienen parqueo"), con un botón
 *   para convertirlo en pregunta frecuente o descartarlo.
 * · Mensajes que dejaron los visitantes cuando el asistente no pudo ayudar.
 * · Uso del mes: lo que el extra le dio.
 */

const AREA =
  "w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100";

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "No se pudo guardar");

const VACIA: PreguntaAsistenteInput = { pregunta: "", palabrasClave: "", respuesta: "" };

function EditorPregunta({
  abierta,
  inicial,
  id,
  onClose,
  onGuardada,
}: {
  abierta: boolean;
  inicial: PreguntaAsistenteInput;
  id: number | null;
  onClose: () => void;
  onGuardada: () => void;
}) {
  const [p, setP] = useState(inicial);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [base, setBase] = useState(inicial);
  // Al abrir con otra pregunta (o con un "no entendí" para convertir), se
  // arranca de ésa.
  if (base !== inicial) {
    setBase(inicial);
    setP(inicial);
    setError("");
  }
  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      if (id != null) await apiAsistente.editarPregunta(id, p);
      else await apiAsistente.crearPregunta(p);
      onGuardada();
      onClose();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal
      abierto={abierta}
      titulo={id != null ? "Editar pregunta" : "Nueva pregunta frecuente"}
      subtitulo="El asistente la responde tal cual cuando alguien pregunta algo parecido."
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando || p.pregunta.trim().length < 3 || !p.respuesta.trim()}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3.5">
        <ErrorMsg>{error}</ErrorMsg>
        <Campo label="Pregunta" hint="Como la escribiría un cliente.">
          <Input
            aria-label="Pregunta"
            value={p.pregunta}
            maxLength={160}
            onChange={(e) => setP({ ...p, pregunta: e.target.value })}
            placeholder="¿Aceptan pago con QR?"
          />
        </Campo>
        <Campo label="Otras formas de decirlo (opcional)" hint="Palabras separadas por coma: así la encuentra aunque la escriban distinto.">
          <Input
            aria-label="Palabras clave"
            value={p.palabrasClave}
            maxLength={200}
            onChange={(e) => setP({ ...p, palabrasClave: e.target.value })}
            placeholder="qr, tarjeta, transferencia"
          />
        </Campo>
        <Campo label="Respuesta">
          <textarea
            aria-label="Respuesta"
            className={AREA}
            rows={4}
            maxLength={600}
            value={p.respuesta}
            onChange={(e) => setP({ ...p, respuesta: e.target.value })}
            placeholder="Sí, aceptamos QR de cualquier banco, tarjeta y efectivo."
          />
        </Campo>
      </div>
    </Modal>
  );
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-BO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function MiAsistente() {
  const datos = useApi(() => apiAsistente.resumen(), []);
  const [editor, setEditor] = useState<{ id: number | null; inicial: PreguntaAsistenteInput } | null>(null);
  const [aBorrar, setABorrar] = useState<PreguntaAsistente | null>(null);
  const [aviso, setAviso] = useAviso();
  const [error, setError] = useState("");
  const d = datos.datos;

  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setError("");
    try {
      await fn();
      datos.recargar();
      setAviso(ok);
    } catch (e) {
      setError(mensaje(e));
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Mi asistente"
        subtitulo="El chat automático de tu página: responde horarios, precios y horas libres con tus datos. Acá le enseñás lo demás."
        volver={{ a: "/mi-pagina", etiqueta: "Volver a Mi página" }}
        accion={
          <Boton icono="plus" onClick={() => setEditor({ id: null, inicial: { ...VACIA } })}>
            Nueva pregunta
          </Boton>
        }
      />
      <ErrorMsg>{error}</ErrorMsg>
      <AvisoOk>{aviso}</AvisoOk>

      {datos.cargando && !d ? (
        <Cargando />
      ) : datos.error || !d ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error || "No se pudo cargar"}</ErrorMsg>
      ) : (
        <>
          <section aria-label="Uso del mes" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi etiqueta="Conversaciones del mes" valor={String(d.uso.mes.conversaciones)} icono="users" />
            <Kpi etiqueta="Consultas respondidas" valor={String(d.uso.mes.mensajes - d.uso.mes.sinRespuesta)} icono="check" />
            <Kpi etiqueta="Ofreció horas libres" valor={String(d.uso.mes.conHoras)} icono="calendar" pie="Llevan a reservar" />
            <Kpi
              etiqueta="Mensajes dejados"
              valor={String(d.uso.mes.mensajesDejados)}
              icono="bell"
              tono={d.noLeidos ? "amarillo" : "verde"}
              pie={d.noLeidos ? `${d.noLeidos} sin leer` : undefined}
            />
          </section>

          <section className="card space-y-3 p-4" aria-label="Mensajes que te dejaron">
            <h2 className="flex items-center gap-2 text-base font-semibold text-texto">
              Mensajes que te dejaron
              {d.noLeidos > 0 && <Badge tono="amarillo">{d.noLeidos} sin leer</Badge>}
            </h2>
            {!d.mensajes.length ? (
              <p className="text-sm text-texto-3">Cuando el asistente no pueda ayudar, el cliente te deja su nombre y teléfono acá.</p>
            ) : (
              <ul className="space-y-2">
                {d.mensajes.map((m) => (
                  <li key={m.id} className={`rounded-xl border p-3 ${m.leido ? "border-borde" : "border-primary-200 bg-primary-50"}`}>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <strong className="text-texto">{m.nombre}</strong>
                      <a className="font-semibold text-primary-700" href={`https://wa.me/${m.telefono.replace(/\D/g, "").replace(/^(?!591)(\d{8})$/, "591$1")}`} target="_blank" rel="noopener noreferrer">
                        {m.telefono}
                      </a>
                      <span className="text-xs text-texto-3">{fechaCorta(m.creadoEn)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm text-texto-2">{m.mensaje}</p>
                    <div className="mt-2 flex gap-2">
                      {!m.leido && (
                        <Boton variante="ghost" className="!px-3 !py-1.5 text-[13px]" onClick={() => void accion(() => apiAsistente.marcarLeido(m.id), "Marcado como leído")}>
                          Marcar leído
                        </Boton>
                      )}
                      <Boton variante="ghost" className="!px-3 !py-1.5 text-[13px]" onClick={() => void accion(() => apiAsistente.borrarMensaje(m.id), "Mensaje borrado")}>
                        Borrar
                      </Boton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card space-y-3 p-4" aria-label="Lo que no entendió">
            <h2 className="text-base font-semibold text-texto">Lo que no entendió</h2>
            {!d.sinRespuesta.length ? (
              <p className="text-sm text-texto-3">Nada por ahora. Lo que el asistente no sepa responder aparece acá, agrupado.</p>
            ) : (
              <ul className="space-y-2">
                {d.sinRespuesta.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-borde p-3">
                    <span className="min-w-0 flex-1 text-sm text-texto">«{c.texto}»</span>
                    <Badge tono="gris">{c.veces === 1 ? "1 vez" : `${c.veces} veces`}</Badge>
                    <Boton
                      variante="ghost"
                      className="!px-3 !py-1.5 text-[13px]"
                      onClick={() => setEditor({ id: null, inicial: { pregunta: c.texto, palabrasClave: "", respuesta: "" } })}
                    >
                      Enseñarle
                    </Boton>
                    <button
                      type="button"
                      aria-label={`Descartar «${c.texto}»`}
                      onClick={() => void accion(() => apiAsistente.descartarConsulta(c.id), "Descartado")}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-borde bg-white text-texto-3 hover:bg-muted"
                    >
                      <Icon name="x" size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card space-y-3 p-4" aria-label="Preguntas frecuentes">
            <h2 className="text-base font-semibold text-texto">Preguntas frecuentes</h2>
            {!d.preguntas.length ? (
              <Vacio
                icono="info"
                titulo="Todavía no le enseñaste nada"
                texto="Formas de pago, delivery, parqueo, si atienden feriados: lo que tus clientes preguntan y no está en la página."
              />
            ) : (
              <ul className="space-y-2">
                {d.preguntas.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-borde p-3">
                    <div className="min-w-0 flex-[1_1_260px] space-y-1">
                      <strong className="block text-sm text-texto">{p.pregunta}</strong>
                      <p className="whitespace-pre-line text-sm text-texto-2">{p.respuesta}</p>
                      {p.palabrasClave && <p className="text-xs text-texto-3">También: {p.palabrasClave}</p>}
                    </div>
                    <div className="flex gap-1.5">
                      <Boton
                        variante="ghost"
                        className="!px-3 !py-1.5 text-[13px]"
                        onClick={() => setEditor({ id: p.id, inicial: { pregunta: p.pregunta, palabrasClave: p.palabrasClave, respuesta: p.respuesta } })}
                      >
                        Editar
                      </Boton>
                      <button
                        type="button"
                        aria-label={`Borrar «${p.pregunta}»`}
                        onClick={() => setABorrar(p)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-borde bg-white text-danger-text hover:bg-muted"
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <EditorPregunta
        abierta={editor !== null}
        id={editor?.id ?? null}
        inicial={editor?.inicial ?? VACIA}
        onClose={() => setEditor(null)}
        onGuardada={() => {
          datos.recargar();
          setAviso("Pregunta guardada");
        }}
      />
      <Confirmar
        abierto={aBorrar !== null}
        titulo="Borrar pregunta"
        texto={`¿Borrar «${aBorrar?.pregunta ?? ""}»? El asistente deja de responderla.`}
        etiquetaOk="Borrar"
        peligroso
        onCancel={() => setABorrar(null)}
        onOk={() => {
          const p = aBorrar;
          setABorrar(null);
          if (p) void accion(() => apiAsistente.borrarPregunta(p.id), "Pregunta borrada");
        }}
      />
    </div>
  );
}
