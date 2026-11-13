import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoLicencia, SesionNegocio, SesionUsuario } from "../types";

/**
 * La paleta y el perfil se refrescan con el mismo chequeo de licencia que las
 * features: si el panel le cambia el color a un negocio, la pestaña abierta se
 * repinta sin volver a entrar. Y con el backend de hoy, que no manda nada de
 * eso, todo queda como estaba.
 */

vi.mock("../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../lib/api")>();
  return { ...real, api: { licencia: vi.fn(), me: vi.fn(), login: vi.fn() } };
});
vi.mock("../lib/apiMonedero", () => ({ apiMonedero: { monedero: vi.fn() } }));

import { CUPO_KEY, LICENCIA_KEY, NEGOCIO_KEY, USER_KEY, api, tokenStore } from "../lib/api";
import { apiMonedero } from "../lib/apiMonedero";
import { bajarCarta, cartaGuardada, olvidarCarta } from "../pages/salon/cartaGuardada";
import { cupoEmprendedor } from "../test/cupoFixtures";
import { TEMAS } from "../lib/temas";
import { AuthProvider, useAuth } from "./AuthContext";

const ADMIN: SesionUsuario = {
  id: 1,
  username: "admin",
  rol: "ADMIN",
  rolId: 1,
  rolNombre: "Administrador",
  esAdministrador: true,
  permisos: ["ventas.vender", "reportes.ver"],
  permisosPropios: [],
  permisosVersion: "v1",
};
const BARBERIA: SesionNegocio = { id: 2, nombre: "Barbería QA", tipoNegocio: "BARBERIA" };

const ESTADO: EstadoLicencia = {
  vencimiento: null,
  diasGracia: 3,
  urlPago: "",
  situacion: "activa",
  vigente: true,
  diasRestantes: null,
  diasParaBloqueo: null,
  mensaje: "",
};

function Sonda() {
  const { negocio, vocabulario } = useAuth();
  return (
    <p>
      version:{String(negocio?.perfilVersion ?? "-")} vocab:{vocabulario?.articulos ?? "-"}
    </p>
  );
}

const primary = () =>
  document.documentElement.style.getPropertyValue("--color-primary").toLowerCase();

async function montar() {
  await act(async () => {
    render(
      <AuthProvider>
        <Sonda />
      </AuthProvider>,
    );
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute("style");
  tokenStore.set("token");
  localStorage.setItem(USER_KEY, JSON.stringify(ADMIN));
  localStorage.setItem(NEGOCIO_KEY, JSON.stringify(BARBERIA));
});

describe("refresco de los permisos y del rol", () => {
  function SondaRol() {
    const { usuario, puede } = useAuth();
    return (
      <p>
        rol:{usuario?.rolNombre ?? "-"} id:{String(usuario?.rolId ?? "-")} reportes:{String(puede("reportes"))}
      </p>
    );
  }

  it("una huella nueva trae de /auth/me los permisos, y también el nombre y el id del rol", async () => {
    // El dueño le cambió el rol a esta cuenta: la cabecera y el menú cambian
    // juntos, sin cerrar sesión.
    vi.mocked(api.licencia).mockResolvedValue({ ...ESTADO, permisosVersion: "v2" });
    vi.mocked(api.me).mockResolvedValue({
      id: 1,
      username: "admin",
      rol: "CAJERO",
      rolId: 7,
      rolNombre: "Cajera de la tarde",
      esAdministrador: false,
      negocioId: 2,
      esPlataforma: false,
      permisos: ["ventas.vender"],
      permisosPropios: [],
      permisosVersion: "v2",
    });
    await act(async () => {
      render(
        <AuthProvider>
          <SondaRol />
        </AuthProvider>,
      );
    });
    await act(async () => {});
    expect(screen.getByText("rol:Cajera de la tarde id:7 reportes:false")).toBeInTheDocument();
    const guardado = JSON.parse(localStorage.getItem(USER_KEY) ?? "{}");
    expect(guardado).toMatchObject({ rolId: 7, rolNombre: "Cajera de la tarde", esAdministrador: false, permisosVersion: "v2" });
  });

  it("con la misma huella no vuelve a pedir los permisos", async () => {
    // `/auth/me` se llama una vez, por el conteo de sucursales del chequeo
    // (PLAN-SUCURSAL-TOTAL); lo que devuelva ahí no toca el rol ni los permisos.
    vi.mocked(api.licencia).mockResolvedValue({ ...ESTADO, permisosVersion: "v1" });
    vi.mocked(api.me).mockResolvedValue({
      id: 1,
      username: "admin",
      rol: "CAJERO",
      rolNombre: "Otro",
      negocioId: 2,
      esPlataforma: false,
      permisos: ["ventas.vender"],
      permisosVersion: "v9",
    });
    await montar();
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(USER_KEY) ?? "{}")).toMatchObject({
      rolNombre: "Administrador",
      permisosVersion: "v1",
    });
  });
});

describe("refresco del perfil con el estado de la licencia", () => {
  it("al rehidratar sin tema usa el color del rubro", async () => {
    vi.mocked(api.licencia).mockResolvedValue(ESTADO);
    await montar();
    expect(primary()).toBe(TEMAS.BARBERIA.primary.toLowerCase());
    expect(screen.getByText("version:- vocab:-")).toBeInTheDocument();
  });

  it("una perfilVersion nueva repinta y guarda tema y perfil", async () => {
    vi.mocked(api.licencia).mockResolvedValue({
      ...ESTADO,
      perfilVersion: 5,
      tema: { clave: "LAVANDA", tokens: TEMAS.SPA },
      perfil: {
        rubro: "BARBERIA",
        nombre: "Barbería",
        vertical: "BELLEZA",
        estado: "EN_DESARROLLO",
        icono: "navaja",
        vocabulario: { articulos: "Servicios" },
      },
    });
    await montar();
    expect(primary()).toBe(TEMAS.SPA.primary.toLowerCase());
    expect(screen.getByText("version:5 vocab:Servicios")).toBeInTheDocument();
    const guardado = JSON.parse(localStorage.getItem(NEGOCIO_KEY) ?? "{}");
    expect(guardado.perfilVersion).toBe(5);
    expect(guardado.tema.clave).toBe("LAVANDA");
    expect(JSON.parse(localStorage.getItem(LICENCIA_KEY) ?? "{}").perfilVersion).toBe(5);
  });

  it("la misma versión no toca la sesión guardada", async () => {
    const guardada = { ...BARBERIA, perfilVersion: 5, tema: { clave: "CARBON", tokens: TEMAS.BARBERIA } };
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify(guardada));
    vi.mocked(api.licencia).mockResolvedValue({
      ...ESTADO,
      perfilVersion: 5,
      tema: { clave: "LAVANDA", tokens: TEMAS.SPA },
    });
    await montar();
    expect(primary()).toBe(TEMAS.BARBERIA.primary.toLowerCase());
    expect(JSON.parse(localStorage.getItem(NEGOCIO_KEY) ?? "{}").tema.clave).toBe("CARBON");
  });
});

describe("cupo del Plan Emprendedor (§5.2)", () => {
  function SondaCupo() {
    const { cupo, refrescarCupo, login, logout } = useAuth();
    return (
      <div>
        <p>
          cupo:{cupo ? `${cupo.plan} ${cupo.hoy.ventas.usadas}/${cupo.hoy.ventas.limite} saldo ${cupo.creditos.saldo}` : "-"}
        </p>
        <button onClick={() => void refrescarCupo()}>refrescar</button>
        <button onClick={() => void login("admin", "x", "barberia")}>entrar</button>
        <button onClick={logout}>salir</button>
      </div>
    );
  }

  async function montarCupo() {
    await act(async () => {
      render(
        <AuthProvider>
          <SondaCupo />
        </AuthProvider>,
      );
    });
  }

  it("estado.cupo se guarda (y sobrevive al F5)", async () => {
    vi.mocked(api.licencia).mockResolvedValue({ ...ESTADO, cupo: cupoEmprendedor({ ventas: 32, saldo: 240 }) });
    await montarCupo();
    expect(screen.getByText("cupo:EMPRENDEDOR 32/50 saldo 240")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(CUPO_KEY) ?? "null").hoy.ventas.usadas).toBe(32);
  });

  it("un backend que no manda cupo deja todo como siempre", async () => {
    vi.mocked(api.licencia).mockResolvedValue(ESTADO);
    await montarCupo();
    expect(screen.getByText("cupo:-")).toBeInTheDocument();
    expect(localStorage.getItem(CUPO_KEY)).toBeNull();
  });

  it("el login guarda el cupo de la raíz; salir lo borra", async () => {
    // El chequeo de licencia que dispara el token nuevo trae el mismo cupo:
    // un backend que lo manda en el login lo manda también en el estado.
    vi.mocked(api.licencia).mockImplementation(async () =>
      tokenStore.get() === "t2" ? { ...ESTADO, cupo: cupoEmprendedor({ ventas: 5, saldo: 10 }) } : ESTADO,
    );
    vi.mocked(api.login).mockResolvedValue({
      accessToken: "t2",
      usuario: ADMIN,
      negocio: BARBERIA,
      cupo: cupoEmprendedor({ ventas: 5, saldo: 10 }),
    });
    await montarCupo();
    await act(async () => fireEvent.click(screen.getByText("entrar")));
    expect(screen.getByText("cupo:EMPRENDEDOR 5/50 saldo 10")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByText("salir")));
    expect(screen.getByText("cupo:-")).toBeInTheDocument();
  });

  it("refrescarCupo lo pide a GET /monedero", async () => {
    vi.mocked(api.licencia).mockResolvedValue({ ...ESTADO, cupo: cupoEmprendedor({ ventas: 1 }) });
    vi.mocked(apiMonedero.monedero).mockResolvedValue(cupoEmprendedor({ ventas: 2, saldo: 50 }));
    await montarCupo();
    await act(async () => fireEvent.click(screen.getByText("refrescar")));
    expect(apiMonedero.monedero).toHaveBeenCalledTimes(1);
    expect(screen.getByText("cupo:EMPRENDEDOR 2/50 saldo 50")).toBeInTheDocument();
  });
});

describe("la carta del salón guardada no sobrevive a la sesión", () => {
  function SondaSesion() {
    const { login, logout } = useAuth();
    return (
      <div>
        <button onClick={() => void login("admin", "x", "barberia")}>entrar</button>
        <button onClick={logout}>salir</button>
      </div>
    );
  }

  async function montarSesion() {
    vi.mocked(api.licencia).mockResolvedValue(ESTADO);
    await act(async () => {
      render(
        <AuthProvider>
          <SondaSesion />
        </AuthProvider>,
      );
    });
  }

  const bajarUna = async () => {
    olvidarCarta();
    (api as unknown as { cartaSalon: ReturnType<typeof vi.fn> }).cartaSalon = vi.fn().mockResolvedValue([{ id: 1, nombre: "Brasa" }]);
    await bajarCarta();
    expect(cartaGuardada()).not.toBeNull();
  };

  it("salir la descarta: el próximo usuario de la pestaña no ve la carta (ni los precios) de otro", async () => {
    await montarSesion();
    await bajarUna();
    await act(async () => fireEvent.click(screen.getByText("salir")));
    expect(cartaGuardada()).toBeNull();
  });

  it("entrar con otro usuario también la descarta", async () => {
    vi.mocked(api.login).mockResolvedValue({ accessToken: "t2", usuario: ADMIN, negocio: BARBERIA });
    await montarSesion();
    await bajarUna();
    await act(async () => fireEvent.click(screen.getByText("entrar")));
    expect(cartaGuardada()).toBeNull();
  });
});

describe("cupo: una respuesta vieja no pisa una más nueva", () => {
  function Sonda() {
    const { cupo, refrescarCupo, actualizarCupo, login, logout } = useAuth();
    return (
      <div>
        <p>cupo:{cupo ? `${cupo.hoy.ventas.usadas}/${cupo.hoy.ventas.limite} saldo ${cupo.creditos.saldo}` : "-"}</p>
        <button onClick={() => void refrescarCupo()}>refrescar</button>
        <button onClick={() => actualizarCupo(cupoEmprendedor({ ventas: 41, saldo: 0 }))}>vender</button>
        <button onClick={() => void login("admin", "x", "otro")}>entrar</button>
        <button onClick={logout}>salir</button>
      </div>
    );
  }

  function diferida<T>() {
    let resolver!: (v: T) => void;
    const promesa = new Promise<T>((r) => (resolver = r));
    return { promesa, resolver };
  }

  async function montarSonda() {
    await act(async () => {
      render(
        <AuthProvider>
          <Sonda />
        </AuthProvider>,
      );
    });
  }

  it("un GET /monedero que salió antes de la venta no pisa el contador de la venta", async () => {
    vi.mocked(api.licencia).mockResolvedValue({ ...ESTADO, cupo: cupoEmprendedor({ ventas: 40 }) });
    const viejo = diferida<ReturnType<typeof cupoEmprendedor>>();
    vi.mocked(apiMonedero.monedero).mockReturnValue(viejo.promesa);
    await montarSonda();
    // El POS pide el contador al montarse; antes de que vuelva, la venta
    // responde con su `consumo.cupo` (41/50).
    await act(async () => fireEvent.click(screen.getByText("refrescar")));
    await act(async () => fireEvent.click(screen.getByText("vender")));
    expect(screen.getByText("cupo:41/50 saldo 0")).toBeInTheDocument();
    await act(async () => viejo.resolver(cupoEmprendedor({ ventas: 40 })));
    expect(screen.getByText("cupo:41/50 saldo 0")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(CUPO_KEY) ?? "null").hoy.ventas.usadas).toBe(41);
  });

  it("el chequeo de licencia en vuelo tampoco pisa lo que llegó después", async () => {
    const viejo = diferida<EstadoLicencia>();
    vi.mocked(api.licencia).mockReturnValueOnce(viejo.promesa);
    await montarSonda();
    await act(async () => fireEvent.click(screen.getByText("vender")));
    await act(async () => viejo.resolver({ ...ESTADO, cupo: cupoEmprendedor({ ventas: 40 }) }));
    expect(screen.getByText("cupo:41/50 saldo 0")).toBeInTheDocument();
  });

  it("el GET /monedero de la sesión anterior no se mete en la del negocio nuevo", async () => {
    vi.mocked(api.licencia).mockResolvedValue({ ...ESTADO, cupo: cupoEmprendedor({ ventas: 7, saldo: 3 }) });
    const deA = diferida<ReturnType<typeof cupoEmprendedor>>();
    vi.mocked(apiMonedero.monedero).mockReturnValue(deA.promesa);
    vi.mocked(api.login).mockResolvedValue({
      accessToken: "t2",
      usuario: ADMIN,
      negocio: { ...BARBERIA, id: 9 },
      cupo: cupoEmprendedor({ ventas: 0, saldo: 10 }),
    });
    await montarSonda();
    await act(async () => fireEvent.click(screen.getByText("refrescar")));
    await act(async () => fireEvent.click(screen.getByText("salir")));
    // El chequeo de la sesión nueva devuelve el mismo cupo que su login.
    vi.mocked(api.licencia).mockResolvedValue({ ...ESTADO, cupo: cupoEmprendedor({ ventas: 0, saldo: 10 }) });
    await act(async () => fireEvent.click(screen.getByText("entrar")));
    expect(screen.getByText("cupo:0/50 saldo 10")).toBeInTheDocument();
    // Vuelve tarde la respuesta del negocio anterior (con su token).
    await act(async () => deA.resolver(cupoEmprendedor({ ventas: 49, saldo: 0 })));
    expect(screen.getByText("cupo:0/50 saldo 10")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(CUPO_KEY) ?? "null").creditos.saldo).toBe(10);
  });

  it("después de salir, una respuesta en vuelo no deja el cupo guardado", async () => {
    vi.mocked(api.licencia).mockResolvedValue({ ...ESTADO, cupo: cupoEmprendedor({ ventas: 7 }) });
    const enVuelo = diferida<ReturnType<typeof cupoEmprendedor>>();
    vi.mocked(apiMonedero.monedero).mockReturnValue(enVuelo.promesa);
    await montarSonda();
    await act(async () => fireEvent.click(screen.getByText("refrescar")));
    await act(async () => fireEvent.click(screen.getByText("salir")));
    await act(async () => enVuelo.resolver(cupoEmprendedor({ ventas: 8 })));
    expect(screen.getByText("cupo:-")).toBeInTheDocument();
    expect(localStorage.getItem(CUPO_KEY)).toBeNull();
  });

  it("dos pedidos en vuelo: gana el que salió último aunque vuelva primero", async () => {
    vi.mocked(api.licencia).mockResolvedValue({ ...ESTADO, cupo: cupoEmprendedor({ ventas: 1 }) });
    const primero = diferida<ReturnType<typeof cupoEmprendedor>>();
    const segundo = diferida<ReturnType<typeof cupoEmprendedor>>();
    vi.mocked(apiMonedero.monedero).mockReturnValueOnce(primero.promesa).mockReturnValueOnce(segundo.promesa);
    await montarSonda();
    await act(async () => fireEvent.click(screen.getByText("refrescar")));
    await act(async () => fireEvent.click(screen.getByText("refrescar")));
    await act(async () => segundo.resolver(cupoEmprendedor({ ventas: 6 })));
    await act(async () => primero.resolver(cupoEmprendedor({ ventas: 5 })));
    expect(screen.getByText("cupo:6/50 saldo 0")).toBeInTheDocument();
  });
});

describe("cantidad de sucursales del usuario asignado (PLAN-SUCURSAL-TOTAL etapa 1)", () => {
  const CAJERO_DE_SEDE: SesionUsuario = { ...ADMIN, id: 9, rol: "CAJERO", sucursalId: 3, sucursal: "Norte" };

  function SondaSucursales() {
    const { negocio } = useAuth();
    // `undefined` no es `null` ni 0: una sesión vieja no sabe cuántas hay.
    return <p>activas:{negocio?.sucursalesActivas === undefined ? "?" : negocio.sucursalesActivas}</p>;
  }

  async function montarSucursales() {
    await act(async () => {
      render(
        <AuthProvider>
          <SondaSucursales />
        </AuthProvider>,
      );
    });
    await act(async () => {});
  }

  it("una sesión vieja de un asignado (sin el conteo) lo trae de /auth/me y lo guarda", async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(CAJERO_DE_SEDE));
    vi.mocked(api.licencia).mockResolvedValue(ESTADO);
    vi.mocked(api.me).mockResolvedValue({
      id: 9,
      username: "admin",
      rol: "CAJERO",
      negocioId: 2,
      esPlataforma: false,
      sucursalesActivas: 2,
    });
    await montarSucursales();
    expect(screen.getByText("activas:2")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(NEGOCIO_KEY) ?? "{}")).toMatchObject({ sucursalesActivas: 2 });
  });

  it("un backend que no manda el campo deja la sesión como estaba (sin inventar)", async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(CAJERO_DE_SEDE));
    vi.mocked(api.licencia).mockResolvedValue(ESTADO);
    vi.mocked(api.me).mockResolvedValue({
      id: 9,
      username: "admin",
      rol: "CAJERO",
      negocioId: 2,
      esPlataforma: false,
    });
    await montarSucursales();
    expect(screen.getByText("activas:?")).toBeInTheDocument();
  });

  const ME_DE_ORGANIZACION = (sucursalesActivas?: number) => ({
    id: 1,
    username: "admin",
    rol: "ADMIN",
    negocioId: 2,
    esPlataforma: false,
    ...(sucursalesActivas === undefined ? {} : { sucursalesActivas }),
  });

  it("una sesión vieja de la organización (sin el conteo) también lo trae de /auth/me al abrir", async () => {
    // Antes del deploy el login no lo traía: sin esto los papeles de un negocio
    // de 2 locales no llevaban el local hasta cerrar sesión (hasta 7 días).
    vi.mocked(api.licencia).mockResolvedValue(ESTADO);
    vi.mocked(api.me).mockResolvedValue(ME_DE_ORGANIZACION(2));
    await montarSucursales();
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(screen.getByText("activas:2")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(NEGOCIO_KEY) ?? "{}")).toMatchObject({ sucursalesActivas: 2 });
  });

  it("la organización con un solo local sólo gasta el /auth/me del chequeo y queda en 1", async () => {
    vi.mocked(api.licencia).mockResolvedValue(ESTADO);
    vi.mocked(api.me).mockResolvedValue(ME_DE_ORGANIZACION(1));
    await montarSucursales();
    expect(api.me).toHaveBeenCalledTimes(1);
    expect(screen.getByText("activas:1")).toBeInTheDocument();
  });

  it("un backend viejo sin el campo deja la sesión de la organización como estaba", async () => {
    vi.mocked(api.licencia).mockResolvedValue(ESTADO);
    vi.mocked(api.me).mockResolvedValue(ME_DE_ORGANIZACION());
    await montarSucursales();
    expect(screen.getByText("activas:?")).toBeInTheDocument();
  });

  it("el chequeo periódico lo baja otra vez a 1 si se cerró un local", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      localStorage.setItem(NEGOCIO_KEY, JSON.stringify({ ...BARBERIA, sucursalesActivas: 2 }));
      vi.mocked(api.licencia).mockResolvedValue(ESTADO);
      vi.mocked(api.me).mockResolvedValue(ME_DE_ORGANIZACION(2));
      await montarSucursales();
      expect(screen.getByText("activas:2")).toBeInTheDocument();

      vi.mocked(api.me).mockResolvedValue(ME_DE_ORGANIZACION(1));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
      });
      expect(screen.getByText("activas:1")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refrescarSucursalesActivas (después de crear un local) actualiza la sesión en el acto", async () => {
    localStorage.setItem(NEGOCIO_KEY, JSON.stringify({ ...BARBERIA, sucursalesActivas: 1 }));
    vi.mocked(api.licencia).mockResolvedValue(ESTADO);
    vi.mocked(api.me).mockResolvedValue(ME_DE_ORGANIZACION(1));
    function Boton() {
      const { refrescarSucursalesActivas } = useAuth();
      return <button onClick={() => void refrescarSucursalesActivas()}>crear local</button>;
    }
    await act(async () => {
      render(
        <AuthProvider>
          <SondaSucursales />
          <Boton />
        </AuthProvider>,
      );
    });
    await act(async () => {});
    expect(screen.getByText("activas:1")).toBeInTheDocument();

    vi.mocked(api.me).mockResolvedValue(ME_DE_ORGANIZACION(2));
    await act(async () => fireEvent.click(screen.getByText("crear local")));
    expect(screen.getByText("activas:2")).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(NEGOCIO_KEY) ?? "{}")).toMatchObject({ sucursalesActivas: 2 });
  });

  it("si /auth/me falla, no revienta ni cambia nada", async () => {
    localStorage.setItem(USER_KEY, JSON.stringify(CAJERO_DE_SEDE));
    vi.mocked(api.licencia).mockResolvedValue(ESTADO);
    vi.mocked(api.me).mockRejectedValue(new Error("sin red"));
    await montarSucursales();
    expect(screen.getByText("activas:?")).toBeInTheDocument();
  });
});
