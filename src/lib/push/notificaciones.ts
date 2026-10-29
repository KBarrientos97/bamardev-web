import type { GrupoNotificacion, PreferenciaNotificacion, ResultadoPrueba } from "./apiNotificaciones";

/*
 * Lo que la pantalla Notificaciones arma con lo que manda el backend, aparte
 * para probarlo sin dibujar nada.
 */

/** El orden de los grupos en pantalla y su título. */
const GRUPOS: { grupo: GrupoNotificacion; titulo: string }[] = [
  { grupo: "CAJA", titulo: "Caja" },
  { grupo: "VENTAS", titulo: "Ventas" },
  { grupo: "COBROS", titulo: "Cobros" },
  { grupo: "CUENTA", titulo: "Cuenta y plan" },
  { grupo: "SEGURIDAD", titulo: "Seguridad" },
];

/**
 * Los avisos por grupo, en el orden de `GRUPOS` y sin grupos vacíos. Un grupo
 * que el backend sume mañana sale al final con su nombre tal cual: mejor un
 * título feo que un aviso que no se puede apagar porque no se dibuja.
 */
export function agrupar(lista: PreferenciaNotificacion[]): { grupo: string; titulo: string; avisos: PreferenciaNotificacion[] }[] {
  const conocidos = GRUPOS.map((g) => ({ ...g, avisos: lista.filter((p) => p.grupo === g.grupo) }));
  const otros = [...new Set(lista.map((p) => p.grupo as string))]
    .filter((g) => !GRUPOS.some((c) => c.grupo === g))
    .map((g) => ({ grupo: g, titulo: g.charAt(0) + g.slice(1).toLowerCase(), avisos: lista.filter((p) => p.grupo === g) }));
  return [...conocidos, ...otros].filter((g) => g.avisos.length > 0);
}

/** El resultado de la prueba, en palabras (y si es un problema o no). */
export function textoPrueba(r: ResultadoPrueba): { ok: boolean; texto: string } {
  if (r.dispositivos === 0) {
    return { ok: false, texto: "Este equipo todavía no está activado: tocá «Activar notificaciones» y probá de nuevo." };
  }
  const equipos = (n: number) => `${n} ${n === 1 ? "equipo" : "equipos"}`;
  if (r.enviadas === 0) {
    return {
      ok: false,
      texto: `No se pudo enviar a ninguno de tus equipos (${equipos(r.dispositivos)}). Volvé a activar las notificaciones en este equipo.`,
    };
  }
  const extras = [
    r.invalidas > 0 ? `${equipos(r.invalidas)} ya no ${r.invalidas === 1 ? "estaba activo y se quitó" : "estaban activos y se quitaron"}` : "",
    r.fallidas > 0 ? `a ${equipos(r.fallidas)} no se pudo enviar` : "",
  ].filter(Boolean);
  return {
    ok: true,
    texto:
      `Enviada a ${equipos(r.enviadas)}. Si no aparece en un minuto, revisá que el equipo no esté en «No molestar».` +
      (extras.length ? ` (${extras.join("; ")}.)` : ""),
  };
}
