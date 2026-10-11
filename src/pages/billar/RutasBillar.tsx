import { Navigate, Route, Routes } from "react-router-dom";
import { DialogoActual, MotorAvisos, Toasts } from "./Avisos";
import CerrarCaja from "./CerrarCaja";
import CerrarMesa from "./CerrarMesa";
import ConsumoMesa from "./ConsumoMesa";
import { DialogosProvider } from "./dialogos";
import Tablero from "./Tablero";
import VentaRapida from "./VentaRapida";
import VentasTurno from "./VentasTurno";

/**
 * Las pantallas del billar que van dentro de la barra lateral (`/billar/*`).
 * Comparten los diálogos, los avisos flotantes y el motor de los avisos de
 * tiempo fijo, que así sigue sonando mientras el cajero carga un consumo o
 * mira las ventas. La pantalla del salón (la TV) va aparte, sin barra.
 *
 * MAQUETA (oct-2026): datos de ejemplo en memoria (ver `store.ts`).
 */
export default function RutasBillar() {
  return (
    <DialogosProvider>
      <MotorAvisos />
      <Routes>
        <Route index element={<Tablero />} />
        <Route path="consumo/:mesaId" element={<ConsumoMesa />} />
        <Route path="cerrar/:mesaId" element={<CerrarMesa />} />
        <Route path="ventas" element={<VentasTurno />} />
        <Route path="venta-rapida" element={<VentaRapida />} />
        <Route path="caja" element={<CerrarCaja />} />
        <Route path="*" element={<Navigate to="/billar" replace />} />
      </Routes>
      <DialogoActual />
      <Toasts />
    </DialogosProvider>
  );
}
