import { useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { Boton, Campo, ErrorMsg, Input } from "../components/ui";
import { useAuth } from "../store/AuthContext";

export default function Login() {
  const { login, aliasRecordado } = useAuth();
  // El alias identifica al negocio (multi-tenant): el mismo "admin" existe en
  // varios negocios, así que sin alias el backend no sabe a cuál entrar.
  const [negocio, setNegocio] = useState(aliasRecordado);
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      await login(usuario.trim(), clave, negocio.trim().toLowerCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
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
