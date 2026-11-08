import { useMemo, useState } from "react";
import { Boton, Cargando, ErrorMsg, Modal } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { ReporteCierreGanancia } from "../../types";
import { ProductosDelTurno } from "../pos/PantallaCierre";
import { KpisGanancia, TablaGanancia } from "./vistas/TablaGanancia";
import {
  armarGananciaTurno,
  avisaSinCosto,
  documentoVentasGanancia,
  NOTAS_GANANCIA_TURNO,
  textoSinCosto,
  veGananciaDelTurno,
} from "./vistas/VentasGanancia.datos";
import { Nota } from "./ui";

/**
 * "Productos vendidos" del arqueo de Reportes. Quien tiene rentabilidad ve el
 * cuadro de Ventas y ganancia de ESE turno; los demás, la lista de siempre.
 *
 * Es un componente aparte a propósito: `ProductosDelTurno` es también lo que
 * ve la cajera al cerrar la caja y Kevin pidió que eso no cambie ("por
 * seguridad del local"). Así el costo no tiene cómo llegar a su pantalla: ella
 * no pasa por acá y el backend tampoco se lo manda en su ruta.
 */
export function ProductosDelArqueo({
  cajaId,
  subtitulo,
  onClose,
}: {
  cajaId: number;
  /** El día y el cajero del turno: un PDF suelto tiene que decir de cuál es. */
  subtitulo: string;
  onClose: () => void;
}) {
  const { usuario, incluye, rubro } = useAuth();
  if (!veGananciaDelTurno(rubro, incluye("reportes_rentabilidad"), usuario?.permisos ?? [])) {
    return <ProductosDelTurno cajaId={cajaId} onClose={onClose} />;
  }
  return <GananciaDelTurno cajaId={cajaId} subtitulo={subtitulo} onClose={onClose} />;
}

/**
 * Null = no hay ganancia que mostrar: un backend que todavía no tiene la ruta
 * (404) o un permiso que le quitaron recién (403). El arqueo tiene que seguir
 * andando igual, con la lista de siempre. Cualquier otro error se muestra: caer
 * a la lista escondería que el reporte falló y el dueño creería que no hay costos.
 */
export async function pedirGananciaDelTurno(cajaId: number): Promise<ReporteCierreGanancia | null> {
  try {
    return await api.reporteCierreGanancia(cajaId);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

function GananciaDelTurno({
  cajaId,
  subtitulo,
  onClose,
}: {
  cajaId: number;
  subtitulo: string;
  onClose: () => void;
}) {
  const estado = useApi(() => pedirGananciaDelTurno(cajaId), [cajaId]);
  const { negocio, rubro } = useAuth();
  const [armando, setArmando] = useState(false);
  const [errorPdf, setErrorPdf] = useState(false);
  const datos = useMemo(() => (estado.datos ? armarGananciaTurno(estado.datos) : null), [estado.datos]);

  if (!estado.cargando && !estado.error && !datos) {
    return <ProductosDelTurno cajaId={cajaId} onClose={onClose} />;
  }

  const conVentas = datos != null && datos.productos > 0;
  const avisa = conVentas && avisaSinCosto(rubro) && datos.ventasSinCosto > 0;

  async function exportar() {
    if (!datos || armando) return;
    setArmando(true);
    setErrorPdf(false);
    try {
      const { bajarPdf } = await import("../../lib/pdf/tablaPdf");
      await bajarPdf(
        `productos-vendidos-turno-${cajaId}.pdf`,
        documentoVentasGanancia(datos, {
          negocio: negocio?.nombre,
          subtitulo,
          titulo: "Productos vendidos",
          notas: [...(avisa ? [textoSinCosto(datos)] : []), ...NOTAS_GANANCIA_TURNO],
        }),
      );
    } catch {
      setErrorPdf(true);
    } finally {
      setArmando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Productos vendidos"
      subtitulo={subtitulo}
      onClose={onClose}
      ancho="max-w-3xl"
      acciones={
        conVentas ? (
          <Boton variante="ghost" icono="download" onClick={exportar} disabled={armando}>
            {armando ? "Armando el PDF…" : "Exportar PDF"}
          </Boton>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {estado.error && <ErrorMsg onReintentar={estado.recargar}>{estado.error}</ErrorMsg>}
        {errorPdf && <ErrorMsg>No se pudo armar el PDF. Probá de nuevo.</ErrorMsg>}
        {estado.cargando ? (
          <Cargando />
        ) : estado.error ? null : !conVentas ? (
          <p className="py-6 text-center text-[13px] text-texto-3">En este turno todavía no se vendió nada.</p>
        ) : (
          <>
            <KpisGanancia datos={datos} />
            {avisa && <Nota tono="ambar">{textoSinCosto(datos)}</Nota>}
            <TablaGanancia datos={datos} />
            <Nota>
              <p>{NOTAS_GANANCIA_TURNO.join(" ")}</p>
            </Nota>
          </>
        )}
      </div>
    </Modal>
  );
}
