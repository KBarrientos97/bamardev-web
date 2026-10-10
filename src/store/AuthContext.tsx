import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CUPO_KEY,
  LICENCIA_KEY,
  NEGOCIO_KEY,
  USER_KEY,
  api,
  limpiarSesion,
  tokenStore,
} from "../lib/api";
import { apiMonedero } from "../lib/apiMonedero";
import { identificar, olvidarUsuario } from "../lib/telemetria";
import { fijarMoneda } from "../lib/format";
import { aplicarTema } from "../lib/temas";
import {
  puede as puedeCapacidad,
  puedeVer,
  type Capacidad,
  type ContextoPermisos,
  type Seccion,
} from "../lib/permisos";
import { conPerfilDelEstado } from "../lib/perfilNegocio";
import type { Vocabulario } from "../lib/rubro";
import type { CupoEstado, EstadoLicencia, SesionNegocio, SesionUsuario } from "../types";

/** Alias del negocio: se recuerda para no re-tipearlo en cada login. */
const ALIAS_KEY = "bamardev_web_alias";

interface AuthValue {
  token: string | null;
  usuario: SesionUsuario | null;
  negocio: SesionNegocio | null;
  licencia: EstadoLicencia | null;
  /** Último alias usado, para prellenar el login. */
  aliasRecordado: string;
  /**
   * Rubro del negocio (`FARMACIA`, `RESTAURANTE`…). Decide qué secciones
   * existen y cómo se llaman las cosas; ver `lib/rubro.ts`.
   */
  rubro: string | undefined;
  /**
   * Las palabras propias del negocio (`perfil.vocabulario`), para pasarle a
   * `termino()`. `undefined` con un backend que no manda perfil: ahí `termino`
   * usa lo de `rubro.ts`.
   */
  vocabulario: Vocabulario | undefined;
  login: (username: string, password: string, negocio: string) => Promise<void>;
  logout: () => void;
  /** ¿Se muestra esta sección? Permisos ∩ plan ∩ rubro. */
  puede: (seccion: Seccion) => boolean;
  /**
   * false mientras una sesión guardada sin permisos los está pidiendo a
   * `/auth/me`: las rutas esperan en vez de mandar a "sin acceso" a alguien
   * que en un segundo va a tener su menú.
   */
  permisosListos: boolean;
  /** ¿El plan incluye esta capacidad? Para botones dentro de una pantalla. */
  incluye: (capacidad: Capacidad) => boolean;
  /**
   * Plan Emprendedor: el último contador del día y saldo conocidos (el
   * "snapshot" de §5.1). null = el backend no lo mandó; con `ilimitado` es un
   * plan sin cupo. En los dos casos nadie muestra ni bloquea nada.
   */
  cupo: CupoEstado | null;
  /** Pisa el snapshot con uno más nuevo (el de una venta, una cita o un 403). */
  actualizarCupo: (cupo: CupoEstado | null | undefined) => void;
  /** Lo pide de nuevo a `GET /monedero`. Sólo tiene sentido con cupo. */
  refrescarCupo: () => Promise<void>;
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
  // Se rehidrata por lo mismo que la licencia: tras un F5 el POS tiene que
  // poder decidir si deja cobrar antes de que vuelva el primer chequeo.
  const [cupo, setCupo] = useState<CupoEstado | null>(() => leer<CupoEstado>(CUPO_KEY));

  /**
   * Guarda el snapshot del cupo. Llega de cinco lados (login, estado de la
   * licencia, `/monedero`, la respuesta de cada venta o cita y el cuerpo del
   * 403) y todos lo pasan por acá, así que se guarda igual venga de donde venga.
   */
  const guardarCupo = useCallback((nuevo: CupoEstado | null | undefined) => {
    const valor = nuevo ?? null;
    try {
      if (valor) localStorage.setItem(CUPO_KEY, JSON.stringify(valor));
      else localStorage.removeItem(CUPO_KEY);
    } catch {
      /* sin almacenamiento: vale para esta pestaña y listo */
    }
    setCupo(valor);
  }, []);

  /**
   * Orden de los snapshots. Las consultas (`/monedero`, `/licencia/estado`)
   * pueden volver DESPUÉS de algo más nuevo: el POS pide el contador al
   * montarse, la cajera vende antes de que vuelva, y la respuesta vieja
   * (40/50) pisaba la de la venta (41/50). Peor: después de comprar créditos
   * un chequeo en vuelo podía devolver el saldo 0 y volver a bloquear, y tras
   * salir y entrar a otro negocio, el `/monedero` de la sesión anterior se
   * metía en la nueva. Cada consulta anota su turno al SALIR y sólo se aplica
   * si nada más nuevo se escribió mientras tanto.
   */
  const turnoCupo = useRef(0);
  const turnoAplicado = useRef(0);
  const pedirTurnoCupo = useCallback(() => ++turnoCupo.current, []);
  const aplicarConsulta = useCallback(
    (turno: number, nuevo: CupoEstado | null | undefined) => {
      if (turno < turnoAplicado.current) return;
      turnoAplicado.current = turno;
      guardarCupo(nuevo);
    },
    [guardarCupo],
  );

  /** Lo que ya es un hecho (una venta, una cita, un 403, el login): va siempre. */
  const actualizarCupo = useCallback(
    (nuevo: CupoEstado | null | undefined) => {
      turnoAplicado.current = ++turnoCupo.current;
      guardarCupo(nuevo);
    },
    [guardarCupo],
  );

  const refrescarCupo = useCallback(async () => {
    const turno = pedirTurnoCupo();
    aplicarConsulta(turno, await apiMonedero.monedero());
  }, [pedirTurnoCupo, aplicarConsulta]);

  // La moneda del negocio vale para todo el formateo; se fija al rehidratar.
  if (negocio?.moneda) fijarMoneda(negocio.moneda);
  // Igual que la moneda: el tema se aplica también al rehidratar, o un F5
  // devolvería la app al verde por defecto hasta el siguiente login. Va con el
  // negocio entero y no sólo el rubro: la paleta es la que eligió el panel
  // (`negocio.tema`), y el rubro es el respaldo. Como corre en cada render,
  // también repinta cuando `refrescarNegocio` trae un perfil nuevo.
  aplicarTema(negocio);

  const login = useCallback(async (username: string, password: string, alias: string) => {
    const res = await api.login(username, password, alias);
    // `perfilVersion` viaja en el estado de la licencia y no en el negocio:
    // si el login trae la licencia, se toma de ahí, y así el primer chequeo
    // del poller no repinta lo mismo que se acaba de pintar.
    const sesion =
      res.negocio && res.licencia ? conPerfilDelEstado(res.negocio, res.licencia) : res.negocio;
    tokenStore.set(res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.usuario));
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(sesion));
    localStorage.setItem(ALIAS_KEY, alias);
    if (res.licencia) localStorage.setItem(LICENCIA_KEY, JSON.stringify(res.licencia));
    // El contrato lo manda en la raíz; si un backend lo mandara sólo dentro de
    // la licencia, también sirve.
    actualizarCupo(res.cupo ?? res.licencia?.cupo);
    fijarMoneda(res.negocio?.moneda);
    aplicarTema(sesion);
    setToken(res.accessToken);
    setUsuario(res.usuario);
    setNegocio(sesion);
    setLicencia(res.licencia ?? null);
    setAlias(alias);
    identificar(alias, res.usuario.username, res.usuario.rol);
  }, [actualizarCupo]);

  const logout = useCallback(() => {
    limpiarSesion();
    olvidarUsuario();
    // Vuelve al verde: el login no es de ningún negocio todavía, y quedarse
    // con el color del anterior confundiría a quien comparte la máquina.
    aplicarTema(null);
    setToken(null);
    setUsuario(null);
    setNegocio(null);
    setLicencia(null);
    // Lo que todavía esté en vuelo es de esta sesión: no tiene que volver.
    actualizarCupo(null);
  }, [actualizarCupo]);

  /**
   * Repinta el menú cuando el panel prende o apaga una sección.
   *
   * Hasta acá las features se leían una sola vez, en el login, y el token dura
   * 7 días: apagarle `gastos` a un cliente no le sacaba nada de la pantalla
   * hasta que cerrara sesión. El backend sí obedecía al instante —entraba a la
   * sección y comía un 403—, así que lo único desincronizado era lo que él
   * veía.
   *
   * **Una lista vacía no se aplica.** `permisos.ts` falla abierto sin features
   * (protege al negocio cuyos códigos todavía no se migraron): pisar la lista
   * buena con una vacía no apagaría el menú, lo encendería entero. Un backend
   * viejo que no manda el campo llega acá como `undefined` y tiene que dejar
   * todo como está, no abrir las puertas.
   */
  const refrescarFeatures = useCallback((features: string[] | undefined) => {
    if (!features || features.length === 0) return;
    setNegocio((previo) => {
      if (!previo) return previo;
      const antes = previo.features ?? [];
      // Comparación por contenido: sin esto, cada tick del poller crearía un
      // objeto nuevo y `contexto` se recalcularía cada 15 min para nada.
      const igual =
        antes.length === features.length && antes.every((f) => features.includes(f));
      if (igual) return previo;
      const actualizado = { ...previo, features };
      localStorage.setItem(NEGOCIO_KEY, JSON.stringify(actualizado));
      return actualizado;
    });
  }, []);

  /**
   * Lo mismo que `refrescarFeatures`, para la paleta y el perfil: si el panel
   * le cambia el color a un negocio, la pestaña abierta se repinta en el
   * próximo chequeo en vez de esperar al siguiente login. El repintado en sí
   * lo hace el `aplicarTema(negocio)` del render.
   */
  const refrescarPerfil = useCallback((estado: EstadoLicencia) => {
    setNegocio((previo) => {
      if (!previo) return previo;
      const actualizado = conPerfilDelEstado(previo, estado);
      if (actualizado !== previo) {
        localStorage.setItem(NEGOCIO_KEY, JSON.stringify(actualizado));
      }
      return actualizado;
    });
  }, []);

  /**
   * Trae de `/auth/me` los permisos y el rol (PLAN-ROLES-NEGOCIO §8) y los
   * guarda en la sesión. El rol viaja junto con los permisos: si el dueño le
   * renombra el rol a alguien o se lo cambia, la etiqueta de la cabecera
   * cambia con el menú y no recién en el próximo login.
   */
  const traerPermisos = useCallback(async (version?: string) => {
    const me = await api.me();
    if (!me.permisos) return;
    setUsuario((previo) => {
      if (!previo) return previo;
      const actualizado: SesionUsuario = {
        ...previo,
        rol: me.rol ?? previo.rol,
        rolId: me.rolId ?? previo.rolId,
        rolNombre: me.rolNombre ?? previo.rolNombre,
        esAdministrador: me.esAdministrador ?? previo.esAdministrador,
        permisos: me.permisos,
        permisosPropios: me.permisosPropios ?? [],
        permisosVersion: me.permisosVersion ?? version ?? previo.permisosVersion,
      };
      localStorage.setItem(USER_KEY, JSON.stringify(actualizado));
      return actualizado;
    });
  }, []);

  /**
   * Una sesión guardada antes de que el backend mandara permisos no tiene con
   * qué decidir nada: se piden una vez, al montar. Si no vienen (o falla), la
   * sesión queda sin acceso — no hay respaldo por nombre de rol.
   */
  const sinPermisos = !!usuario && !usuario.permisos;
  const [pidiendoPermisos, setPidiendoPermisos] = useState(sinPermisos);
  useEffect(() => {
    if (!token || !sinPermisos) return;
    let vivo = true;
    setPidiendoPermisos(true);
    traerPermisos()
      .catch(() => undefined)
      .finally(() => {
        if (vivo) setPidiendoPermisos(false);
      });
    return () => {
      vivo = false;
    };
  }, [token, sinPermisos, traerPermisos]);
  const permisosListos = !sinPermisos || !pidiendoPermisos;

  /**
   * Lo mismo cuando cambian (PLAN-ROLES §8.1): si la huella que manda
   * `/licencia/estado` no es la de la sesión —el dueño editó el rol, se lo
   * cambió, el plan sumó una feature—, se vuelven a pedir a `/auth/me` sin
   * cerrar la sesión. Sin huella no se hace nada.
   */
  const versionPermisos = usuario?.permisosVersion;
  const refrescarPermisos = useCallback(
    (version: string | undefined) => {
      if (!version || version === versionPermisos) return;
      traerPermisos(version).catch(() => undefined);
    },
    [versionPermisos, traerPermisos],
  );

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
      const turno = pedirTurnoCupo();
      api
        .licencia()
        .then((estado) => {
          if (!vivo) return;
          localStorage.setItem(LICENCIA_KEY, JSON.stringify(estado));
          setLicencia(estado);
          refrescarFeatures(estado.features);
          refrescarPerfil(estado);
          refrescarPermisos(estado.permisosVersion);
          // El contador viaja en este mismo estado: cada 15 min y al volver a
          // la pestaña llega el del día, aunque nadie haya vendido acá.
          aplicarConsulta(turno, estado.cupo);
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
  }, [token, refrescarFeatures, refrescarPerfil, refrescarPermisos, pedirTurnoCupo, aplicarConsulta]);

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
        ? {
            features: negocio?.features,
            rubro: negocio?.tipoNegocio,
            // Lo único que decide qué ve cada quien (PLAN-ROLES-NEGOCIO).
            permisos: usuario.permisos,
            permisosPropios: usuario.permisosPropios,
          }
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
    () => ({
      token,
      usuario,
      negocio,
      licencia,
      aliasRecordado,
      rubro: negocio?.tipoNegocio,
      vocabulario: negocio?.perfil?.vocabulario,
      login,
      logout,
      puede,
      incluye,
      permisosListos,
      cupo,
      actualizarCupo,
      refrescarCupo,
    }),
    [
      token,
      usuario,
      negocio,
      licencia,
      aliasRecordado,
      login,
      logout,
      puede,
      incluye,
      permisosListos,
      cupo,
      actualizarCupo,
      refrescarCupo,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
/**
 * La sesión si hay un `AuthProvider` arriba, o null. La usan las piezas de la
 * fase 4 de belleza que se enchufan dentro de pantallas que también se montan
 * sueltas (en sus tests, por ejemplo): sin sesión, simplemente no se dibujan.
 */
export function useAuthOpcional(): AuthValue | null {
  return useContext(AuthContext);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
