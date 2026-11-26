import { pedir } from "../academia/apiPublica";
import type { Catalogo, Paciente } from "./tipos";
import type { CatalogoSeguimiento, Tratamiento } from "./seguimiento/tipos";

/**
 * «Consultar mi ficha» (rubro NUTRICION, 25-nov-2026): el paciente escribe su
 * carnet en la página del consultorio y ve, de sólo lectura, su evaluación y
 * su seguimiento, con los PDF. Sin sesión: `POST
 * /publico/nutricion/<sub>/consulta`.
 *
 * Viene lo mismo que lleva el PDF y nada más: el seguimiento SIN pagos (los
 * montos en null y los avisos apagados), sin la nota interna del tratamiento
 * ni quién cargó cada semana. Dato sensible de salud: nada va a la consola ni
 * a la telemetría, y no se guarda en el navegador.
 */
export interface ConsultaPaciente {
  negocio: string;
  /** La ficha y los controles de la evaluación (sin el id del cliente). */
  paciente: Omit<Paciente, "clienteId">;
  catalogo: Catalogo;
  seguimiento: {
    catalogo: Pick<CatalogoSeguimiento, "unidades" | "uiPorMl" | "tratamientos" | "ocultos">;
    /** El activo primero; después, del más nuevo al más viejo. */
    tratamientos: Tratamiento[];
  };
}

export interface InfoConsulta {
  negocio: string;
  telefono: string | null;
}

const sub = (s: string) => encodeURIComponent(s);

export const apiConsultaNutricion = {
  /** 404 si el negocio no es un consultorio de nutrición. */
  info: (subdominio: string) => pedir<InfoConsulta>(`/publico/nutricion/${sub(subdominio)}`),
  consultar: (subdominio: string, input: { ci: string; captcha?: string }) =>
    pedir<ConsultaPaciente>(`/publico/nutricion/${sub(subdominio)}/consulta`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
