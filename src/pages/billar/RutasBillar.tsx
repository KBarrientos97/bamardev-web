import { useEffect } from "react";
import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { Cargando, ErrorMsg } from "../../components/ui";
import { useAuth } from "../../store/AuthContext";
import { DialogoActual } from "./Avisos";
import CerrarCaja from "./CerrarCaja";
import CerrarMesa from "./CerrarMesa";
import ConsumoMesa, { ConsumoCuenta } from "./ConsumoMesa";
import { DialogosProvider, useDialogos } from "./dialogos";
import { recargar, useBillar, useSondeoBillar } from "./store";
import Tablero from "./Tablero";
import VentaRapida from "./VentaRapida";
import VentasTurno from "./VentasTurno";

/**
 * Las pantallas del billar que van dentro de la barra lateral (`/billar/*`).
 * Comparten los diálogos. Los avisos de tiempo fijo y los flotantes viven en
 * el Layout (\`DeFondo\`), para que suenen aunque el cajero esté en otra
 * pantalla. La del salón (la TV) va aparte, sin barra.
 *
 * Los datos son los del backend (\`store.ts\`): hasta que llega el primer
 * tablero no se dibuja nada, porque sin él la caja se veía cerrada y se
 * ofrecía abrirla.
 */
export default function RutasBillar() {
  const { negocio } = useAuth();
  useSondeoBillar(negocio?.alias);
  const e = useBillar();

  return (
    <DialogosProvider>
      {!e.cargado ? (
        e.error ? (
          <div className="p-6">
            <ErrorMsg onReintentar={() => void recargar(true)}>{e.error}</ErrorMsg>
          </div>
        ) : (
          <Cargando texto="Cargando las mesas…" />
        )
      ) : (
        <>
          {/* Ya cargado, un sondeo que falla no se mostraba: el tablero quedaba
              congelado con los relojes corriendo (se cayó el wifi, o otra
              pestaña cambió la sesión) y nada avisaba. Se va solo cuando el
              tablero vuelve a llegar (`aplicarTablero` limpia el error). */}
          {e.error && <SinConexion texto={e.error} />}
          <AccionDeLaDireccion />
          <Routes>
            <Route index element={<Tablero />} />
            <Route path="consumo/:mesaId" element={<ConsumoMesa />} />
            <Route path="cuenta/:cuentaId/consumo" element={<ConsumoCuenta />} />
            <Route path="cerrar/:mesaId" element={<CerrarMesa />} />
            <Route path="ventas" element={<VentasTurno />} />
            <Route path="venta-rapida" element={<VentaRapida />} />
            <Route path="caja" element={<CerrarCaja />} />
            <Route path="*" element={<Navigate to="/billar" replace />} />
          </Routes>
          <DialogoActual />
        </>
      )}
    </DialogosProvider>
  );
}

/**
 * Lo que piden los avisos flotantes por la dirección: \`accion=extender\` (con
 * \`mesa\`), \`ticket=\` y \`venta=\` (el detalle, para "Corregir pago"). Se abre el diálogo y el pedido se borra de la
 * dirección, para que recargar o volver atrás no lo abra de nuevo. Si ya no
 * tiene sentido (la mesa se cerró), \`DialogoActual\` lo descarta solo.
 */
function AccionDeLaDireccion() {
  const [params, setParams] = useSearchParams();
  const { abrir } = useDialogos();
  const accion = params.get("accion");
  const mesa = Number(params.get("mesa")) || null;
  const ticket = params.get("ticket");
  const venta = params.get("venta");

  useEffect(() => {
    if (!accion && !ticket && !venta) return;
    if (accion === "extender" && mesa) abrir({ tipo: "extender", mesaId: mesa });
    if (ticket) abrir({ tipo: "ticket", codigo: ticket });
    if (venta) abrir({ tipo: "venta", codigo: venta });
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete("accion");
        n.delete("ticket");
        n.delete("venta");
        return n;
      },
      { replace: true },
    );
  }, [accion, mesa, ticket, venta, abrir, setParams]);

  return null;
}

/** Flotante y no una franja arriba: no le cambia el alto a ninguna pantalla del billar. */
function SinConexion({ texto }: { texto: string }) {
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 shadow-lg"
    >
      <span className="min-w-0 flex-1">
        <b>Sin conexión con el servidor.</b> Lo que ves puede estar desactualizado. ({texto})
      </span>
      <button type="button" onClick={() => void recargar(true)} className="shrink-0 font-bold underline">
        Reintentar
      </button>
    </div>
  );
}
