import { useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { Boton, Campo, ErrorMsg, Input } from "../components/ui";
import { BLOQUEO_KEY } from "../lib/api";
import { useAuth } from "../store/AuthContext";

interface Bloqueo {
  codigo: string;
  mensaje: string;
  urlPago: string | null;
}

/**
 * Motivo por el que la sesión se cortó, si fue la licencia. Lo dejó el
 * interceptor justo antes de recargar hacia acá; se lee UNA vez y se borra,
 * para que no reaparezca cuando el problema ya se resolvió.
 */
function leerBloqueo(): Bloqueo | null {
  try {
    const raw = localStorage.getItem(BLOQUEO_KEY);
    if (!raw) return null;
    localStorage.removeItem(BLOQUEO_KEY);
    return JSON.parse(raw) as Bloqueo;
  } catch {
    return null;
  }
}

export default function Login() {
  const { login, aliasRecordado } = useAuth();
  // El alias identifica al negocio (multi-tenant): el mismo "admin" existe en
  // varios negocios, así que sin alias el backend no sabe a cuál entrar.
  const [negocio, setNegocio] = useState(aliasRecordado);
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [bloqueo, setBloqueo] = useState<Bloqueo | null>(leerBloqueo);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await login(usuario.trim(), clave, negocio.trim().toLowerCase());
    } catch (err) {
      // El backend rechaza el login con 403 cuando la licencia no está
      // vigente. Va al cartel de licencia y no al de credenciales: no es que
      // la clave esté mal, y decirle eso al dueño lo manda a buscar donde no es.
      const api = err as { status?: number; codigo?: string; urlPago?: string };
      if (api?.status === 403 && api.codigo?.startsWith("LICENCIA_")) {
        setBloqueo({
          codigo: api.codigo,
          mensaje: (err as Error).message,
          urlPago: api.urlPago ?? null,
        });
      } else {
        setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-primary-50 via-white to-fondo px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-marca text-white shadow-lg shadow-primary/30">
            <Icon name="archive" size={38} strokeWidth={2.2} />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-primary">
            BamarDev
          </h1>
          <p className="mt-1 text-[13px] text-texto-3">Inventario y Punto de Venta</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6 shadow-lg">
          <div>
            <h2 className="text-lg font-bold text-texto">Iniciar sesión</h2>
            <p className="mt-0.5 text-[13px] text-texto-3">
              Ingresá tus credenciales para continuar
            </p>
          </div>

          {/* Licencia vencida o suspendida. Va acá y no en el <ErrorMsg> de
              abajo porque no es un dato mal tipeado: reintentar no arregla
              nada, y el dueño necesita el link de pago, no otra chance. */}
          {bloqueo && (
            <div className="rounded-xl border border-danger-text/20 bg-danger-bg p-3.5 text-danger-text">
              <div className="flex items-start gap-2.5">
                <Icon name="alert" size={18} />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold">
                    {bloqueo.codigo === "LICENCIA_SUSPENDIDA"
                      ? "Licencia suspendida"
                      : "Licencia vencida"}
                  </p>
                  <p className="mt-1 text-[13px] leading-snug">{bloqueo.mensaje}</p>
                  {bloqueo.urlPago && (
                    <a
                      href={bloqueo.urlPago}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2.5 inline-block rounded-lg bg-danger-text px-3 py-1.5 text-xs font-bold text-white"
                    >
                      Regularizar el pago
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          <Campo label="Negocio" hint="El alias que te dieron al contratar">
            <Input
              value={negocio}
              onChange={(e) => setNegocio(e.target.value)}
              placeholder="cafeteriakevin"
              autoComplete="organization"
              required
            />
          </Campo>

          <Campo label="Usuario">
            <Input
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="Tu nombre de usuario"
              autoComplete="username"
              required
            />
          </Campo>

          <Campo label="Contraseña">
            <Input
              type="password"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              placeholder="Tu contraseña"
              autoComplete="current-password"
              required
            />
          </Campo>

          <ErrorMsg>{error}</ErrorMsg>

          <Boton type="submit" disabled={enviando} className="w-full">
            {enviando ? "Entrando…" : "Iniciar sesión"}
          </Boton>
        </form>
      </div>
    </div>
  );
}
