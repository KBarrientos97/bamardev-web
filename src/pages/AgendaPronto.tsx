import { BotonCambiarMiPassword } from "../components/CambiarMiPassword";
import { Icon } from "../components/Icon";
import { Boton } from "../components/ui";
import { etiquetaRol } from "../lib/permisos";
import { useAuth } from "../store/AuthContext";

/**
 * El inicio del rol PROFESIONAL mientras la agenda no existe (fase 0 de
 * belleza). Su única pantalla va a ser "Mi agenda", que llega en la fase 1;
 * hasta entonces el dueño ya puede crearle la cuenta, y quien entra con ella
 * se encuentra con esto en vez de "Tu cuenta no tiene secciones", que le haría
 * creer que algo está mal configurado.
 *
 * Va fuera del Layout, como el panel del mesero: la barra lateral estaría
 * vacía, y una barra sin nada se lee como un error.
 */
export default function AgendaPronto() {
  const { usuario, negocio, logout } = useAuth();
  const nombre = usuario?.nombre?.trim() || usuario?.username;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-b from-primary-50 via-white to-fondo px-5 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-marca text-white shadow-lg shadow-primary/30">
          <Icon name="calendar" size={38} strokeWidth={2.2} />
        </div>
        <p className="mt-4 text-[13px] font-semibold text-texto-3">
          {negocio?.nombre ?? "BamarDev"}
          {usuario ? ` · ${usuario.rolNombre?.trim() || etiquetaRol(usuario.rol, negocio)}` : ""}
        </p>

        <div className="card mt-5 space-y-3 p-6 shadow-lg">
          <h1 className="text-xl font-extrabold tracking-tight text-texto">
            Tu agenda llega pronto
          </h1>
          <p className="text-[13px] leading-relaxed text-texto-3">
            {nombre ? `Hola, ${nombre}. ` : ""}
            Acá vas a ver tus citas del día y de la semana. La estamos
            terminando: cuando esté lista vas a entrar directo a ella, con este
            mismo usuario.
          </p>
          <Boton variante="ghost" icono="logout" onClick={logout} className="w-full">
            Cerrar sesión
          </Boton>
          {/* Sin menú lateral: el "Cambiar mi contraseña" va acá (QA R2-03). */}
          <BotonCambiarMiPassword className="flex w-full items-center justify-center gap-1.5 py-1 text-[13px] font-semibold text-texto-3 hover:text-texto-2" />
        </div>
      </div>
    </div>
  );
}
