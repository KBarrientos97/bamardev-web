import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { editaNutricion, RUTA_EVALUACION } from "../../lib/permisos";
import { useAuth } from "../../store/AuthContext";
import Evaluacion from "./Evaluacion";
import Pacientes from "./Pacientes";
import PlanillaPaciente from "./PlanillaPaciente";

/**
 * Las pantallas de la evaluación de pacientes (`/evaluacion/*`), en un solo
 * paquete que se baja al entrar (sólo en un consultorio de nutrición). La
 * sección (`nutricion`) ya la cuidó `Protegida` en AppNegocio; acá se cierra
 * lo que pide además `nutricion.editar`.
 */
export default function RutasNutricion() {
  return (
    <Routes>
      <Route index element={<Pacientes />} />
      {/* El mismo elemento en las dos: al pasar del alta a la edición (después
          del primer guardado) la evaluación sigue montada, con lo escrito. */}
      <Route path="nuevo" element={<PantallaEvaluacion />} />
      <Route path=":id/editar" element={<PantallaEvaluacion />} />
      <Route path=":id" element={<PantallaPlanilla />} />
      <Route path="*" element={<Navigate to={RUTA_EVALUACION} replace />} />
    </Routes>
  );
}

/** Un id que no es un número (un enlace roto) no es un paciente. */
const idValido = (id: string | undefined) => Number.isInteger(Number(id)) && Number(id) > 0;

/**
 * El alta y la edición. Sin `nutricion.editar` todo es de sólo lectura: vuelve
 * a donde se miraba (la lista o la planilla).
 */
function PantallaEvaluacion() {
  const { id } = useParams();
  const { usuario } = useAuth();
  if (id !== undefined && !idValido(id)) return <Navigate to={RUTA_EVALUACION} replace />;
  if (!editaNutricion(usuario)) return <Navigate to={id ? `${RUTA_EVALUACION}/${id}` : RUTA_EVALUACION} replace />;
  return <Evaluacion />;
}

function PantallaPlanilla() {
  const { id } = useParams();
  if (!idValido(id)) return <Navigate to={RUTA_EVALUACION} replace />;
  // Otro paciente es otra pantalla: nada del anterior queda abierto.
  return <PlanillaPaciente key={id} />;
}
