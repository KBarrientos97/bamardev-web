import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LICENCIA_KEY,
  NEGOCIO_KEY,
  USER_KEY,
  api,
  limpiarSesion,
  tokenStore,
} from "../lib/api";
import { identificar, olvidarUsuario } from "../lib/telemetria";
import { fijarMoneda } from "../lib/format";
import {
  puede as puedeCapacidad,
  puedeVer,
  type Capacidad,
  type ContextoPermisos,
  type Seccion,
} from "../lib/permisos";
import type { EstadoLicencia, SesionNegocio, SesionUsuario } from "../types";

/** Alias del negocio: se recuerda para no re-tipearlo en cada login. */
const ALIAS_KEY = "bamardev_web_alias";

interface AuthValue {
  token: string | null;
  usuario: SesionUsuario | null;
  negocio: SesionNegocio | null;
  licencia: EstadoLicencia | null;
  /** Último alias usado, para prellenar el login. */
  aliasRecordado: string;
  login: (username: string, password: string, negocio: string) => Promise<void>;
  logout: () => void;
  /** ¿Se muestra esta sección? Rol ∩ plan, con fail-open. */
  puede: (seccion: Seccion) => boolean;
  /** ¿El plan incluye esta capacidad? Para botones dentro de una pantalla. */
  incluye: (capacidad: Capacidad) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

function leer<T>(clave: string): T | null {
  const raw = localStorage.getItem(clave);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(tokenStore.get());
  const [usuario, setUsuario] = useState<SesionUsuario | null>(() =>
    leer<SesionUsuario>(USER_KEY),
  );
  const [negocio, setNegocio] = useState<SesionNegocio | null>(() =>
    leer<SesionNegocio>(NEGOCIO_KEY),
  );
  // Se rehidrata igual que el usuario: sin esto, un F5 borraba la licencia y
  // la barra de aviso desaparecía hasta el siguiente login — justo el día que
  // más hay que verla, el del vencimiento.
  const [licencia, setLicencia] = useState<EstadoLicencia | null>(() =>
    leer<EstadoLicencia>(LICENCIA_KEY),
  );
  const [aliasRecordado, setAlias] = useState(() => localStorage.getItem(ALIAS_KEY) ?? "");

  // La moneda del negocio vale para todo el formateo; se fija al rehidratar.
  if (negocio?.moneda) fijarMoneda(negocio.moneda);

  const login = useCallback(async (username: string, password: string, alias: string) => {
    const res = await api.login(username, password, alias);
    tokenStore.set(res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.usuario));
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(res.negocio));
    localStorage.setItem(ALIAS_KEY, alias);
    if (res.licencia) localStorage.setItem(LICENCIA_KEY, JSON.stringify(res.licencia));
    fijarMoneda(res.negocio?.moneda);
    setToken(res.accessToken);
    setUsuario(res.usuario);
    setNegocio(res.negocio);
    setLicencia(res.licencia ?? null);
    setAlias(alias);
    identificar(alias, res.usuario.username, res.usuario.rol);
  }, []);

  const logout = useCallback(() => {
    limpiarSesion();
    olvidarUsuario();
    setToken(null);
    setUsuario(null);
    setNegocio(null);
    setLicencia(null);
  }, []);

  /**
   * Revalida la licencia contra el backend: al abrir la pestaña y cada 15 min.
   * Es el equivalente al `LicenciaGuard.chequear()` del onResume de Android.
   *
   * El corte duro por licencia vencida ya lo hace el interceptor en cualquier
   * request (`jwt.strategy` responde 403 en todos), así que esto NO es lo que
   * bloquea: es lo que mantiene fresca la barra de aviso en una pestaña que
   * quedó abierta desde ayer, y lo que echa a quien no toca nada en horas.
   */
  useEffect(() => {
    if (!token) return;
    let vivo = true;

    const revisar = () => {
      api
        .licencia()
        .then((estado) => {
          if (!vivo) return;
          localStorage.setItem(LICENCIA_KEY, JSON.stringify(estado));
          setLicencia(estado);
        })
        // Falla abierto, igual que Android: un error de red no puede dejar al
        // cajero trabado. Si la licencia de verdad venció, el próximo request
        // que haga responde 403 y ahí sí se corta.
        .catch(() => undefined);
    };

    revisar();
    const id = setInterval(revisar, 15 * 60 * 1000);
    // Volver a la pestaña después de un rato es cuando más probable es que la
    // licencia haya cambiado (la reactivaron, o venció mientras no miraba).
    const alVolver = () => {
      if (document.visibilityState === "visible") revisar();
    };
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [token]);

  // Reidentifica en PostHog tras un F5: el usuario se rehidrata de
  // localStorage sin pasar por `login`, y sin esto los errores de esa sesión
  // quedarían anónimos.
  useEffect(() => {
    if (usuario && aliasRecordado) {
      identificar(aliasRecordado, usuario.username, usuario.rol);
    }
    // Sólo al montar: `login` ya identifica por su cuenta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contexto = useMemo<ContextoPermisos | null>(
    () =>
      usuario
        ? { rol: usuario.rol, modulos: usuario.modulos, features: negocio?.features }
        : null,
    [usuario, negocio],
  );

  const puede = useCallback(
    (seccion: Seccion) => (contexto ? puedeVer(contexto, seccion) : false),
    [contexto],
  );

  const incluye = useCallback(
    (capacidad: Capacidad) => (contexto ? puedeCapacidad(contexto, capacidad) : false),
    [contexto],
  );

  const value = useMemo(
    () => ({ token, usuario, negocio, licencia, aliasRecordado, login, logout, puede, incluye }),
    [token, usuario, negocio, licencia, aliasRecordado, login, logout, puede, incluye],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
