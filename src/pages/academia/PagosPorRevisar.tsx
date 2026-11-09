import { useEffect, useState } from "react";
import PanelLateral from "../../components/PanelLateral";
import VisorFotos from "../../components/VisorFotos";
import { Boton, Cargando, ErrorMsg } from "../../components/ui";
import { ApiError } from "../../lib/api";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { EVENTO_PREINSCRIPCIONES } from "../../lib/academia/contadorPreinscripciones";
import { abrirWhatsapp } from "../../lib/academia/vista";
import type { EstadoPagoEnLinea, PagoEnLinea } from "../../lib/academia/tipos";
import { fmtMoney, tiempoRelativo } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import PedirMotivo from "../agenda/PedirMotivo";
import { BotonFila, Chip, ChipsFiltro, LISTA, Tarjeta } from "./piezas";

const MOTIVOS_RECHAZO = [
  "El monto no coincide con lo que se debe",
  "No vemos el pago en la cuenta del instituto",
  "El comprobante no se lee bien",
  "Otro",
] as const;

const ESTADOS: { clave: EstadoPagoEnLinea; label: string }[] = [
  { clave: "POR_REVISAR", label: "Por revisar" },
  { clave: "APROBADO", label: "Aprobados" },
  { clave: "RECHAZADO", label: "Rechazados" },
];

/** El cupo se pasó entre que el estudiante pagó y hoy (409 `GRUPO_LLENO` del backend). */
interface SinLugar {
  inscritos?: number;
  cupo?: number;
}

/**
 * M5 · Pagos por revisar (02-nov): los comprobantes que los estudiantes suben
 * desde la página del instituto con el QR fijo. La recepción (con
 * `academia.pagos_en_linea`, el permiso que el administrador le da desde
 * Roles; hasta el 08-nov era `academia.fotos`, que también entrega la cara y
 * el carnet de los menores) y el dueño los ven en grande y los **aprueban**
 * (se registra el cobro, sin caja ni PIN, y si era una preinscripción queda
 * inscrito) o los **rechazan con un motivo** (la deuda sigue intacta y el
 * estudiante puede subir otro). El aviso al estudiante es un botón de
 * WhatsApp: se manda a mano.
 *
 * Va en «Inscripciones online» (la recepción ya entra ahí para inscribir), en
 * el Panel de control del dueño y, si el negocio no tiene el formulario de la
 * página (sin «Inscripciones online»), en Cobranza. Sin comprobantes y sin
 * historial, no dibuja nada: un instituto sin QR fijo no ve una tarjeta vacía.
 */
export default function PagosPorRevisar({ sede }: { sede?: number | null }) {
  const [estado, setEstado] = useState<EstadoPagoEnLinea>("POR_REVISAR");
  const [abierto, setAbierto] = useState<PagoEnLinea | null>(null);
  const lista = useApi(() => apiAcademia.pagosEnLinea({ estado, sede, pageSize: 50 }), [estado, sede]);
  const hay = (lista.datos?.items.length ?? 0) > 0;
  // Pidió ver los otros estados: la tarjeta tiene que seguir ahí aunque este esté vacío.
  const [conHistorial, setConHistorial] = useState(false);

  useEffect(() => {
    if (estado !== "POR_REVISAR") setConHistorial(true);
  }, [estado]);

  // Sin permiso (403) o sin la función: nada que mostrar.
  if (lista.falla instanceof ApiError && (lista.falla.status === 403 || lista.falla.status === 404)) return null;
  if (!lista.cargando && !lista.error && !hay && estado === "POR_REVISAR" && !conHistorial) {
    // Mientras no haya nada que revisar la tarjeta se queda en una línea.
    return (
      <Tarjeta id="t-pagos" titulo="Pagos por revisar" contador={0} bajada="Los comprobantes que suben los estudiantes desde la página" sinRelleno>
        <p className="p-4 text-sm text-texto-3 sm:p-5">No hay comprobantes por revisar.</p>
        <div className="border-t border-borde-soft px-4 py-2.5 sm:px-5">
          <BotonFila variante="ghost" onClick={() => setEstado("APROBADO")}>
            Ver los ya resueltos
          </BotonFila>
        </div>
      </Tarjeta>
    );
  }

  const total = lista.datos?.total ?? 0;
  return (
    <>
      <Tarjeta
        id="t-pagos"
        titulo="Pagos por revisar"
        contador={estado === "POR_REVISAR" ? total : undefined}
        bajada="Los comprobantes que suben los estudiantes desde la página"
        barra={
          <div className="py-3">
            <ChipsFiltro<EstadoPagoEnLinea> etiqueta="Estado" valor={estado} opciones={ESTADOS} onChange={setEstado} />
          </div>
        }
        sinRelleno
      >
        {lista.error && !lista.datos ? (
          <div className="p-4 sm:p-5">
            <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
          </div>
        ) : lista.cargando && !lista.datos ? (
          <Cargando />
        ) : !hay ? (
          <p className="p-4 text-sm text-texto-3 sm:p-5">
            {estado === "POR_REVISAR" ? "No hay comprobantes por revisar." : "Todavía no hay ninguno en esta lista."}
          </p>
        ) : (
          <ul className={LISTA.lista}>
            {lista.datos!.items.map((p) => (
              <li key={p.id} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 ${LISTA.itemHover}`}>
                <span className="min-w-0 flex-1 basis-56">
                  <span className="block truncate text-sm font-semibold text-texto">{p.alumno}</span>
                  <span className="block truncate text-[12px] text-texto-3">
                    {p.curso} · {p.grupo} · {p.sede}
                  </span>
                  <span className="block text-[12px] text-texto-3">
                    {p.etiqueta} · {tiempoRelativo(p.creadoEn).toLowerCase()}
                    {p.estadoInscripcion === "PREINSCRITA" && p.estado === "POR_REVISAR" ? " · todavía preinscrito" : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-bold tabular-nums text-texto">{fmtMoney(p.monto)}</span>
                  {p.estado === "POR_REVISAR" ? (
                    <BotonFila onClick={() => setAbierto(p)} aria-label={`Revisar el comprobante de ${p.alumno}`}>
                      Revisar
                    </BotonFila>
                  ) : (
                    <>
                      <Chip tono={p.estado === "APROBADO" ? "verde" : "rojo"}>{p.estado === "APROBADO" ? "Aprobado" : "Rechazado"}</Chip>
                      <BotonFila variante="ghost" onClick={() => setAbierto(p)} aria-label={`Ver el comprobante de ${p.alumno}`}>
                        Ver
                      </BotonFila>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {abierto && (
        <PanelPago
          key={abierto.id}
          pago={abierto}
          onCerrar={() => setAbierto(null)}
          onResuelto={(p) => {
            // El panel se queda abierto con el resultado y el botón de WhatsApp.
            setAbierto(p);
            lista.recargar();
            // El número del menú también los cuenta: baja en el acto.
            window.dispatchEvent(new Event(EVENTO_PREINSCRIPCIONES));
          }}
        />
      )}
    </>
  );
}

function PanelPago({
  pago,
  onCerrar,
  onResuelto,
}: {
  pago: PagoEnLinea;
  onCerrar: () => void;
  onResuelto: (p: PagoEnLinea) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [sinImagen, setSinImagen] = useState(false);
  const [grande, setGrande] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [sinLugar, setSinLugar] = useState<SinLugar | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;
    let creada: string | null = null;
    apiAcademia
      .comprobanteComoUrl(pago.id)
      .then((u) => {
        creada = u;
        if (vigente) setUrl(u);
      })
      .catch(() => vigente && setSinImagen(true));
    return () => {
      vigente = false;
      if (creada) URL.revokeObjectURL?.(creada);
    };
  }, [pago.id]);

  async function aprobar(confirmarSobreCupo = false) {
    setOcupado(true);
    setError("");
    try {
      const r = await apiAcademia.aprobarPagoEnLinea(pago.id, confirmarSobreCupo ? { confirmarSobreCupo: true } : {});
      setSinLugar(null);
      onResuelto(r);
    } catch (e) {
      if (e instanceof ApiError && e.codigo === "GRUPO_LLENO") {
        // El cupo es un aviso que se confirma: lo decide quien está mirando.
        setSinLugar({ inscritos: Number(e.detalle?.inscritos) || undefined, cupo: Number(e.detalle?.cupo) || undefined });
      } else {
        setError(e instanceof Error ? e.message : "No se pudo aprobar");
      }
    } finally {
      setOcupado(false);
    }
  }

  const resuelto = pago.estado !== "POR_REVISAR";
  return (
    <PanelLateral
      abierto
      titulo={pago.alumno}
      subtitulo={`${pago.curso} · ${pago.grupo} · ${pago.sede}`}
      onClose={onCerrar}
      acciones={
        resuelto ? (
          pago.whatsapp ? (
            <Boton icono="phone" onClick={() => abrirWhatsapp(pago.whatsapp!.url)}>
              Avisar por WhatsApp
            </Boton>
          ) : (
            <span className="text-center text-[12px] text-texto-3">No dejó un teléfono válido para avisarle.</span>
          )
        ) : (
          <div className="flex gap-2">
            <Boton className="flex-1" icono="check" disabled={ocupado} onClick={() => void aprobar()}>
              {ocupado ? "Guardando…" : "Aprobar"}
            </Boton>
            <Boton variante="ghost" className="flex-1" disabled={ocupado} onClick={() => setRechazando(true)}>
              Rechazar
            </Boton>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-borde-soft bg-muted p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{pago.etiqueta}</p>
          <p className="text-2xl font-bold tabular-nums text-texto">{fmtMoney(pago.monto)}</p>
          <p className="mt-1 text-[12px] text-texto-3">
            Lo calculó el sistema con lo que el estudiante eligió. Compará con el comprobante.
          </p>
          {pago.estadoInscripcion === "PREINSCRITA" && !resuelto && (
            <p className="mt-2 text-[13px] text-texto-2">
              Todavía está preinscrito: al aprobar queda inscrito y ocupa un lugar del grupo.
            </p>
          )}
        </div>

        {resuelto && (
          <p
            role="status"
            className={`rounded-xl px-3.5 py-2.5 text-sm ${pago.estado === "APROBADO" ? "bg-emerald-50 text-emerald-700" : "bg-danger-bg text-danger-text"}`}
          >
            {pago.estado === "APROBADO"
              ? "Aprobado: el cobro quedó registrado como «Cobrado en línea» (no entra a ninguna caja)."
              : `Rechazado: ${pago.motivoRechazo ?? "sin motivo"}. La deuda sigue igual y el estudiante puede subir otro comprobante.`}
          </p>
        )}

        <figure>
          {url ? (
            <button
              type="button"
              onClick={() => setGrande(true)}
              aria-label="Ver el comprobante en grande"
              className="flex w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-xl border border-borde-soft bg-muted"
            >
              <img src={url} alt="Comprobante de pago" className="max-h-[420px] w-full object-contain" />
            </button>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-borde-soft bg-muted text-sm text-texto-3">
              {sinImagen ? "No se pudo cargar el comprobante." : "Cargando el comprobante…"}
            </div>
          )}
          <figcaption className="mt-1 text-[12px] text-texto-3">Lo subió el estudiante {tiempoRelativo(pago.creadoEn).toLowerCase()}</figcaption>
        </figure>

        {sinLugar && (
          <div role="alert" className="space-y-2 rounded-xl border border-warning bg-warning-bg p-3.5 text-sm text-warning-text">
            <p className="font-semibold">El grupo ya está lleno{sinLugar.cupo ? ` (${sinLugar.inscritos ?? sinLugar.cupo} de ${sinLugar.cupo} lugares)` : ""}.</p>
            <p>
              Mientras el estudiante pagaba, se ocuparon los lugares. Podés aprobarlo igual (el grupo pasa su cupo) o rechazar el
              comprobante y avisarle.
            </p>
            <Boton variante="ghost" disabled={ocupado} onClick={() => void aprobar(true)}>
              Aprobar igual y pasar el cupo
            </Boton>
          </div>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>

      {grande && <VisorFotos fotos={[{ url, titulo: "Comprobante de pago" }]} titulo={pago.alumno} onCerrar={() => setGrande(false)} />}
      {rechazando && (
        <PedirMotivo
          titulo="Rechazar el comprobante"
          texto="El estudiante sigue debiendo lo mismo y puede subir otro. Contale por qué para que no se repita."
          motivos={MOTIVOS_RECHAZO}
          etiquetaOk="Rechazar"
          peligroso
          faltaMotivo="Elegí el motivo: se lo mostramos al estudiante en su página."
          onCancelar={() => setRechazando(false)}
          onConfirmar={async (motivo) => {
            const r = await apiAcademia.rechazarPagoEnLinea(pago.id, motivo);
            setRechazando(false);
            onResuelto(r);
          }}
        />
      )}
    </PanelLateral>
  );
}
