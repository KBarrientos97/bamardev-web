import { api } from "../../../../lib/api";
import { apiComisiones } from "../../../../lib/agenda/apiComisiones";
import { rangoParaApi, sinJornada } from "../../../../lib/rangoApi";
import { estadoResultado } from "../../../../lib/resultado";
import { useApi } from "../../../../lib/useApi";
import { useAuth } from "../../../../store/AuthContext";
import type { RangoReporte } from "../../../../types";
import { apiReportes } from "../../api";
import { useReporte } from "../../contexto";

/**
 * Los gastos de los mismos días que las ventas, de medianoche local a
 * medianoche local. Sin el corte de la jornada de un billar: un gasto lleva
 * fecha y no hora (se guarda a la medianoche), y con el corte el del día 1 se
 * iría al mes anterior.
 */
function gastosDe(r: RangoReporte) {
  const { desde, hasta } = rangoParaApi(sinJornada(r));
  return api.getGastos({ desde: desde ?? "", hasta: hasta ?? "", sucursalId: r.sucursalId ?? null });
}

/**
 * Todo lo que junta el Resumen. Cada pieza se pide sólo si quien mira puede
 * ver el reporte de donde sale (el mismo permiso y plan que su endpoint): un
 * cajero sin rentabilidad no dispara el financiero para que le conteste 403.
 *
 * `paraTexto` es el "Enviar resumen": no necesita ni la comparación de la
 * ganancia ni los avisos, así que no los pide.
 */
export function useDatosResumen({ paraTexto = false } = {}) {
  const { rango, rangoAnterior, periodo, veReporte } = useReporte();
  const { usuario, puede, incluye } = useAuth();
  const permisos = usuario?.permisos ?? [];
  const rentabilidad = incluye("reportes_rentabilidad") && permisos.includes("reportes.rentabilidad");
  const operacion = incluye("reportes_operacion") && permisos.includes("reportes.operacion");
  const conGastos = rentabilidad && puede("gastos");
  const conBillar = puede("reportes_billar");
  const verMeseros = veReporte("meseros");
  const verAgenda = veReporte("profesionales");
  const verMermas = veReporte("mermas");
  const verCreditos = veReporte("creditos");
  const verStock = veReporte("stock-critico");
  const unDia = periodo.desde === periodo.hasta;
  const r = [rango.desde, rango.hasta, rango.sucursalId];
  const ant = [rangoAnterior.desde, rangoAnterior.hasta];

  const resumen = useApi(() => apiReportes.resumen(rango, rangoAnterior), [...r, ...ant]);
  // El financiero y los gastos van juntos: sin los gastos, la "ganancia real"
  // sería la utilidad bruta disfrazada.
  const plata = useApi(
    () =>
      rentabilidad
        ? Promise.all([apiReportes.financiero(rango, rangoAnterior), conGastos ? gastosDe(rango) : Promise.resolve(null)])
        : Promise.resolve(null),
    [rentabilidad, conGastos, ...r, ...ant],
  );
  const plataAnterior = useApi(
    () =>
      rentabilidad && conGastos && !paraTexto
        ? Promise.all([apiReportes.financiero(rangoAnterior), gastosDe(rangoAnterior)])
        : Promise.resolve(null),
    [rentabilidad, conGastos, paraTexto, ...ant, rango.sucursalId],
  );
  const billar = useApi(() => (conBillar ? apiReportes.billar(rango, rangoAnterior) : Promise.resolve(null)), [conBillar, ...r, ...ant]);
  const meseros = useApi(() => (verMeseros ? apiReportes.meseros(rango) : Promise.resolve(null)), [verMeseros, ...r]);
  const agenda = useApi(
    () =>
      verAgenda
        ? apiComisiones.reporteAgenda({ desde: periodo.desde, hasta: periodo.hasta, sucursalId: rango.sucursalId ?? null })
        : Promise.resolve(null),
    [verAgenda, ...r],
  );
  const mermas = useApi(
    () => (verMermas ? api.mermas({ desde: periodo.desde, hasta: periodo.hasta, sucursalId: rango.sucursalId ?? null }) : Promise.resolve(null)),
    [verMermas, ...r],
  );
  const metodos = useApi(() => (operacion ? apiReportes.metodosPago(rango) : Promise.resolve(null)), [operacion, ...r]);
  const creditos = useApi(() => (verCreditos ? apiReportes.creditos(rango) : Promise.resolve(null)), [verCreditos, ...r]);
  const sugerencia = useApi(
    () =>
      verStock && !paraTexto
        ? apiReportes.sugerencia({ dias: 30, cobertura: 14, ...(rango.sucursalId != null ? { sucursalId: rango.sucursalId } : {}) })
        : Promise.resolve(null),
    [verStock, paraTexto, rango.sucursalId],
  );
  // Un solo día no tiene tendencia (es un punto): se muestra por hora.
  const horasDelDia = useApi(
    () => (operacion && unDia && !paraTexto ? apiReportes.horas(rango) : Promise.resolve(null)),
    [operacion, unDia, paraTexto, ...r],
  );

  const [fin, gastos] = plata.datos ?? [null, null];
  const er = fin && gastos ? estadoResultado(fin, gastos) : null;
  const [finAnt, gastosAnt] = plataAnterior.datos ?? [null, null];
  const erAnterior = finAnt && gastosAnt ? estadoResultado(finAnt, gastosAnt) : null;

  return {
    resumen,
    plata,
    fin,
    gastos,
    er,
    erAnterior,
    billar: billar.datos,
    meseros: meseros.datos,
    agenda: agenda.datos,
    mermas: mermas.datos,
    metodos: metodos.datos,
    creditos: creditos.datos,
    sugerencia: sugerencia.datos,
    horasDelDia: horasDelDia.datos,
    rentabilidad,
    conGastos,
  };
}
