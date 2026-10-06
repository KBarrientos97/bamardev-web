import { describe, expect, it } from "vitest";
import {
  anulaVales,
  cobraConVale,
  cobraPropinas,
  editaFichaTecnica,
  pagaPropinas,
  veFichaTecnica,
  veInsumosCita,
  type ContextoExtras,
} from "./capacidades";
import { fmtCantidad, lineaFormula } from "./formato";
import { medidasFoto } from "./fotos";
import { puedeVer, type ContextoPermisos } from "../permisos";
import { permisosDe } from "../../test/sesiones";

/**
 * Las piezas de la fase 4 que se enchufan en el cobro, la cita y la ficha:
 * estrictas por feature (sin la feature, no existen aunque la lista venga
 * vacía) y sólo en belleza. Omar y la farmacia no ven nada nuevo.
 */

const FASE4 = ["gift_cards", "propinas", "consumo_servicio", "ficha_tecnica"];

const salon = (over: Partial<ContextoExtras> = {}): ContextoExtras => ({
  features: FASE4,
  rubro: "PELUQUERIA",
  // La recepción de la plantilla (CAJERO), con sus permisos reales.
  usuario: permisosDe("CAJERO"),
  ...over,
});

describe("capacidades de la fase 4", () => {
  it("en un salón con las features, recepción cobra con vale y propina", () => {
    expect(cobraConVale(salon())).toBe(true);
    expect(cobraPropinas(salon())).toBe(true);
    expect(veInsumosCita(salon())).toBe(true);
    expect(veFichaTecnica(salon())).toBe(true);
  });

  it("estrictas: sin la feature (o con la lista vacía) no hay nada", () => {
    expect(cobraConVale(salon({ features: [] }))).toBe(false);
    expect(cobraPropinas(salon({ features: null }))).toBe(false);
    expect(veFichaTecnica(salon({ features: ["gift_cards"] }))).toBe(false);
  });

  it("un restaurante o una farmacia no las ven aunque alguien se las prenda", () => {
    for (const rubro of ["RESTAURANTE", "FARMACIA", undefined]) {
      expect(cobraConVale(salon({ rubro }))).toBe(false);
      expect(cobraPropinas(salon({ rubro }))).toBe(false);
      expect(veInsumosCita(salon({ rubro }))).toBe(false);
    }
  });

  it("con permisos del backend, mandan los permisos", () => {
    const prof = salon({
      usuario: {
        permisos: ["fichatecnica.ver", "consumo.ajustar"],
        permisosPropios: ["fichatecnica.ver", "consumo.ajustar"],
      },
    });
    expect(veFichaTecnica(prof)).toBe(true);
    expect(editaFichaTecnica(prof)).toBe(false);
    expect(veInsumosCita(prof)).toBe(true);
    expect(pagaPropinas(prof)).toBe(false);
  });

  it("anular vales y entregar propinas: el encargado sí, la recepción sólo si se lo dan", () => {
    expect(anulaVales(salon())).toBe(false);
    expect(pagaPropinas(salon())).toBe(false);
    expect(anulaVales(salon({ usuario: permisosDe("SUPERVISOR") }))).toBe(true);
    expect(pagaPropinas(salon({ usuario: permisosDe("ADMIN") }))).toBe(true);
    expect(pagaPropinas(salon({ usuario: permisosDe("CAJERO", { extra: ["propinas.pagar"] }) }))).toBe(true);
  });

  it("sin permisos en la sesión no hay nada que dependa de uno", () => {
    const sin = salon({ usuario: {} });
    expect(veInsumosCita(sin)).toBe(false);
    expect(veFichaTecnica(sin)).toBe(false);
    expect(anulaVales(sin)).toBe(false);
    // Lo que sólo depende de la feature sigue: cobrar con vale es una forma de pago.
    expect(cobraConVale(sin)).toBe(true);
  });
});

describe("secciones de la fase 4 en el menú", () => {
  const ctx = (over: Partial<ContextoPermisos> = {}): ContextoPermisos => ({
    rubro: "BARBERIA",
    features: ["pos", "agenda", ...FASE4],
    ...permisosDe("ADMIN"),
    ...over,
  });

  it("aparecen en belleza con su feature", () => {
    expect(puedeVer(ctx(), "gift_cards")).toBe(true);
    expect(puedeVer(ctx(), "propinas")).toBe(true);
    expect(puedeVer(ctx(), "recetas_servicio")).toBe(true);
  });

  it("no aparecen en Omar ni en la farmacia, ni con la lista vacía", () => {
    expect(puedeVer(ctx({ rubro: "RESTAURANTE" }), "gift_cards")).toBe(false);
    expect(puedeVer(ctx({ rubro: "FARMACIA" }), "propinas")).toBe(false);
    expect(puedeVer(ctx({ features: [] }), "gift_cards")).toBe(false);
  });

  it("el profesional ve Propinas (las suyas) y nada más de esto", () => {
    const prof = ctx({
      permisos: ["propinas.ver", "agenda.ver"],
      permisosPropios: ["propinas.ver", "agenda.ver"],
    });
    expect(puedeVer(prof, "propinas")).toBe(true);
    expect(puedeVer(prof, "gift_cards")).toBe(false);
    expect(puedeVer(prof, "recetas_servicio")).toBe(false);
  });

  it("con permisos, el cajero vende vales pero no edita recetas", () => {
    const cajero = ctx({ permisos: ["vales.vender", "ventas.vender"], permisosPropios: [] });
    expect(puedeVer(cajero, "gift_cards")).toBe(true);
    expect(puedeVer(cajero, "recetas_servicio")).toBe(false);
    expect(puedeVer(cajero, "propinas")).toBe(false);
  });
});

describe("formato", () => {
  it("cantidades sin ceros de más", () => {
    expect(fmtCantidad(60)).toBe("60");
    expect(fmtCantidad(0.5)).toBe("0,5");
  });

  it("la fórmula en una línea, sin huecos", () => {
    expect(
      lineaFormula({ marca: "Igora", tono: "7.1", proporcion: "1:1,5", oxidante: "20 vol", tiempoMin: 35 }),
    ).toBe("Igora 7.1 · 1:1,5 · 20 vol · 35 min");
    expect(lineaFormula({ tono: "8.0" })).toBe("8.0");
  });

  it("las fotos se achican al lado mayor de 1280 y nunca se agrandan", () => {
    expect(medidasFoto(4000, 3000)).toEqual({ ancho: 1280, alto: 960 });
    expect(medidasFoto(800, 600)).toEqual({ ancho: 800, alto: 600 });
  });
});
