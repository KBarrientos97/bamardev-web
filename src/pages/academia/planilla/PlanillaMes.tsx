import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import MenuMas, { type AccionMenu } from "../../../components/MenuMas";
import { Chips } from "../../../components/filtros";
import { AvisoOk, Boton, Cargando, Confirmar, ErrorMsg, Modal, useAviso, Vacio } from "../../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../../lib/academia/apiAcademia";
import { mesDe, sumarMeses, tituloMes } from "../../../lib/academia/calendario";
import { nombreDe } from "../../../lib/academia/formato";
import {
  datosClases,
  hayAtrasosSinJustificar,
  textoAtrasos,
  textoGrupoDelMes,
  textoGrupoPlanilla,
  textoPagado,
} from "../../../lib/academia/pagosDocente";
import type { FilaPlanillaMes, MetodoPagoPlanilla, PlanillaDocente, PlanillaMes as TPlanillaMes, ResumenClasesDocente } from "../../../lib/academia/tipos";
import { useFiltroSede } from "../../../lib/academia/useFiltroSede";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { cuentaDelMesDocente, METODOS_PAGO_DOCENTE, TEXTO_ESTADO_PLANILLA as TEXTO_ESTADO } from "../../../lib/academia/vista";
import { ApiError } from "../../../lib/api";
import { fmtMoney, iniciales } from "../../../lib/format";
import { tienePermiso } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { BotonFila, Chip, EncabezadoPagina, GrillaKpi, KpiTarjeta, PaginaAcademia, Tarjeta, type TonoChip } from "../piezas";
import ComprobantePago from "./ComprobantePago";
import HistorialPagos from "./HistorialPagos";

/**
 * E14 · Pagos a docentes (ronda 2, D2; rediseño de noviembre): el mes de cada
 * docente en una tarjeta, con de dónde sale lo que cobra («Cobrado de sus
 * estudiantes: Bs 4.500 × 20 %») y un solo botón, «Pagar Bs X». Lo calcula
 * todo el backend. A los docentes no se les retiene (dueño, 08-nov): el bruto
 * y el líquido son el mismo monto y se muestra uno.
 *
 * Hasta noviembre pagar eran dos pasos en la planilla del docente: cerrarla y
 * después «Registrar pago». El botón hace los dos en orden (cerrar y pagar,
 * con el método que se elige en el diálogo) y mantiene la pregunta de siempre
 * si el mes no terminó. El detalle, línea por línea, sigue en la planilla de
 * cada uno («Ver el detalle»).
 *
 * Vivía como pestaña de Configuración; ahora es una entrada del menú, en la
 * misma ruta.
 *
 * Tanda 2 de la revisión del 08-nov: cada tarjeta dice si el docente dio sus
 * clases (ítem 15: con lista, con llegada y los atrasos, que no descuentan
 * solos, D2), qué grupos dio con sus días y horario (ítem 4) y, pagada, con
 * qué se pagó (ítem 3). Al pagar, y desde un pago hecho, «Mandar el
 * comprobante» por WhatsApp (ítem 17, D4: el docente no lo ve en la app).
 *
 * Con `?docente=ID` (el botón «Pagos» de la pantalla Docentes, o «Historial de
 * pagos» de una tarjeta) se mira a ese docente solo: su tarjeta del mes, si
 * tiene algo, y su historial de pagos.
 */
export default function PlanillaMes() {
  const p = usePalabras();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const foco = Number(params.get("docente")) || null;
  const [nombreFoco, setNombreFoco] = useState("");
  const { usuario } = useAuth();
  const sede = useFiltroSede();
  const hoy = mesDe(new Date());
  const [mes, setMes] = useState(hoy);
  const datos = useApi(() => apiAcademia.planilla(mes, sede.sucursalId), [mes, sede.sucursalId]);
  const d = datos.datos;
  const liquida = tienePermiso(usuario, "planilla.liquidar");
  const [aviso, setAviso] = useAviso(6000);
  /** Sube con cada pago: las tarjetas vuelven a pedir su planilla (el estado y la fecha del pago). */
  const [version, setVersion] = useState(0);

  const acciones: AccionMenu[] = [
    { clave: "pct", etiqueta: `Cambiar el % de un ${p.carrera}`, icono: "percent", onClick: () => navigate("/configuracion/carreras") },
  ];

  /** En `?docente=` sólo su tarjeta; si este mes no tiene nada, ninguna. */
  const filas = d ? (foco ? d.docentes.filter((x) => x.personalId === foco) : d.docentes) : [];
  const verHistorial = (personalId: number) => setParams({ docente: String(personalId) });
  const alPagar = (texto: string) => {
    setAviso(texto);
    setVersion((v) => v + 1);
    datos.recargar();
  };

  const porPagar = d ? d.docentes.filter((x) => x.estado !== "PAGADA").reduce((s, x) => s + x.liquido, 0) : 0;
  const pagado = d ? d.docentes.filter((x) => x.estado === "PAGADA").reduce((s, x) => s + x.liquido, 0) : 0;
  const pagadas = d ? d.docentes.filter((x) => x.estado === "PAGADA").length : 0;

  return (
    <PaginaAcademia ancho="max-w-5xl">
      <EncabezadoPagina
        titulo={foco ? `Pagos a ${nombreFoco || filas[0]?.nombre || p.docente}` : `Pagos a ${p.docente}s`}
        volver={foco ? { a: "/academia/planilla", texto: `Todos los ${p.docente}s` } : undefined}
        bajada={d && !foco ? subtitulo(d, mes === hoy, sede.nombre, p.docente) : undefined}
        acciones={
          <>
            <div role="group" aria-label="Mes" className="flex h-11 items-center gap-0.5 rounded-xl border border-borde bg-white px-1 sm:h-[42px]">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => setMes(sumarMeses(mes, -1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted"
              >
                <Icon name="chevronLeft" size={16} />
              </button>
              <span className="min-w-[8.5rem] text-center text-[13px] font-semibold text-texto">{tituloMes(mes)}</span>
              <button
                type="button"
                aria-label="Mes siguiente"
                // Hasta un mes después del actual (QA 23-oct): las líneas de los
                // módulos que empiezan el mes que viene ya se pueden mirar.
                disabled={mes >= sumarMeses(hoy, 1)}
                onClick={() => setMes(sumarMeses(mes, 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
            <MenuMas etiqueta="Más acciones de los pagos" acciones={acciones} />
          </>
        }
      />

      {sede.selector}
      <AvisoOk>{aviso}</AvisoOk>

      {datos.error && !d ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : foco ? (
        <>
          {filas.length === 0 ? (
            <p className="card px-4 py-3 text-sm text-texto-3">En {tituloMes(mes).toLowerCase()} no tiene nada que cobrar.</p>
          ) : (
            <ul aria-label={`Pagos a ${p.docente}s`} className="space-y-3">
              {filas.map((x) => (
                <TarjetaDocente key={`${x.personalId}-${mes}`} fila={x} mes={mes} version={version} liquida={liquida} onPagado={alPagar} />
              ))}
            </ul>
          )}
          <HistorialPagos key={foco} personalId={foco} version={version} onDocente={(h) => setNombreFoco(h.docente.nombre)} />
        </>
      ) : d.docentes.length === 0 ? (
        <Tarjeta etiqueta="Sin pagos">
          <Vacio icono="fileText" titulo={`Ningún ${p.docente} tiene ${p.materias} este mes`} />
        </Tarjeta>
      ) : (
        <>
          {/* El tercero es el que cuenta para cobrar; las clases dadas van en cada tarjeta (ítem 15). */}
          <section aria-label="Resumen del mes">
            <GrillaKpi columnas={3}>
              <KpiTarjeta
                icono="coins"
                tono={porPagar > 0 ? "ok" : "normal"}
                etiqueta={mes === hoy ? "Por pagar este mes" : "Por pagar"}
                valor={fmtMoney(porPagar)}
                pie={mes === hoy ? "provisorio: el mes no terminó" : `${d.docentes.length - pagadas} de ${d.docentes.length} sin pagar`}
              />
              <KpiTarjeta
                icono="check"
                etiqueta="Ya pagado"
                valor={fmtMoney(pagado)}
                pie={`${pagadas} de ${d.docentes.length} ${d.docentes.length === 1 ? p.docente : `${p.docente}s`}`}
              />
              <KpiTarjeta
                icono="users"
                etiqueta={`${p.Alumnos} que cuentan`}
                valor={`${d.docentes.reduce((s, x) => s + x.cuentan, 0)} de ${d.docentes.reduce((s, x) => s + x.total, 0)}`}
                pie="pagaron el módulo completo"
              />
            </GrillaKpi>
          </section>

          <ul aria-label={`Pagos a ${p.docente}s`} className="space-y-3">
            {d.docentes.map((x) => (
              <TarjetaDocente
                key={`${x.personalId}-${mes}`}
                fila={x}
                mes={mes}
                version={version}
                liquida={liquida}
                onHistorial={() => verHistorial(x.personalId)}
                onPagado={alPagar}
              />
            ))}
          </ul>
        </>
      )}
    </PaginaAcademia>
  );
}

/** En curso en gris, cerrada (falta pagarla) en ámbar, pagada en verde. */
const CHIP_ESTADO: Record<FilaPlanillaMes["estado"], TonoChip> = {
  EN_CURSO: "gris",
  CERRADA: "ambar",
  PAGADA: "verde",
};

/**
 * Un docente del mes: quién es, de dónde sale lo que cobra y cuánto se le
 * paga. Su planilla (`GET /academia/planilla/:id`) se pide aparte para la
 * cuenta, los grupos y la fecha del pago: la lista del mes no los trae.
 */
function TarjetaDocente({
  fila: x,
  mes,
  version,
  liquida,
  onPagado,
  onHistorial,
}: {
  fila: FilaPlanillaMes;
  mes: string;
  version: number;
  liquida: boolean;
  onPagado: (aviso: string) => void;
  /** «Historial de pagos»; sin esto (ya se está mirando su historial) no va. */
  onHistorial?: () => void;
}) {
  const p = usePalabras();
  const detalle = useApi(() => apiAcademia.planillaDocente(x.personalId, mes).catch(() => null), [x.personalId, mes, version]);
  const det = detalle.datos;
  const [pidiendo, setPidiendo] = useState(false);
  const [metodo, setMetodo] = useState<MetodoPagoPlanilla>("EFECTIVO");
  const [mesSinTerminar, setMesSinTerminar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  /** El comprobante abierto: después de pagar, o con «Mandar el comprobante». */
  const [comprobante, setComprobante] = useState(false);
  const sinPago = x.liquido <= 0;
  const grupos = det ? gruposDeTarjeta(det) : [];
  const carreras = !grupos.length && det?.grupos?.length ? [...new Set(det.grupos.map((g) => nombreDe(g.carrera)))].join(", ") : "";
  const cuenta = det ? cuentaDelMesDocente(det) : null;
  const clases = x.clases ?? det?.clases ?? null;

  /**
   * Cerrar y pagar, en ese orden (lo que eran «Cerrar planilla» y «Registrar
   * pago»). Si el mes no terminó, el backend lo dice (MES_EN_CURSO) y se
   * pregunta antes de forzar el cierre; si ya estaba cerrada, se paga.
   */
  async function pagar(forzar = false) {
    setOcupado(true);
    setError("");
    try {
      if (x.estado === "EN_CURSO") {
        try {
          await apiAcademia.cerrarPlanilla(x.personalId, mes, forzar);
        } catch (e) {
          if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.MES_EN_CURSO) {
            setPidiendo(false);
            setMesSinTerminar(true);
            return;
          }
          // Otro la cerró mientras tanto: se sigue con el pago.
          if (!(e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.PLANILLA_CERRADA)) throw e;
        }
      }
      await apiAcademia.pagarPlanilla(x.personalId, mes, metodo);
      setPidiendo(false);
      // Ítem 17: recién pagado, el comprobante para mandárselo.
      if (!sinPago) setComprobante(true);
      onPagado(
        sinPago
          ? `La planilla de ${x.nombre} quedó resuelta sin pago: no salió dinero ni se registró ningún gasto.`
          : `Pagaste ${fmtMoney(x.liquido)} a ${x.nombre} (${METODOS_PAGO_DOCENTE.find(([k]) => k === metodo)?.[1] ?? metodo}): quedó como gasto de sueldos.`,
      );
    } catch (e) {
      setPidiendo(false);
      setError(e instanceof Error ? e.message : "No se pudo registrar el pago");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <li aria-label={x.nombre} className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-700"
        >
          {iniciales(x.nombre)}
        </span>
        <div className="min-w-0 flex-1 basis-56 space-y-1">
          <p className="text-[15px] font-bold text-texto">{x.nombre}</p>
          {grupos.length ? (
            // Ítem 4: qué grupos dio, con sus días y su horario.
            <ul aria-label={`Grupos de ${x.nombre}`} className="space-y-0.5 text-[13px] text-texto-3">
              {grupos.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-texto-3">
              {x.grupos} {x.grupos === 1 ? "grupo" : "grupos"}
              {carreras ? ` · ${carreras}` : ""}
            </p>
          )}
          {cuenta && <p className="text-[13px] text-texto-2">{cuenta}</p>}
          {extraDocente(x) && <p className="text-[12px] text-texto-3">{extraDocente(x)}</p>}
          {clases && <ClasesDelMes clases={clases} docente={p.docente} />}
          <div className="flex flex-wrap gap-x-4">
            <Link
              to={`/academia/planilla/${x.personalId}?mes=${mes}`}
              aria-label={`Ver el detalle de ${x.nombre}`}
              className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-primary-700 hover:underline sm:min-h-0"
            >
              Ver el detalle
              <Icon name="chevronRight" size={14} />
            </Link>
            {onHistorial && (
              <button
                type="button"
                onClick={onHistorial}
                aria-label={`Historial de pagos de ${x.nombre}`}
                className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-primary-700 hover:underline sm:min-h-0"
              >
                Historial de pagos
                <Icon name="chevronRight" size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
          <span className="sm:text-right">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-texto-4">A pagar</span>
            <span className="block text-2xl font-bold tabular-nums tracking-tight text-texto">{fmtMoney(x.liquido)}</span>
          </span>
          {x.estado === "PAGADA" ? (
            <>
              {/* Ítem 3: con qué se pagó, no sólo cuándo. */}
              <Chip tono="verde" className="self-start text-[13px] sm:self-end">
                {sinPago ? "Resuelta sin pago" : textoPagado(x.pago ?? det?.pago, det?.pagadaEn)}
              </Chip>
              {!sinPago && (
                <BotonFila icono="phone" className="min-h-11 sm:min-h-0" onClick={() => setComprobante(true)} aria-label={`Mandar el comprobante a ${x.nombre}`}>
                  Mandar el comprobante
                </BotonFila>
              )}
            </>
          ) : liquida ? (
            <Boton icono="billetera" className="min-h-11" disabled={ocupado} onClick={() => setPidiendo(true)}>
              {sinPago ? "Cerrar sin pago" : `Pagar ${fmtMoney(x.liquido)}`}
            </Boton>
          ) : (
            <Chip tono={CHIP_ESTADO[x.estado]} className="self-start sm:self-end">
              {TEXTO_ESTADO[x.estado]}
            </Chip>
          )}
        </div>
      </div>
      <ErrorMsg>{error}</ErrorMsg>
      {comprobante && <ComprobantePago personalId={x.personalId} mes={mes} onClose={() => setComprobante(false)} />}

      <Modal
        abierto={pidiendo}
        titulo={sinPago ? "Cerrar sin pago" : `Pagar a ${x.nombre}`}
        onClose={() => !ocupado && setPidiendo(false)}
        ancho="max-w-sm"
        acciones={
          <>
            <Boton variante="ghost" onClick={() => setPidiendo(false)} disabled={ocupado}>
              Cancelar
            </Boton>
            <Boton onClick={() => void pagar()} disabled={ocupado}>
              {ocupado ? "Un momento…" : sinPago ? "Cerrar sin pago" : `Pagar ${fmtMoney(x.liquido)}`}
            </Boton>
          </>
        }
      >
        <div className="space-y-4">
          {sinPago ? (
            <p className="text-sm text-texto-2">
              El líquido de {x.nombre} por {tituloMes(mes).toLowerCase()} es <b className="tabular-nums">{fmtMoney(x.liquido)}</b>: este mes no sale dinero y no
              se registra ningún gasto de sueldos. Lo que quedó en contra se resuelve en la planilla del mes siguiente. Se cierra la planilla, se da por
              resuelta y no se deshace.
            </p>
          ) : (
            <>
              <p className="text-sm text-texto-2">
                ¿Pagar <b className="tabular-nums">{fmtMoney(x.liquido)}</b> a {x.nombre} por {tituloMes(mes).toLowerCase()}?
                {x.estado === "EN_CURSO" ? " Se cierra su planilla del mes y" : ""} queda como gasto de sueldos: no se deshace.
              </p>
              <div className="space-y-2">
                <span className="block text-[13px] font-semibold text-texto-2">Cómo se le paga</span>
                <Chips titulo="Método" valor={metodo} opciones={METODOS_PAGO_DOCENTE} onChange={setMetodo} />
              </div>
            </>
          )}
        </div>
      </Modal>

      <Confirmar
        abierto={mesSinTerminar}
        titulo="El mes no terminó"
        texto={`Si la cerrás ahora, lo que se pague después entra en la planilla del mes siguiente. ¿Cerrarla igual y pagarle a ${x.nombre}?`}
        etiquetaOk={sinPago ? "Cerrar igual" : "Cerrar igual y pagar"}
        procesando={ocupado}
        onCancel={() => setMesSinTerminar(false)}
        onOk={() => {
          setMesSinTerminar(false);
          void pagar(true);
        }}
      />
    </li>
  );
}

/**
 * Ítem 15: si dio sus clases del mes, al lado del monto. Lo que pide mirarlo
 * (clases pasadas sin lista, atrasos sin justificar) va en ámbar; los atrasos
 * no descuentan solos (D2): decide el admin.
 */
function ClasesDelMes({ clases, docente }: { clases: ResumenClasesDocente; docente: string }) {
  const c = datosClases(clases);
  if (!c) return null;
  const atrasos = hayAtrasosSinJustificar(clases.atrasos);
  return (
    <div role="group" aria-label="Clases del mes" className="mt-1 space-y-1.5 rounded-xl bg-muted px-3 py-2.5">
      <p className="text-[13px] font-semibold text-texto-2">{c.titulo}</p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-texto-3">
        {c.datos.map((x) =>
          x.tono === "aviso" ? (
            <Chip key={x.texto} tono="ambar">
              {x.texto}
            </Chip>
          ) : (
            <span key={x.texto}>{x.texto}</span>
          ),
        )}
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-texto-3">
        <Icon name="clock" size={14} />
        {atrasos ? <Chip tono="ambar">{textoAtrasos(clases.atrasos)}</Chip> : <span>{textoAtrasos(clases.atrasos)}</span>}
        {clases.atrasos.cantidad > 0 && <span className="text-[12px] text-texto-4">no se descuentan solos: decidís vos</span>}
      </p>
      {clases.porReemplazo > 0 && <p className="text-[12px] text-texto-4">La clase que dio un reemplazo se le paga igual al {docente} del módulo.</p>}
    </div>
  );
}

/**
 * Los grupos de la tarjeta, con días y horario: los que dio en el mes (por sus
 * clases) o, si el backend no los manda, los módulos de la planilla.
 */
function gruposDeTarjeta(det: PlanillaDocente): string[] {
  if (det.gruposDelMes?.length) return det.gruposDelMes.map(textoGrupoDelMes);
  return [...new Set((det.grupos ?? []).map(textoGrupoPlanilla))];
}

/** "+ 2 de meses anteriores", "1 ajuste", "3 postergados", "todos pagaron". */
function extraDocente(x: TPlanillaMes["docentes"][number]): string {
  // Bug 4: un cobro anulado o repuesto de un módulo ya liquidado cambia el bruto; se avisa desde la lista.
  if (x.ajustes) return `${x.ajustes} ${x.ajustes === 1 ? "ajuste" : "ajustes"} de cobros anulados o repuestos`;
  if (x.atrasados) return `+ ${x.atrasados} de meses anteriores`;
  if (x.postergados) return `${x.postergados} ${x.postergados === 1 ? "postergado" : "postergados"}`;
  if (x.total && x.cuentan === x.total) return "todos pagaron";
  return "";
}

function subtitulo(d: TPlanillaMes, enCurso: boolean, sede: string, docente: string): string {
  const n = d.docentes.length;
  // Ítem 23: la palabra del instituto («profesor», «instructor»), no «docente» a mano.
  return [`${n} ${n === 1 ? docente : `${docente}s`}`, sede || null, enCurso ? "en curso, se cierra a fin de mes" : null].filter(Boolean).join(" · ");
}
