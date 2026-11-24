import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { RUTA_SEGUIMIENTO } from "../../../lib/permisos";
import HojaSeguimiento from "./HojaSeguimiento";
import ListaSeguimiento from "./ListaSeguimiento";
import PagosPendientes from "./PagosPendientes";

/**
 * Las pantallas del seguimiento del tratamiento (`/seguimiento/*`), en su
 * propio paquete: se baja sólo en un consultorio de nutrición, y el Médico no
 * baja la evaluación. La sección (`seguimiento`) ya la cuidó `Protegida` en
 * AppNegocio; adentro, sin `seguimiento.editar` todo es de sólo lectura.
 */
export default function RutasSeguimiento() {
  return (
    <Routes>
      <Route index element={<ListaSeguimiento />} />
      <Route path="pagos" element={<PagosPendientes />} />
      <Route path=":id" element={<PantallaHoja />} />
      <Route path="*" element={<Navigate to={RUTA_SEGUIMIENTO} replace />} />
    </Routes>
  );
}

/** Un id que no es un número (un enlace roto) no es un paciente. */
const idValido = (id: string | undefined) => Number.isInteger(Number(id)) && Number(id) > 0;

function PantallaHoja() {
  const { id } = useParams();
  if (!idValido(id)) return <Navigate to={RUTA_SEGUIMIENTO} replace />;
  // Otro paciente es otra pantalla: nada del anterior queda abierto.
  return <HojaSeguimiento key={id} />;
}
