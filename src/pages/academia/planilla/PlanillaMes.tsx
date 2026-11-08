import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import MenuMas, { type AccionMenu } from "../../../components/MenuMas";
import { Chips } from "../../../components/filtros";
import { AvisoOk, Boton, Cargando, Confirmar, ErrorMsg, Modal, useAviso, Vacio } from "../../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../../lib/academia/apiAcademia";
import { mesDe, sumarMeses, tituloMes } from "../../../lib/academia/calendario";
import { fechaCorta, nombreDe } from "../../../lib/academia/formato";
import type { FilaPlanillaMes, MetodoPagoPlanilla, PlanillaMes as TPlanillaMes } from "../../../lib/academia/tipos";
import { useFiltroSede } from "../../../lib/academia/useFiltroSede";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { cuentaDelMesDocente, METODOS_PAGO_DOCENTE, TEXTO_ESTADO_PLANILLA as TEXTO_ESTADO } from "../../../lib/academia/vista";
import { ApiError } from "../../../lib/api";
import { fmtMoney, iniciales, isoDia } from "../../../lib/format";
import { tienePermiso } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { Chip, EncabezadoPagina, GrillaKpi, KpiTarjeta, PaginaAcademia, Tarjeta, type TonoChip } from "../piezas";

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
 */
export default function PlanillaMes() {
  const p = usePalabras();
  const navigate = useNavigate();
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

  const porPagar = d ? d.docentes.filter((x) => x.estado !== "PAGADA").reduce((s, x) => s + x.liquido, 0) : 0;
  const pagado = d ? d.docentes.filter((x) => x.estado === "PAGADA").reduce((s, x) => s + x.liquido, 0) : 0;
  const pagadas = d ? d.docentes.filter((x) => x.estado === "PAGADA").length : 0;

  return (
    <PaginaAcademia ancho="max-w-5xl">
      <EncabezadoPagina
        titulo={`Pagos a ${p.docente}s`}
        bajada={d ? subtitulo(d, mes === hoy, sede.nombre) : undefined}
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
      ) : d.docentes.length === 0 ? (
        <Tarjeta etiqueta="Sin pagos">
          <Vacio icono="fileText" titulo={`Ningún ${p.docente} tiene ${p.materias} este mes`} />
        </Tarjeta>
      ) : (
        <>
          {/* Sin «clases dadas»: ese dato todavía no existe. El tercero es el que cuenta para cobrar. */}
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
                onPagado={(texto) => {
                  setAviso(texto);
                  setVersion((v) => v + 1);
                  datos.recargar();
                }}
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
}: {
  fila: FilaPlanillaMes;
  mes: string;
  version: number;
  liquida: boolean;
  onPagado: (aviso: string) => void;
}) {
  const detalle = useApi(() => apiAcademia.planillaDocente(x.personalId, mes).catch(() => null), [x.personalId, mes, version]);
  const det = detalle.datos;
  const [pidiendo, setPidiendo] = useState(false);
  const [metodo, setMetodo] = useState<MetodoPagoPlanilla>("EFECTIVO");
  const [mesSinTerminar, setMesSinTerminar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const sinPago = x.liquido <= 0;
  const carreras = det?.grupos?.length ? [...new Set(det.grupos.map((g) => nombreDe(g.carrera)))].join(", ") : "";
  const cuenta = det ? cuentaDelMesDocente(det) : null;

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
          <p className="text-[13px] text-texto-3">
            {x.grupos} {x.grupos === 1 ? "grupo" : "grupos"}
            {carreras ? ` · ${carreras}` : ""}
          </p>
          {cuenta && <p className="text-[13px] text-texto-2">{cuenta}</p>}
          {extraDocente(x) && <p className="text-[12px] text-texto-3">{extraDocente(x)}</p>}
          <Link
            to={`/academia/planilla/${x.personalId}?mes=${mes}`}
            aria-label={`Ver el detalle de ${x.nombre}`}
            className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-primary-700 hover:underline sm:min-h-0"
          >
            Ver el detalle
            <Icon name="chevronRight" size={14} />
          </Link>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
          <span className="sm:text-right">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-texto-4">A pagar</span>
            <span className="block text-2xl font-bold tabular-nums tracking-tight text-texto">{fmtMoney(x.liquido)}</span>
          </span>
          {x.estado === "PAGADA" ? (
            <Chip tono="verde" className="self-start text-[13px] sm:self-end">
              {det?.pagadaEn ? `Pagado el ${fechaCorta(isoDia(new Date(det.pagadaEn)))}` : "Pagado"}
            </Chip>
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

/** "+ 2 de meses anteriores", "1 ajuste", "3 postergados", "todos pagaron". */
function extraDocente(x: TPlanillaMes["docentes"][number]): string {
  // Bug 4: un cobro anulado o repuesto de un módulo ya liquidado cambia el bruto; se avisa desde la lista.
  if (x.ajustes) return `${x.ajustes} ${x.ajustes === 1 ? "ajuste" : "ajustes"} de cobros anulados o repuestos`;
  if (x.atrasados) return `+ ${x.atrasados} de meses anteriores`;
  if (x.postergados) return `${x.postergados} ${x.postergados === 1 ? "postergado" : "postergados"}`;
  if (x.total && x.cuentan === x.total) return "todos pagaron";
  return "";
}

function subtitulo(d: TPlanillaMes, enCurso: boolean, sede: string): string {
  const n = d.docentes.length;
  return [`${n} ${n === 1 ? "docente" : "docentes"}`, sede || null, enCurso ? "en curso, se cierra a fin de mes" : null].filter(Boolean).join(" · ");
}
