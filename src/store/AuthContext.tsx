import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { NEGOCIO_KEY, USER_KEY, api, limpiarSesion, tokenStore } from "../lib/api";
import { fijarMoneda } from "../lib/format";
import { puedeVer, type ContextoPermisos, type Seccion } from "../lib/permisos";
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
  const [licencia, setLicencia] = useState<EstadoLicencia | null>(null);
  const [aliasRecordado, setAlias] = useState(() => localStorage.getItem(ALIAS_KEY) ?? "");

  // La moneda del negocio vale para todo el formateo; se fija al rehidratar.
  if (negocio?.moneda) fijarMoneda(negocio.moneda);

  const login = useCallback(async (username: string, password: string, alias: string) => {
    const res = await api.login(username, password, alias);
    tokenStore.set(res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.usuario));
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(res.negocio));
    localStorage.setItem(ALIAS_KEY, alias);
    fijarMoneda(res.negocio?.moneda);
    setToken(res.accessToken);
    setUsuario(res.usuario);
    setNegocio(res.negocio);
    setLicencia(res.licencia ?? null);
    setAlias(alias);
  }, []);

  const logout = useCallback(() => {
    limpiarSesion();
    setToken(null);
    setUsuario(null);
    setNegocio(null);
    setLicencia(null);
  }, []);

  const puede = useCallback(
    (seccion: Seccion) => {
      if (!usuario) return false;
      const ctx: ContextoPermisos = {
        rol: usuario.rol,
        modulos: usuario.modulos,
        features: negocio?.features,
      };
      return puedeVer(ctx, seccion);
    },
    [usuario, negocio],
  );

  const value = useMemo(
    () => ({ token, usuario, negocio, licencia, aliasRecordado, login, logout, puede }),
    [token, usuario, negocio, licencia, aliasRecordado, login, logout, puede],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
