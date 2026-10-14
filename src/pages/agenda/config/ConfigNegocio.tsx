import { Navigate } from "react-router-dom";
import { useAuth } from "../../../store/AuthContext";
import ConfigAgenda from "./ConfigAgenda";

/**
 * "/configuracion/negocio" era la pantalla de las reglas del negocio (A11).
 * Desde que las reglas viven en la Configuración de la agenda, la ruta queda
 * para que el menú, los marcadores y los enlaces viejos sigan andando: lleva
 * a la pestaña Reglas.
 *
 * Quien tiene las reglas (`config_negocio`) pero no la agenda
 * (`agenda_config`) no podría entrar a /configuracion/agenda: a ése se le
 * muestra la misma pantalla acá mismo, que ya le enseña sólo lo suyo.
 */
export default function ConfigNegocio() {
  const { puede } = useAuth();
  if (puede("agenda_config")) return <Navigate to="/configuracion/agenda?pestana=reglas" replace />;
  return <ConfigAgenda />;
}
