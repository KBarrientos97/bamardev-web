import { useMemo, useState } from "react";
import { Boton, Cargando, ErrorMsg, Modal } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { ReporteCierreGanancia } from "../../types";
import ListaProductosVendidos, { SeccionPlataforma, SelectorDeVista } from "../pos/ListaProductosVendidos";
import { ProductosDelTurno } from "../pos/PantallaCierre";
import {
  documentoProductosVendidos,
  mediosDelTurno,
  plataformasDelTurno,
  type VistaProductos,
} from "../pos/productosVendidos";
import { KpisGanancia, TablaGanancia } from "./vistas/TablaGanancia";
import {
  armarGananciaTurno,
  avisaSinCosto,
  documentoVentasGanancia,
  NOTAS_GANANCIA_TURNO,
  notasFiadoDelTurno,
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
  /**
   * La lista de siempre del mismo turno (17-nov, como la app): la ruta de la
   * ganancia no trae los pedidos de Yango y PedidosYa ni la vista por forma de
   * pago, y el dueño los veía en el cierre de la caja pero no acá. Si falla,
   * se dice: mostrar el turno sin los pedidos en silencio sería un número
   * incompleto.
   */
  const lista = useApi(() => api.reporteCierreProductos(cajaId), [cajaId]);
  // Con costos se arranca en «Todo junto», el cuadro de la ganancia, como en la app.
  const [vista, setVista] = useState<VistaProductos>("todo");
  const { negocio, rubro } = useAuth();
  const [armando, setArmando] = useState(false);
  const [errorPdf, setErrorPdf] = useState(false);
  const datos = useMemo(() => (estado.datos ? armarGananciaTurno(estado.datos) : null), [estado.datos]);

  if (!estado.cargando && !estado.error && !datos) {
    return <ProductosDelTurno cajaId={cajaId} productos={lista.datos ?? undefined} onClose={onClose} />;
  }

  const conVentas = datos != null && datos.productos > 0;
  const avisa = conVentas && avisaSinCosto(rubro) && datos.ventasSinCosto > 0;
  // Lo fiado y los cobros de fiado del turno (11-nov): lo mismo que ve la
  // cajera en su lista, con las mismas palabras.
  const fiado = estado.datos ? notasFiadoDelTurno(estado.datos) : [];
  const cargando = estado.cargando || lista.cargando;
  const error = estado.error || lista.error;
  const recargar = () => {
    if (estado.error) estado.recargar();
    if (lista.error) lista.recargar();
  };
  const d = lista.datos;
  const medios = d ? mediosDelTurno(d) : [];
  const plataformas = d ? plataformasDelTurno(d) : [];
  // «Por forma de pago» es la lista de la cajera, sin costos (no hay costo por medio).
  const porMedio = medios.length > 0 && vista === "medio";
  // Sin ventas pero con pedidos de las apps: la lista de siempre, que los muestra.
  const soloPlataformas = !conVentas && plataformas.length > 0;

  async function exportar() {
    if (!datos || armando) return;
    setArmando(true);
    setErrorPdf(false);
    try {
      const { bajarPdf } = await import("../../lib/pdf/tablaPdf");
      await bajarPdf(
        `productos-vendidos-turno-${cajaId}.pdf`,
        // El PDF sale como se está mirando, igual que en el cierre.
        porMedio && d
          ? documentoProductosVendidos(d, { negocio: negocio?.nombre, subtitulo, vista: "medio" })
          : documentoVentasGanancia(datos, {
              negocio: negocio?.nombre,
              subtitulo,
              titulo: "Productos vendidos",
              notas: [...(avisa ? [textoSinCosto(datos)] : []), ...fiado, ...NOTAS_GANANCIA_TURNO],
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
        conVentas && !cargando && !error ? (
          <Boton variante="ghost" icono="download" onClick={exportar} disabled={armando}>
            {armando ? "Armando el PDF…" : "Exportar PDF"}
          </Boton>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {error && <ErrorMsg onReintentar={recargar}>{error}</ErrorMsg>}
        {errorPdf && <ErrorMsg>No se pudo armar el PDF. Probá de nuevo.</ErrorMsg>}
        {cargando ? (
          <Cargando />
        ) : error ? null : soloPlataformas && d ? (
          <ListaProductosVendidos d={d} />
        ) : !conVentas ? (
          <p className="py-6 text-center text-[13px] text-texto-3">En este turno todavía no se vendió nada.</p>
        ) : porMedio && d ? (
          // Trae su propio selector, las plataformas y el total al final.
          <ListaProductosVendidos d={d} vista="medio" onVista={setVista} />
        ) : (
          <>
            {medios.length > 0 && <SelectorDeVista vista="todo" onElegir={setVista} />}
            <KpisGanancia datos={datos} />
            {avisa && <Nota tono="ambar">{textoSinCosto(datos)}</Nota>}
            {fiado.length > 0 && (
              <Nota>
                <p>{fiado.join(" ")}</p>
              </Nota>
            )}
            <TablaGanancia datos={datos} />
            {/* Lo de las apps de delivery, aparte y después: no está en la
                ganancia de arriba (lo paga la app, no la caja). */}
            {plataformas.length > 0 && (
              <div className="@container space-y-3">
                {plataformas.map((p) => (
                  <SeccionPlataforma key={p.plataforma} p={p} />
                ))}
              </div>
            )}
            <Nota>
              <p>{NOTAS_GANANCIA_TURNO.join(" ")}</p>
            </Nota>
          </>
        )}
      </div>
    </Modal>
  );
}
