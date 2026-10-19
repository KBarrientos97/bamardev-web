import type { Frenado, IntentoPin, RespuestaIntentos } from "./apiSeguridad";

/**
 * Las reglas de lo que ve el dueño de los PIN mal escritos (18-oct-2026: "que
 * muestre que están intentando ingresar un PIN erróneo, qué usuario"). Puras,
 * para testearlas sin pantalla.
 *
 * El dueño no ve filas sueltas sino INCIDENTES: los intentos seguidos de una
 * misma persona (un fallo abre uno; lo que llega dentro de 15 minutos se le
 * suma; un acierto o una habilitación lo cierran).
 *
 * - Rojo: una alarma del backend (3 seguidos, acierto tras fallos, PIN
 *   frenado, 5 en el día, frenado del día). Mientras alguien está frenado, la
 *   franja roja no se cierra.
 * - Gris: un fallo que nadie explicó. Si la misma persona acertó enseguida
 *   (un dedo torpe), no se muestra en la franja: queda en la lista.
 *
 * Las constantes son espejo de src/seguridad/alarmas.ts del backend: si
 * cambian allá, cambian acá.
 */
export const VENTANA_MS = 15 * 60_000;
export const CORREGIDO_ENSEGUIDA_MS = 45_000;

const ms = (iso: string) => new Date(iso).getTime();
const dos = (n: number) => String(n).padStart(2, "0");
const horaDe = (d: Date) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;
const mismoDia = (x: Date, y: Date) =>
  x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();

/** "hoy 21:15", "ayer 22:40", "12/10 21:14", en el reloj de este equipo. */
export function cuando(iso: string, ahoraIso: string): string {
  const d = new Date(iso);
  const a = new Date(ahoraIso);
  if (mismoDia(d, a)) return `hoy ${horaDe(d)}`;
  const ayer = new Date(a);
  ayer.setDate(a.getDate() - 1);
  if (mismoDia(d, ayer)) return `ayer ${horaDe(d)}`;
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${horaDe(d)}`;
}

/** "hoy a las 22:10", "mañana a las 22:10", "el 20/10 a las 22:10". */
export function cuandoFuturo(iso: string, ahoraIso: string): string {
  const d = new Date(iso);
  const a = new Date(ahoraIso);
  if (mismoDia(d, a)) return `hoy a las ${horaDe(d)}`;
  const manana = new Date(a);
  manana.setDate(a.getDate() + 1);
  if (mismoDia(d, manana)) return `mañana a las ${horaDe(d)}`;
  return `el ${dos(d.getDate())}/${dos(d.getMonth() + 1)} a las ${horaDe(d)}`;
}

/** "21:14:05": la línea de tiempo, para buscarlo en la cámara. */
export function horaConSegundos(iso: string): string {
  const d = new Date(iso);
  return `${horaDe(d)}:${dos(d.getSeconds())}`;
}

/** El nombre de la acción cuando falta la descripción. Siempre por código. */
export function nombreAccion(codigo: string | null): string {
  switch (codigo) {
    case "ANULAR_VENTA":
    case "AUTORIZACION_ANULAR":
      return "Anular una venta";
    case "FIAR_SOBRE_LIMITE":
    case "LIMITE_CREDITO":
      return "Fiar por encima del límite";
    case "BILLAR_PAUSAR":
      return "Pausar una mesa";
    case "BILLAR_ANULAR_CONSUMO":
      return "Anular un consumo";
    case "BILLAR_ANULAR_MESA":
      return "Anular una mesa";
    case "BILLAR_EDITAR_INICIO":
      return "Corregir la hora de inicio";
    case "BILLAR_CORREGIR_PAGO":
    case "AUTORIZACION_CORREGIR_PAGO":
      return "Corregir el medio de pago";
    case "AGENDA_SOBRE_TURNO":
      return "Dar un sobre-turno";
    case "AUTORIZACION_BILLAR":
      return "Una acción del billar";
    default:
      return "Una autorización con PIN";
  }
}

/** "Pausar la Mesa 3" o, si falta, el nombre de la acción. */
export function paraQue(i: IntentoPin): string {
  return i.descripcion?.trim() || nombreAccion(i.accion);
}

function minuscula(t: string): string {
  return t ? t[0].toLowerCase() + t.slice(1) : t;
}

/** "el PIN de Kevin", "tu PIN", "su propio PIN", "un PIN con el usuario «kevn», que no existe". */
export function quePin(i: IntentoPin, yoId?: number): string {
  if (i.propio) return i.operador.id === yoId ? "tu propio PIN" : "su propio PIN";
  if (i.autorizador) return i.autorizador.id === yoId ? "tu PIN" : `el PIN de ${i.autorizador.nombre}`;
  if (i.tecleado) return `un PIN con el usuario «${i.tecleado}», que no existe`;
  return "un PIN que no es de ningún encargado";
}

/** "Desde el usuario de Ana" o "Desde tu usuario" (en minúscula para el medio de una frase). */
function desde(i: Pick<IntentoPin, "operador">, yoId?: number, inicio = true): string {
  const d = inicio ? "Desde" : "desde";
  return i.operador.id === yoId ? `${d} tu usuario` : `${d} el usuario de ${i.operador.nombre}`;
}

// ── Incidentes ────────────────────────────────────────────────────────────

export interface Incidente {
  operador: IntentoPin["operador"];
  /** De la más vieja a la más nueva. */
  filas: IntentoPin[];
  /** La más grave del incidente. */
  alarma: IntentoPin["alarma"];
  desenlace: "exito" | "habilitado" | null;
}

const GRAVEDAD: Record<NonNullable<IntentoPin["alarma"]>, number> = {
  BLOQUEO_DIA: 5,
  ACIERTO_TRAS_FALLOS: 4,
  BLOQUEO: 3,
  GOTEO: 2,
  TRES_SEGUIDOS: 1,
};

/**
 * Arma los incidentes: por persona, un FALLO abre uno si no hay uno abierto o
 * si pasaron más de 15 minutos desde el último fallo; BLOQUEADO se suma al
 * abierto; ACIERTO lo cierra como éxito y HABILITADO como habilitado. Del más
 * nuevo al más viejo.
 */
export function agrupar(filas: IntentoPin[]): Incidente[] {
  const porPersona = new Map<number, IntentoPin[]>();
  for (const f of [...filas].sort((a, b) => a.id - b.id)) {
    porPersona.set(f.operador.id, [...(porPersona.get(f.operador.id) ?? []), f]);
  }
  const incidentes: Incidente[] = [];
  for (const lista of porPersona.values()) {
    let abierto: Incidente | null = null;
    let ultimoFallo = 0;
    for (const f of lista) {
      const t = ms(f.creadoEn);
      const nuevo = (): Incidente => ({ operador: f.operador, filas: [f], alarma: null, desenlace: null });
      if (f.tipo === "FALLO") {
        if (abierto && t - ultimoFallo <= VENTANA_MS) abierto.filas.push(f);
        else {
          abierto = nuevo();
          incidentes.push(abierto);
        }
        ultimoFallo = t;
      } else if (f.tipo === "BLOQUEADO") {
        if (abierto) abierto.filas.push(f);
        else {
          abierto = nuevo();
          incidentes.push(abierto);
        }
      } else {
        const desenlace = f.tipo === "ACIERTO" ? "exito" : "habilitado";
        if (abierto && (f.tipo === "HABILITADO" || t - ultimoFallo <= VENTANA_MS)) {
          abierto.filas.push(f);
          abierto.desenlace = desenlace;
        } else {
          incidentes.push({ ...nuevo(), desenlace });
        }
        abierto = null;
      }
    }
  }
  for (const inc of incidentes) {
    inc.alarma = inc.filas.reduce<IntentoPin["alarma"]>(
      (peor, f) => (f.alarma && (!peor || GRAVEDAD[f.alarma] > GRAVEDAD[peor]) ? f.alarma : peor),
      null,
    );
  }
  const ultimo = (i: Incidente) => i.filas[i.filas.length - 1].id;
  return incidentes.sort((a, b) => ultimo(b) - ultimo(a));
}

export type Nivel = "alarma" | "nada" | "propio" | "tipeo" | "esperando" | "revisar";

const fallosDe = (inc: Incidente) => inc.filas.filter((f) => f.tipo === "FALLO");
const aciertoDe = (inc: Incidente) => inc.filas.find((f) => f.tipo === "ACIERTO");

/** Qué tan grave es un incidente para la franja. */
export function nivelDe(inc: Incidente, ahoraMs: number, yoId?: number): Nivel {
  if (inc.alarma) return "alarma";
  if (inc.filas.every((f) => f.tipo === "HABILITADO" || f.tipo === "ACIERTO")) return "nada";
  const fallos = fallosDe(inc);
  if (fallos.length && fallos.every((f) => f.propio && f.operador.id === yoId)) return "propio";
  const acierto = aciertoDe(inc);
  if (fallos.length === 1 && acierto && ms(acierto.creadoEn) - ms(fallos[0].creadoEn) <= CORREGIDO_ENSEGUIDA_MS) {
    const f = fallos[0];
    const mismo = f.motivo === "PIN_INCORRECTO" && f.autorizador?.id === acierto.autorizador?.id;
    if (mismo || f.motivo === "USUARIO_DESCONOCIDO") return "tipeo";
  }
  const ultimo = inc.filas[inc.filas.length - 1];
  if (!acierto && ahoraMs - ms(ultimo.creadoEn) < CORREGIDO_ENSEGUIDA_MS) return "esperando";
  return "revisar";
}

// ── Textos ────────────────────────────────────────────────────────────────

/** El texto de una alarma (franja roja), en palabras del dueño. */
export function textoAlarma(i: IntentoPin, ahoraIso: string, yoId?: number): string {
  const para = minuscula(paraQue(i));
  const hora = cuando(i.creadoEn, ahoraIso);
  const sesionPropia = i.operador.id === yoId;
  switch (i.alarma) {
    case "TRES_SEGUIDOS":
      if (sesionPropia) {
        return `Desde tu usuario se escribió mal 3 veces seguidas ${quePin(i, yoId)} · ${hora}. Si no fuiste vos, alguien está usando tu sesión: cerrala y cambiá tu PIN.`;
      }
      return `${desde(i, yoId)} se escribió mal 3 veces seguidas ${quePin(i, yoId)}, para ${para} · ${hora}`;
    case "BLOQUEO":
      return `${desde(i, yoId)} se escribió mal 5 veces seguidas ${quePin(i, yoId)}, para ${para}, y le frenamos el PIN 15 minutos · ${hora}`;
    case "ACIERTO_TRAS_FALLOS": {
      const n = i.seguidos ?? 2;
      if (i.autorizador?.id === yoId) {
        return `Después de ${n} equivocados, se autorizó con tu PIN ${desde(i, yoId, false)}: ${para} · ${hora}. ¿Fuiste vos? Si no, cambiá tu PIN ya.`;
      }
      const de = i.autorizador ? `el PIN de ${i.autorizador.nombre}` : "un PIN";
      return `Después de ${n} equivocados, se autorizó con ${de} ${desde(i, yoId, false)}: ${para} · ${hora}.${
        i.autorizador ? ` Si no fue ${i.autorizador.nombre}, cambiale el PIN.` : ""
      }`;
    }
    case "GOTEO":
      return `${desde(i, yoId)} se escribieron mal ${i.delDia ?? 5} PIN en las últimas 24 horas · el último ${hora}, para ${para}`;
    case "BLOQUEO_DIA":
      return `${desde(i, yoId)} se escribieron mal 10 PIN en 24 horas: ${
        sesionPropia ? "no podés" : `${i.operador.nombre} no puede`
      } pedir autorizaciones con PIN hasta que ${sesionPropia ? "otro administrador te habilite" : "lo habilites"}.`;
    default:
      return `${desde(i, yoId)}: ${para} · ${hora}`;
  }
}

/** El texto de un incidente sin alarma (franja gris). */
export function textoRevisar(inc: Incidente, ahoraIso: string, yoId?: number): string {
  const fallos = fallosDe(inc);
  const primero = fallos[0] ?? inc.filas[0];
  const para = minuscula(paraQue(primero));
  const hora = cuando(primero.creadoEn, ahoraIso);
  if (!fallos.length) {
    return `${desde(primero, yoId)} se siguió intentando con el PIN frenado (${para}) · ${hora}`;
  }
  const acierto = aciertoDe(inc);
  const cola = acierto
    ? ` · después se autorizó con ${acierto.autorizador ? `el PIN de ${acierto.autorizador.nombre}` : "un PIN"}`
    : primero.tecleado && !primero.autorizador
      ? ""
      : " · no se autorizó después";
  if (primero.propio) {
    return `${primero.operador.nombre} escribió mal su propio PIN para ${para} · ${hora}${cola}`;
  }
  if (!primero.autorizador) {
    return `${desde(primero, yoId)} se escribió ${quePin(primero, yoId)}, para ${para} · ${hora}`;
  }
  if (primero.motivo && primero.motivo !== "PIN_INCORRECTO") {
    const porque =
      primero.motivo === "USUARIO_INACTIVO"
        ? "que está desactivado"
        : primero.motivo === "SIN_PIN"
          ? "que no tiene PIN"
          : "que no puede autorizar eso";
    return `${desde(primero, yoId)} se probó ${quePin(primero, yoId)}, ${porque}, para ${para} · ${hora}`;
  }
  const veces = fallos.length > 1 ? ` ${fallos.length} veces` : "";
  return `${desde(primero, yoId)} se escribió mal${veces} ${quePin(primero, yoId)}, para ${para} · ${hora}${cola}`;
}

export interface Franja {
  tono: "rojo" | "gris";
  /** Roja fija: alguien está frenado. No se cierra hasta habilitarlo o que pasen 24 h. */
  fija: boolean;
  texto: string;
  boton: string;
  /** Sólo la gris tiene "Ya lo vi": la roja se revisa en el detalle. */
  cerrable: boolean;
  /** "Ya lo vi" marca hasta acá: lo que entre después vuelve a encenderla. */
  hastaId: number;
}

/** "Ana (hoy 21:15) y Beto (ayer 22:40)" o "Ana (2) y Beto (1)". */
function enLista(partes: string[]): string {
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : partes[0];
}

/** El texto de los frenados (franja roja fija). */
export function textoFrenados(frenados: Frenado[], ahoraIso: string, yoId?: number): string {
  const yo = frenados.find((f) => f.usuarioId === yoId);
  if (yo) {
    return "Tus autorizaciones con PIN están frenadas: desde tu usuario se escribieron mal 10 PIN en 24 horas. Si no fuiste vos, alguien usa tu sesión: cerrala y cambiá tu PIN.";
  }
  if (frenados.length === 1) {
    const f = frenados[0];
    return `${f.nombre} no puede pedir autorizaciones con PIN: llegó a 10 equivocados en 24 horas. El freno se levanta solo ${cuandoFuturo(f.hasta, ahoraIso)}, o lo levantás vos.`;
  }
  return `${frenados.length} personas no pueden pedir autorizaciones con PIN: ${enLista(frenados.map((f) => f.nombre))}.`;
}

/** Lo que la franja muestra ahora, o null. */
export function franjaDe(r: RespuestaIntentos, yoId?: number): Franja | null {
  const ahora = ms(r.ahora);
  const incidentes = agrupar(r.intentos).map((inc) => ({ inc, nivel: nivelDe(inc, ahora, yoId) }));
  const listos = incidentes.filter((x) => x.nivel !== "esperando");
  const hastaId = listos.length ? Math.max(...listos.flatMap((x) => x.inc.filas.map((f) => f.id))) : 0;
  const frenados = r.frenados ?? [];
  if (frenados.length) {
    return {
      tono: "rojo",
      fija: true,
      texto: textoFrenados(frenados, r.ahora, yoId),
      boton: "Ver y habilitar",
      cerrable: false,
      hastaId,
    };
  }
  const alarmas = incidentes.filter((x) => x.nivel === "alarma");
  if (alarmas.length) {
    const peor = (inc: Incidente) =>
      [...inc.filas].reverse().find((f) => f.alarma === inc.alarma) ?? inc.filas[inc.filas.length - 1];
    return {
      tono: "rojo",
      fija: false,
      texto:
        alarmas.length === 1
          ? textoAlarma(peor(alarmas[0].inc), r.ahora, yoId)
          : `${alarmas.length} alertas de PIN sin revisar · desde los usuarios de ${enLista(
              alarmas.map((x) => `${x.inc.operador.nombre} (${cuando(peor(x.inc).creadoEn, r.ahora)})`),
            )}`,
      boton: "Ver qué pasó",
      cerrable: false,
      hastaId,
    };
  }
  const revisar = incidentes.filter((x) => x.nivel === "revisar");
  if (!revisar.length) return null;
  const porPersona = new Map<string, number>();
  for (const x of revisar) {
    porPersona.set(x.inc.operador.nombre, (porPersona.get(x.inc.operador.nombre) ?? 0) + fallosDe(x.inc).length);
  }
  const fallos = revisar.reduce((t, x) => t + Math.max(1, fallosDe(x.inc).length), 0);
  return {
    tono: "gris",
    fija: false,
    texto:
      revisar.length === 1
        ? textoRevisar(revisar[0].inc, r.ahora, yoId)
        : `${fallos} PIN mal escritos sin revisar · desde los usuarios de ${enLista(
            [...porPersona].map(([n, c]) => `${n} (${c})`),
          )} · el último ${cuando(revisar[0].inc.filas[revisar[0].inc.filas.length - 1].creadoEn, r.ahora)}`,
    boton: "Ver",
    cerrable: true,
    hastaId,
  };
}

// ── El modal ──────────────────────────────────────────────────────────────

/** Una línea de la línea de tiempo: "21:14:05 · PIN incorrecto". */
export function lineaDeTiempo(f: IntentoPin): string {
  const hora = horaConSegundos(f.creadoEn);
  const aviso = f.alarma ? (f.avisado ? " · te avisamos (llegó al celular)" : " · te avisamos") : "";
  switch (f.tipo) {
    case "BLOQUEADO":
      return `${hora} · siguió intentando con el PIN frenado`;
    case "ACIERTO":
      return `${hora} · se autorizó con ${f.autorizador ? `el PIN de ${f.autorizador.nombre}` : "un PIN"}${aviso}`;
    case "HABILITADO":
      return `${hora} · ${f.autorizador?.nombre ?? "El administrador"} lo habilitó`;
    default: {
      const motivo =
        f.motivo === "USUARIO_DESCONOCIDO"
          ? "usuario que no existe"
          : f.motivo === "USUARIO_INACTIVO"
            ? "usuario desactivado"
            : f.motivo === "SIN_PIN"
              ? "usuario sin PIN"
              : f.motivo === "SIN_PERMISO"
                ? "usuario sin permiso para esto"
                : "PIN incorrecto";
      return `${hora} · ${motivo}${aviso}`;
    }
  }
}

/** "Con el PIN de Kevin · 3 equivocados". */
export function conQueIncidente(inc: Incidente): string {
  const fallos = fallosDe(inc);
  const f = fallos[0] ?? inc.filas[0];
  const con = f.propio
    ? "Con su propio PIN"
    : f.autorizador
      ? `Con el PIN de ${f.autorizador.nombre}`
      : f.tecleado
        ? `Con el usuario «${f.tecleado}», que no existe`
        : "Con un PIN que no es de ningún encargado";
  return fallos.length > 1 ? `${con} · ${fallos.length} equivocados` : con;
}

/** Cómo terminó: una sola frase. */
export function desenlaceDe(inc: Incidente, nivel: Nivel, frenado: Frenado | undefined, ahoraIso: string): string {
  const acierto = aciertoDe(inc);
  const habilitado = inc.filas.find((f) => f.tipo === "HABILITADO");
  if (nivel === "tipeo" && acierto) {
    const seg = Math.round((ms(acierto.creadoEn) - ms(fallosDe(inc)[0].creadoEn)) / 1000);
    return `A los ${seg} segundos se autorizó con ${acierto.autorizador ? `el PIN de ${acierto.autorizador.nombre}` : "un PIN"}: parece un error de tipeo.`;
  }
  if (habilitado) {
    return `${habilitado.autorizador?.nombre ?? "El administrador"} lo habilitó a las ${horaDe(new Date(habilitado.creadoEn))}.`;
  }
  if (acierto) {
    return `Después se autorizó con ${acierto.autorizador ? `el PIN de ${acierto.autorizador.nombre}` : "un PIN"} a las ${horaDe(new Date(acierto.creadoEn))}.`;
  }
  if (inc.alarma === "BLOQUEO_DIA" && frenado) {
    return `Frenado hasta ${cuandoFuturo(frenado.hasta, ahoraIso)}, o hasta que lo habilites.`;
  }
  const bloqueo = inc.filas.find((f) => f.alarma === "BLOQUEO" && f.bloqueadoHasta);
  if (bloqueo?.bloqueadoHasta) {
    return `Le frenamos el PIN 15 minutos (hasta las ${horaDe(new Date(bloqueo.bloqueadoHasta))}).`;
  }
  return "No se volvió a intentar.";
}

/** La insignia del incidente. */
export function insigniaDe(nivel: Nivel): { texto: string; tono: "rojo" | "gris" | "claro" } {
  if (nivel === "alarma") return { texto: "Alerta", tono: "rojo" };
  if (nivel === "tipeo" || nivel === "nada" || nivel === "propio") return { texto: "Error de tipeo", tono: "claro" };
  return { texto: "Para revisar", tono: "gris" };
}
