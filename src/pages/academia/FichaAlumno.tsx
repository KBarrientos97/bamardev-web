import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import MenuMas, { type AccionMenu } from "../../components/MenuMas";
import { AvisoOk, Boton, Campo, Cargando, Confirmar, ErrorMsg, Input, Modal, Select, useAviso } from "../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../lib/academia/apiAcademia";
import { ApiError } from "../../lib/api";
import {
  EXPEDIDOS,
  fechaCorta,
  horarioGrupo,
  nombreAlumno,
  nombreDe,
  PARENTESCOS,
  textoCubre,
} from "../../lib/academia/formato";
import type { AlumnoDetalle, InscripcionDetalle } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { abrirWhatsapp, nombreCuota, rutaCobroInscripcion, textoCuota, textoEstadoInscripcion, textoEvento } from "../../lib/academia/vista";
import { enlaceWhatsApp } from "../../lib/agenda/recordatorio";
import { fmtFecha, fmtMoney, iniciales } from "../../lib/format";
import { cobraCuotas, soloLoSuyo, tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import PedirMotivo from "../agenda/PedirMotivo";
import FotosAlumno from "./FotosAlumno";

const MOTIVOS_RETIRO = ["Horario", "Económico", "Cambio de ciudad", "No le gustó el curso", "Otro"] as const;

/** Las vivas primero (activa o en observación); después las demás, de la más nueva. */
function inscripcionActual(a: AlumnoDetalle): InscripcionDetalle | null {
  const vivas = a.inscripciones.filter((i) => ["ACTIVA", "OBSERVACION", "EN_OBSERVACION"].includes(i.estado));
  // Una preinscripción descartada nunca fue una inscripción: no es "la actual".
  return vivas[0] ?? a.inscripciones.find((i) => i.estado !== "DESCARTADA") ?? null;
}

/**
 * E6 · Ficha del estudiante (PLAN-ACADEMIAS §5, ronda 2): quién es (con el
 * tutor si es menor), la inscripción actual con su estado de cuenta y sus
 * pagos, las 3 fotos (la imagen sólo con `academia.fotos`; los demás ven un
 * candado) y el historial. La acción principal es Cobrar; el QR por WhatsApp
 * (con el enlace de pago), cambiar de grupo o de plan y retirar van en "⋯".
 */
export default function FichaAlumno() {
  const { id } = useParams();
  const alumnoId = Number(id);
  const navigate = useNavigate();
  const { usuario, negocio, rubro } = useAuth();
  const p = usePalabras();
  const ficha = useApi(() => apiAcademia.alumno(alumnoId), [alumnoId]);
  const [aviso, setAviso] = useAviso(5000);
  const [error, setError] = useState("");
  const [retirando, setRetirando] = useState<InscripcionDetalle | null>(null);
  const [cambiandoGrupo, setCambiandoGrupo] = useState<InscripcionDetalle | null>(null);
  const [cambiandoPlan, setCambiandoPlan] = useState<InscripcionDetalle | null>(null);
  const [editando, setEditando] = useState(false);
  const [agregandoTutor, setAgregandoTutor] = useState(false);

  const sinMontos = soloLoSuyo(usuario, "academia.ver");
  const cobra = cobraCuotas({ features: negocio?.features, rubro, permisos: usuario?.permisos, permisosPropios: usuario?.permisosPropios });
  const inscribe = tienePermiso(usuario, "academia.inscribir");
  // Editar los datos y los tutores pide inscribir (#4 del contrato); el CI y
  // la fecha de nacimiento llegan con ese permiso o con los datos personales.
  const veDatosPersonales = inscribe || tienePermiso(usuario, "cliente.datos_personales");
  const [grupoLleno, setGrupoLleno] = useState<{ texto: string; seguir: () => void } | null>(null);

  const a = ficha.datos;
  if (ficha.error && !a) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6 lg:p-8">
        <Link to="/academia/alumnos" className="text-[13px] text-texto-3 hover:underline">
          ← {p.Alumnos}
        </Link>
        <ErrorMsg onReintentar={ficha.recargar}>{ficha.error}</ErrorMsg>
      </div>
    );
  }
  if (!a) return <Cargando />;

  const actual = inscripcionActual(a);
  const vivas = (actual?.cuotas ?? []).filter((c) => c.estado !== "ANULADA");
  const saldo = Math.round(vivas.reduce((s, c) => s + c.saldo, 0) * 100) / 100;
  const vencido = Math.round(vivas.filter((c) => c.vencida).reduce((s, c) => s + c.saldo, 0) * 100) / 100;
  const tutor = a.tutores.find((t) => t.principal) ?? a.tutores[0] ?? null;
  const estado = actual ? textoEstadoInscripcion(actual.estado) : null;

  /**
   * El QR por WhatsApp (ronda 2): con algo que se debe, el recordatorio de
   * esa cuota, que trae el enlace de pago y queda anotado. Sin deuda, el
   * estado de cuenta escrito, al tutor si lo hay (PA §8, menor = tutor).
   */
  async function enviarEstado() {
    const pendiente = vivas.find((c) => c.saldo > 0 && c.vencida) ?? vivas.find((c) => c.saldo > 0);
    if (pendiente) {
      setError("");
      try {
        const r = await apiAcademia.recordatorio(pendiente.id);
        abrirWhatsapp(r.url);
        setAviso("Mensaje armado: queda anotado el recordatorio.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo armar el mensaje");
      }
      return;
    }
    const destino = a!.menor && tutor ? tutor : null;
    const telefono = destino?.telefono ?? a!.telefono;
    const nombre = (destino?.nombre ?? a!.nombres).split(" ")[0];
    const detalle = vivas
      .filter((c) => c.saldo > 0)
      .map((c) => `${nombreCuota(c)}: ${fmtMoney(c.saldo)} (vence ${fechaCorta(c.vence)})`)
      .join("\n");
    const texto = `Hola ${nombre}, el estado de cuenta de ${a!.nombres} en ${actual ? nombreDe(actual.grupo.carrera) : negocio?.nombre ?? ""}: saldo ${fmtMoney(saldo)}.${detalle ? `\n${detalle}` : ""}`;
    const url = enlaceWhatsApp(telefono, texto);
    if (url) abrirWhatsapp(url);
    else setError("No hay un teléfono cargado para mandarlo.");
  }

  async function hacer(fn: () => Promise<unknown>, ok: string) {
    setError("");
    try {
      await fn();
      setAviso(ok);
      ficha.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar");
    }
  }

  const accionesFicha: AccionMenu[] = [
    ...(sinMontos
      ? []
      : [
          {
            clave: "estado",
            etiqueta: saldo > 0 ? `Enviar QR por WhatsApp${a.menor && tutor ? " al tutor" : ""}` : `Enviar estado de cuenta${a.menor && tutor ? " al tutor" : ""}`,
            icono: "phone" as const,
            onClick: () => void enviarEstado(),
          },
        ]),
    ...(inscribe
      ? [
          { clave: "editar", etiqueta: "Editar datos", onClick: () => setEditando(true), separar: true },
          { clave: "tutor", etiqueta: "Agregar tutor", onClick: () => setAgregandoTutor(true) },
        ]
      : []),
  ];

  /**
   * Cambiar de grupo: si el nuevo está lleno se confirma y se reintenta con
   * `confirmarSobreCupo`; a otra sede (403 CAMBIO_DE_SEDE) lo dice el backend.
   */
  async function cambiarGrupo(inscripcionId: number, grupoId: number, sobreCupo = false) {
    setError("");
    try {
      await apiAcademia.cambiarGrupo(inscripcionId, grupoId, sobreCupo);
      setAviso("Cambiado de grupo.");
      ficha.recargar();
    } catch (e) {
      if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.GRUPO_LLENO) {
        setGrupoLleno({
          texto: `El grupo tiene ${Number(e.detalle.inscritos ?? 0)} inscritos y el cupo es de ${Number(e.detalle.cupo ?? 0)}. ¿Lo pasás igual?`,
          seguir: () => void cambiarGrupo(inscripcionId, grupoId, true),
        });
      } else {
        setError(e instanceof Error ? e.message : "No se pudo cambiar de grupo");
      }
    }
  }

  const accionesInscripcion: AccionMenu[] =
    actual && inscribe && !["RETIRADA", "CONCLUIDA"].includes(actual.estado)
      ? [
          { clave: "grupo", etiqueta: "Cambiar de grupo", onClick: () => setCambiandoGrupo(actual) },
          { clave: "plan", etiqueta: "Cambiar de plan", onClick: () => setCambiandoPlan(actual) },
          { clave: "retirar", etiqueta: "Retirar", onClick: () => setRetirando(actual), peligrosa: true, separar: true },
        ]
      : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <nav className="text-[13px] text-texto-3">
        <Link to="/academia/alumnos" className="hover:underline">
          {p.Alumnos}
        </Link>{" "}
        / {nombreAlumno(a)}
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-50 text-base font-bold text-primary-700">
            {iniciales(`${a.nombres} ${a.apellidos}`)}
          </span>
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold text-texto">{nombreAlumno(a)}</h1>
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-texto-3">
              {a.menor && (
                <span className="rounded-lg border border-borde px-2 py-0.5 text-[12px] font-semibold text-texto-2">
                  Menor{a.edad != null ? ` · ${a.edad} años` : ""}
                </span>
              )}
              {estado && estado.tono !== "normal" && (
                <span className={estado.tono === "ambar" ? "font-semibold text-warning-text" : ""}>{estado.texto}</span>
              )}
              <span>
                {[a.codigo, a.ci && `CI ${a.ci}${a.ciExpedido ? ` ${a.ciExpedido}` : ""}`, a.fechaNacimiento && `nació ${fmtFecha(a.fechaNacimiento)}`, a.telefono]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cobra && !sinMontos && saldo > 0 && actual && (
            <Boton onClick={() => navigate(rutaCobroInscripcion(actual.id, actual.grupo.sede))}>Cobrar {fmtMoney(vencido > 0 ? vencido : saldo)}</Boton>
          )}
          <MenuMas etiqueta={`Más acciones del ${p.alumno}`} acciones={accionesFicha} />
        </div>
      </header>

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-8">
          {actual ? (
            <section aria-label="Inscripción actual" className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-texto-4">Inscripción actual</p>
                  <h2 className="text-base font-bold text-texto">
                    <Link to={`/academia/grupos/${actual.grupo.id}`} className="hover:underline">
                      {actual.grupo.nombre}
                    </Link>
                  </h2>
                  <p className="text-[13px] text-texto-3">
                    {[
                      `${p.Sede} ${nombreDe(actual.grupo.sede)}`,
                      actual.plan ? `plan ${actual.plan.nombre}` : null,
                      actual.descuento
                        ? `${actual.descuento.tipo === "BECA" ? "beca" : "promoción"}${actual.descuento.pct != null ? ` ${actual.descuento.pct} %` : ""}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {actual.estado === "RETIRADA" && (actual.retiradaEn || actual.retiroMotivo) && (
                    <p className="text-[13px] text-texto-3">
                      Retirado{actual.retiradaEn ? ` el ${fmtFecha(actual.retiradaEn)}` : ""}
                      {actual.retiroMotivo ? ` · ${actual.retiroMotivo}` : ""}
                    </p>
                  )}
                </div>
                <MenuMas etiqueta="Acciones de la inscripción" acciones={accionesInscripcion} />
              </div>

              {!sinMontos && (
                <>
                  <EstadoCuenta inscripcion={actual} />
                  <p className="text-sm text-texto-2">
                    Saldo del curso <span className="font-bold tabular-nums text-texto">{fmtMoney(saldo)}</span>
                    {vencido > 0 && <span className="font-semibold text-danger-text"> · {fmtMoney(vencido)} vencido</span>}
                  </p>
                  {actual.pagos.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-bold text-texto">Pagos</h3>
                      <ul className="divide-y divide-borde-soft border-y border-borde-soft">
                        {actual.pagos.map((x, i) => (
                          <li key={`${x.ventaId}-${x.cuotaId}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                            <span className="min-w-0 truncate text-texto-2">
                              {fmtFecha(x.fecha)} · {nombreDe(x.sede)}
                              {x.comprobante ? ` · recibo ${x.comprobante}` : ""}
                            </span>
                            <span className="shrink-0 tabular-nums text-texto">{fmtMoney(x.monto)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </section>
          ) : (
            <p className="text-sm text-texto-3">No tiene inscripciones.</p>
          )}

          {a.fotos && (
            <FotosAlumno
              alumnoId={a.id}
              fotos={a.fotos}
              veImagenes={tienePermiso(usuario, "academia.fotos")}
              reemplaza={inscribe}
              onCambio={ficha.recargar}
            />
          )}

          <Historial alumno={a} />
        </div>

        <aside className="space-y-6">
          <section aria-label="Tutores" className="space-y-2">
            <h2 className="text-sm font-bold text-texto">{a.tutores.length > 1 ? "Tutores" : "Tutor"}</h2>
            {a.tutores.length === 0 ? (
              <p className="text-sm text-texto-3">{a.menor ? "Es menor y no tiene tutor cargado." : "Sin tutor."}</p>
            ) : (
              <ul className="space-y-3">
                {a.tutores.map((t) => {
                  const url = enlaceWhatsApp(t.telefono, `Hola ${t.nombre.split(" ")[0]}`);
                  return (
                    <li key={t.id} className="space-y-1">
                      <p className="text-sm font-semibold text-texto">
                        {t.nombre}
                        {t.principal && a.tutores.length > 1 && <span className="font-normal text-texto-3"> · principal</span>}
                      </p>
                      <p className="text-[13px] text-texto-3">
                        {t.parentesco}
                        {t.telefono ? ` · ${t.telefono}` : ""}
                        {t.ci ? ` · CI ${t.ci}` : ""}
                      </p>
                      <div className="flex gap-3 text-[13px]">
                        {url && (
                          <button type="button" onClick={() => abrirWhatsapp(url)} className="font-semibold text-primary-700 hover:underline">
                            WhatsApp
                          </button>
                        )}
                        {inscribe && (
                          <button
                            type="button"
                            onClick={() => void hacer(() => apiAcademia.quitarTutor(a.id, t.id), "Tutor quitado.")}
                            className="text-texto-3 hover:underline"
                          >
                            Quitar
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {a.menor && a.tutores.length > 0 && (
              <p className="text-[12px] text-texto-4">Los recordatorios van al tutor.</p>
            )}
          </section>
          {actual && (
            <section aria-label="Asistencia y notas" className="space-y-1">
              <h2 className="text-sm font-bold text-texto">Asistencia y notas</h2>
              <p className="flex gap-3 text-sm">
                <Link to={`/academia/grupos/${actual.grupo.id}/lista`} className="font-semibold text-primary-700 hover:underline">
                  Asistencia del grupo
                </Link>
                <Link to={`/academia/grupos/${actual.grupo.id}/notas`} className="font-semibold text-primary-700 hover:underline">
                  Notas
                </Link>
              </p>
            </section>
          )}
          {a.observaciones && (
            <section className="space-y-1">
              <h2 className="text-sm font-bold text-texto">Observaciones</h2>
              <p className="whitespace-pre-line text-sm text-texto-2">{a.observaciones}</p>
            </section>
          )}
        </aside>
      </div>

      {retirando && (
        <PedirMotivo
          titulo={`Retirar a ${a.nombres}`}
          texto="Las cuotas futuras se anulan; las vencidas quedan."
          motivos={MOTIVOS_RETIRO}
          etiquetaOk="Retirar"
          peligroso
          onCancelar={() => setRetirando(null)}
          onConfirmar={async (motivo) => {
            const ins = retirando;
            setRetirando(null);
            await hacer(() => apiAcademia.retirar(ins.id, motivo), "Retirado del grupo.");
          }}
        />
      )}
      {cambiandoGrupo && (
        <CambiarGrupo
          inscripcion={cambiandoGrupo}
          onCerrar={() => setCambiandoGrupo(null)}
          onCambiar={async (grupoId) => {
            setCambiandoGrupo(null);
            await cambiarGrupo(cambiandoGrupo.id, grupoId);
          }}
        />
      )}
      <Confirmar
        abierto={!!grupoLleno}
        titulo="El grupo está lleno"
        texto={grupoLleno?.texto ?? ""}
        etiquetaOk="Pasarlo igual"
        onCancel={() => setGrupoLleno(null)}
        onOk={() => {
          const seguir = grupoLleno?.seguir;
          setGrupoLleno(null);
          seguir?.();
        }}
      />
      {cambiandoPlan && (
        <CambiarPlan
          inscripcion={cambiandoPlan}
          onCerrar={() => setCambiandoPlan(null)}
          onCambiar={async (planId) => {
            setCambiandoPlan(null);
            await hacer(() => apiAcademia.cambiarPlan(cambiandoPlan.id, planId), "Plan cambiado: las cuotas se rearmaron.");
          }}
        />
      )}
      {editando && (
        <EditarAlumno
          alumno={a}
          veDatosPersonales={veDatosPersonales}
          onCerrar={() => setEditando(false)}
          onGuardado={(nuevo) => {
            setEditando(false);
            ficha.setDatos(nuevo);
            setAviso("Datos guardados.");
          }}
        />
      )}
      {agregandoTutor && (
        <AgregarTutor
          onCerrar={() => setAgregandoTutor(false)}
          onAgregar={async (t) => {
            setAgregandoTutor(false);
            await hacer(() => apiAcademia.agregarTutor(a.id, t), "Tutor agregado.");
          }}
        />
      )}
    </div>
  );
}

/** El estado de cuenta: tabla en escritorio, renglones en el celular. */
function EstadoCuenta({ inscripcion }: { inscripcion: InscripcionDetalle }) {
  const cuotas = inscripcion.cuotas;
  if (!cuotas.length) return <p className="text-sm text-texto-3">Sin cuotas.</p>;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-bold text-texto">Estado de cuenta</h3>
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="text-left text-[12px] text-texto-3">
            <th className="py-1.5 font-normal">Cuota</th>
            <th className="py-1.5 font-normal">Cubre</th>
            <th className="py-1.5 font-normal">Vence</th>
            <th className="py-1.5 text-right font-normal">Monto</th>
            <th className="py-1.5 text-right font-normal">Pagado</th>
            <th className="py-1.5 text-right font-normal">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde-soft border-t border-borde-soft">
          {cuotas.map((c) => {
            const anulada = c.estado === "ANULADA";
            return (
              <tr key={c.id} className={anulada ? "text-texto-4 line-through" : "text-texto-2"}>
                <td className="py-2 text-texto">{c.concepto || `Cuota ${c.numero}`}</td>
                <td className="py-2">{textoCubre(c.materiaOrdenes)}</td>
                <td className="py-2">{fechaCorta(c.vence)}</td>
                <td className="py-2 text-right tabular-nums">{fmtMoney(c.monto)}</td>
                <td className="py-2 text-right tabular-nums">{fmtMoney(c.pagado)}</td>
                <td className={`py-2 text-right ${c.vencida && !anulada ? "font-semibold text-danger-text" : ""}`}>
                  {anulada
                    ? "anulada"
                    : c.estado === "PAGADA"
                      ? "pagada"
                      : c.vencida
                        ? `vencida ${c.diasAtraso} d`
                        : c.estado === "PARCIAL"
                          ? "abono"
                          : "pendiente"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="space-y-2 md:hidden">
        {cuotas.map((c) => {
          const t = textoCuota(c);
          return (
            <li key={c.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className={c.estado === "ANULADA" ? "text-texto-4 line-through" : "text-texto"}>{nombreCuota(c)}</span>
              <span className={`text-right tabular-nums ${t.urgente ? "font-semibold text-danger-text" : "text-texto-3"}`}>{t.texto}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Historial({ alumno }: { alumno: AlumnoDetalle }) {
  const eventos = alumno.inscripciones
    .flatMap((i) => i.eventos.map((e) => ({ ...e, grupo: i.grupo.nombre })))
    .sort((a, b) => (a.en < b.en ? 1 : -1));
  const anteriores = alumno.inscripciones.slice(1);
  if (!eventos.length && !anteriores.length) return null;
  return (
    <section aria-label="Historial" className="space-y-2">
      <h2 className="text-sm font-bold text-texto">Historial</h2>
      <ul className="space-y-2">
        {eventos.map((e, i) => {
          const t = textoEvento(e);
          return (
            <li key={i} className="text-[13px]">
              <span className="text-texto-2">
                {t.titulo}
                {t.detalle ? ` · ${t.detalle}` : ""}
              </span>
              <span className="block text-[12px] text-texto-4">
                {fmtFecha(e.en)}
                {e.usuario ? ` · ${e.usuario}` : ""} · {e.grupo}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CambiarGrupo({
  inscripcion,
  onCerrar,
  onCambiar,
}: {
  inscripcion: InscripcionDetalle;
  onCerrar: () => void;
  onCambiar: (grupoId: number) => void;
}) {
  const grupos = useApi(() => apiAcademia.grupos({ pageSize: 100 }), []);
  const [grupoId, setGrupoId] = useState<number | null>(null);
  const opciones = (grupos.datos?.items ?? []).filter((g) => g.id !== inscripcion.grupo.id && g.estado !== "TERMINADO");
  return (
    <Modal
      abierto
      titulo="Cambiar de grupo"
      subtitulo={`Hoy en ${inscripcion.grupo.nombre}`}
      onClose={onCerrar}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton disabled={!grupoId} onClick={() => grupoId && onCambiar(grupoId)}>
            Cambiar
          </Boton>
        </>
      }
    >
      {grupos.cargando ? (
        <Cargando />
      ) : (
        <Campo label="Grupo nuevo">
          <Select value={grupoId ?? ""} onChange={(e) => setGrupoId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Elegí…</option>
            {opciones.map((g) => (
              <option key={g.id} value={g.id}>
                {nombreDe(g.carrera)} · {horarioGrupo(g)} · {nombreDe(g.sede)}
              </option>
            ))}
          </Select>
        </Campo>
      )}
      <ErrorMsg>{grupos.error}</ErrorMsg>
    </Modal>
  );
}

function CambiarPlan({
  inscripcion,
  onCerrar,
  onCambiar,
}: {
  inscripcion: InscripcionDetalle;
  onCerrar: () => void;
  onCambiar: (planId: number) => void;
}) {
  const grupo = useApi(() => apiAcademia.grupo(inscripcion.grupo.id), [inscripcion.grupo.id]);
  const [planId, setPlanId] = useState<number | null>(null);
  const planes = (grupo.datos?.planesOfrecidos ?? []).filter((x) => x.id !== inscripcion.plan?.id);
  return (
    <Modal
      abierto
      titulo="Cambiar de plan"
      subtitulo={
        inscripcion.plan
          ? `Hoy paga con ${inscripcion.plan.nombre}. Lo ya pagado se descuenta de las cuotas nuevas.`
          : "Lo ya pagado se descuenta de las cuotas nuevas."
      }
      onClose={onCerrar}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton disabled={!planId} onClick={() => planId && onCambiar(planId)}>
            Cambiar
          </Boton>
        </>
      }
    >
      {grupo.cargando ? (
        <Cargando />
      ) : planes.length === 0 ? (
        <p className="text-sm text-texto-3">El grupo no ofrece otro plan.</p>
      ) : (
        <div className="space-y-2" role="radiogroup" aria-label="Plan nuevo">
          {planes.map((pl) => (
            <button
              key={pl.id}
              type="button"
              role="radio"
              aria-checked={planId === pl.id}
              onClick={() => setPlanId(pl.id)}
              className={`flex w-full justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm ${
                planId === pl.id ? "border-primary bg-primary-50" : "border-borde hover:bg-muted"
              }`}
            >
              <span className="font-semibold text-texto">{pl.nombre}</span>
              <span className="tabular-nums text-texto-2">{fmtMoney(pl.total)}</span>
            </button>
          ))}
        </div>
      )}
      <ErrorMsg>{grupo.error}</ErrorMsg>
    </Modal>
  );
}

function EditarAlumno({
  alumno,
  veDatosPersonales,
  onCerrar,
  onGuardado,
}: {
  alumno: AlumnoDetalle;
  veDatosPersonales: boolean;
  onCerrar: () => void;
  onGuardado: (a: AlumnoDetalle) => void;
}) {
  const [f, setF] = useState({
    apellidos: alumno.apellidos,
    nombres: alumno.nombres,
    ci: alumno.ci ?? "",
    ciExpedido: alumno.ciExpedido ?? "",
    fechaNacimiento: alumno.fechaNacimiento ?? "",
    telefono: alumno.telefono ?? "",
    direccion: alumno.direccion ?? "",
    observaciones: alumno.observaciones ?? "",
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // Sin `cliente.datos_personales` ni `academia.inscribir` el CI viene null:
  // no se ofrece cambiarlo (mandarlo vacío lo borraría).
  const veCi = veDatosPersonales;

  async function guardar() {
    if (!f.apellidos.trim() || !f.nombres.trim()) return setError("Faltan los apellidos y los nombres.");
    setGuardando(true);
    setError("");
    try {
      const nuevo = await apiAcademia.editarAlumno(alumno.id, {
        apellidos: f.apellidos.trim(),
        nombres: f.nombres.trim(),
        ...(veCi
          ? {
              ci: f.ci.trim() || null,
              ciExpedido: f.ciExpedido || null,
              fechaNacimiento: f.fechaNacimiento || null,
            }
          : {}),
        telefono: f.telefono.trim() || null,
        direccion: f.direccion.trim() || null,
        observaciones: f.observaciones.trim() || null,
      });
      onGuardado(nuevo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Editar datos"
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="Apellidos">
          <Input value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} />
        </Campo>
        <Campo label="Nombres">
          <Input value={f.nombres} onChange={(e) => setF({ ...f, nombres: e.target.value })} />
        </Campo>
        {veCi && (
          <>
            <div className="grid grid-cols-[1fr_90px] gap-2">
              <Campo label="Carnet de identidad">
                <Input value={f.ci} inputMode="numeric" onChange={(e) => setF({ ...f, ci: e.target.value })} />
              </Campo>
              <Campo label="Expedido">
                <Select value={f.ciExpedido} onChange={(e) => setF({ ...f, ciExpedido: e.target.value })}>
                  <option value="">—</option>
                  {EXPEDIDOS.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </Select>
              </Campo>
            </div>
            <Campo label="Fecha de nacimiento">
              <Input type="date" value={f.fechaNacimiento} onChange={(e) => setF({ ...f, fechaNacimiento: e.target.value })} />
            </Campo>
          </>
        )}
        <Campo label="Teléfono">
          <Input inputMode="tel" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        </Campo>
        <Campo label="Dirección">
          <Input value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} />
        </Campo>
        <Campo label="Observaciones">
          <textarea
            rows={3}
            value={f.observaciones}
            onChange={(e) => setF({ ...f, observaciones: e.target.value })}
            className="w-full resize-y rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
          />
        </Campo>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

function AgregarTutor({
  onCerrar,
  onAgregar,
}: {
  onCerrar: () => void;
  onAgregar: (t: { nombre: string; telefono: string; parentesco: string; principal: boolean }) => void;
}) {
  const [t, setT] = useState({ nombre: "", telefono: "", parentesco: "Madre", principal: true });
  const [error, setError] = useState("");
  return (
    <Modal
      abierto
      titulo="Agregar tutor"
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton
            onClick={() => {
              if (!t.nombre.trim() || !t.telefono.trim()) return setError("Faltan el nombre y el WhatsApp.");
              onAgregar({ ...t, nombre: t.nombre.trim(), telefono: t.telefono.trim() });
            }}
          >
            Agregar
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="Nombre">
          <Input value={t.nombre} onChange={(e) => setT({ ...t, nombre: e.target.value })} />
        </Campo>
        <div className="grid grid-cols-2 gap-2">
          <Campo label="Parentesco">
            <Select value={t.parentesco} onChange={(e) => setT({ ...t, parentesco: e.target.value })}>
              {PARENTESCOS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </Campo>
          <Campo label="WhatsApp">
            <Input inputMode="tel" value={t.telefono} onChange={(e) => setT({ ...t, telefono: e.target.value })} />
          </Campo>
        </div>
        <label className="flex items-center gap-2 text-sm text-texto">
          <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary-boton)]" checked={t.principal} onChange={(e) => setT({ ...t, principal: e.target.checked })} />
          Es el principal (le llegan los avisos)
        </label>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
