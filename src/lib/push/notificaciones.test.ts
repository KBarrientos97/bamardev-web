import { describe, expect, it } from "vitest";
import type { PreferenciaNotificacion } from "./apiNotificaciones";
import { situacionPush, type EntornoPush } from "./estadoPush";
import { agrupar, textoPrueba } from "./notificaciones";

const base: EntornoPush = { hayNotification: true, hayServiceWorker: true, permiso: "default", ios: false, instalada: false };

describe("situación de este equipo", () => {
  it("lee el permiso del navegador", () => {
    expect(situacionPush(base)).toBe("pendiente");
    expect(situacionPush({ ...base, permiso: "granted" })).toBe("concedido");
    expect(situacionPush({ ...base, permiso: "denied" })).toBe("denegado");
  });

  it("sin Notification o sin service worker no hay push", () => {
    expect(situacionPush({ ...base, hayNotification: false, permiso: null })).toBe("sin-soporte");
    expect(situacionPush({ ...base, hayServiceWorker: false })).toBe("sin-soporte");
  });

  it("en el iPhone sin instalar dice que hay que agregarla al inicio, aunque Safari no tenga Notification", () => {
    expect(situacionPush({ ...base, ios: true, hayNotification: false, permiso: null })).toBe("ios-sin-instalar");
    expect(situacionPush({ ...base, ios: true, instalada: true })).toBe("pendiente");
    // Instalada pero con un iOS anterior al 16.4: no hay arreglo instalando.
    expect(situacionPush({ ...base, ios: true, instalada: true, hayNotification: false, permiso: null })).toBe("sin-soporte");
  });
});

function aviso(tipo: string, grupo: string): PreferenciaNotificacion {
  return { tipo, grupo: grupo as PreferenciaNotificacion["grupo"], nombre: tipo, descripcion: "", apagable: true, activa: true };
}

describe("agrupar los avisos", () => {
  it("en el orden fijo de grupos, con sus títulos y sin grupos vacíos", () => {
    const g = agrupar([
      aviso("PIN_ALERTA", "SEGURIDAD"),
      aviso("LICENCIA_PAGADA", "CUENTA"),
      aviso("CAJA_ABIERTA", "CAJA"),
      aviso("CAJA_CERRADA", "CAJA"),
    ]);
    expect(g.map((x) => x.titulo)).toEqual(["Caja", "Cuenta y plan", "Seguridad"]);
    expect(g[0].avisos.map((a) => a.tipo)).toEqual(["CAJA_ABIERTA", "CAJA_CERRADA"]);
  });

  it("un grupo que no conoce sale al final, no se pierde", () => {
    const g = agrupar([aviso("RESERVA_NUEVA", "AGENDA"), aviso("VENTA_ANULADA", "VENTAS")]);
    expect(g.map((x) => x.titulo)).toEqual(["Ventas", "Agenda"]);
  });
});

describe("resultado de la prueba", () => {
  it("sin equipos: este equipo no está activado", () => {
    const r = textoPrueba({ dispositivos: 0, enviadas: 0, invalidas: 0, fallidas: 0 });
    expect(r.ok).toBe(false);
    expect(r.texto).toMatch(/Este equipo todavía no está activado/);
  });

  it("enviada, con los equipos que se quitaron o fallaron", () => {
    expect(textoPrueba({ dispositivos: 1, enviadas: 1, invalidas: 0, fallidas: 0 })).toEqual({
      ok: true,
      texto: "Enviada a 1 equipo. Si no aparece en un minuto, revisá que el equipo no esté en «No molestar».",
    });
    const r = textoPrueba({ dispositivos: 4, enviadas: 2, invalidas: 1, fallidas: 1 });
    expect(r.texto).toMatch(/^Enviada a 2 equipos\./);
    expect(r.texto).toMatch(/1 equipo ya no estaba activo y se quitó; a 1 equipo no se pudo enviar/);
  });

  it("con equipos pero ninguna enviada es un problema", () => {
    const r = textoPrueba({ dispositivos: 2, enviadas: 0, invalidas: 2, fallidas: 0 });
    expect(r.ok).toBe(false);
    expect(r.texto).toMatch(/No se pudo enviar a ninguno de tus equipos \(2 equipos\)/);
  });
});
