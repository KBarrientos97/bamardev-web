import { act, render, screen } from "@testing-library/react";
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
  return { ...real, api: { licencia: vi.fn(), me: vi.fn() } };
});

import { LICENCIA_KEY, NEGOCIO_KEY, USER_KEY, api, tokenStore } from "../lib/api";
import { TEMAS } from "../lib/temas";
import { AuthProvider, useAuth } from "./AuthContext";

const ADMIN: SesionUsuario = {
  id: 1,
  username: "admin",
  rol: "ADMIN",
  rolId: 1,
  rolNombre: "Dueño",
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

  it("con la misma huella no pide nada", async () => {
    vi.mocked(api.licencia).mockResolvedValue({ ...ESTADO, permisosVersion: "v1" });
    await montar();
    expect(api.me).not.toHaveBeenCalled();
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
