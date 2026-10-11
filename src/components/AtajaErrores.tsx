import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportarError } from "../lib/telemetria";
import { Boton } from "./ui";

interface Props {
  /** La dirección actual: cuando cambia, el aviso se rearma solo. */
  reiniciarCon: string;
  children: ReactNode;
}

/**
 * Si una pantalla revienta al dibujarse, muestra un aviso en lugar de dejar la
 * página en blanco.
 *
 * Pasó en Usuarios: editar a un mesero leía los permisos de un rol que la web
 * no conocía, React desmontaba la app entera y el administrador quedaba frente
 * a un blanco, sin menú y sin saber qué había pasado. Cualquier valor nuevo que
 * mande el backend puede hacer lo mismo en otra pantalla.
 *
 * No arregla el error: lo reporta (un error atajado acá ya no llega solo a la
 * telemetría) y deja salir sin perder la sesión. Al cambiar de dirección se
 * rearma, así que el botón Atrás del navegador también sirve. Mientras no hay
 * error devuelve la pantalla tal cual, sin agregar nada.
 */
interface Estado {
  error: Error | null;
  /** La dirección en la que se atajó el error. */
  reiniciarCon: string;
}

export default class AtajaErrores extends Component<Props, Estado> {
  state: Estado = { error: null, reiniciarCon: this.props.reiniciarCon };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, estado: Estado) {
    return props.reiniciarCon === estado.reiniciarCon
      ? null
      : { error: null, reiniciarCon: props.reiniciarCon };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportarError("pantalla", error, { componentes: info.componentStack?.slice(0, 1000) });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-fondo p-6">
        <div className="card max-w-sm p-6 text-center">
          <h1 className="text-lg font-bold text-texto">Esta pantalla tuvo un error</h1>
          <p className="mt-2 text-[13px] text-texto-3">
            Lo que ya estaba guardado sigue intacto. Volvé al inicio o recargá la página; si
            se repite, avisale a BamarDev qué estabas haciendo.
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Boton variante="ghost" onClick={() => window.location.reload()}>
              Recargar
            </Boton>
            <Boton onClick={() => window.location.assign("/")}>Volver al inicio</Boton>
          </div>
        </div>
      </div>
    );
  }
}
