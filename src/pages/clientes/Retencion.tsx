import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { AvisoOk, Badge, Boton, Cargando, ErrorMsg, Input, Modal, Select, Vacio } from "../../components/ui";
import { apiCrm, haceDias, SEGMENTOS, type FilaCliente, type ResumenCliente, type Segmento } from "../../lib/crm/apiCrm";
import { fmtFecha, fmtMoney } from "../../lib/format";
import { tienePermiso } from "../../lib/permisos";
import { apiPromociones } from "../../lib/promociones/apiPromociones";
import { enlaceWhatsapp, primerNombre, rellenar } from "../../lib/promociones/textos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";

/**
 * Clientes que no vuelven y segmentos (PLAN-CRM-Y-PROMOCIONES §3.5-3.7).
 *
 * Es una lista de trabajo, no una automatización: el sistema dice a quién
 * conviene escribir y arma el texto; la persona lo manda con `wa.me` (la API
 * de WhatsApp es deuda técnica). Sólo se ofrece escribir a quien aceptó
 * promociones (D7); el resto se ve en gris para saber cuántos se pierden.
 */
const PLANTILLA =
  "¡Hola {nombre}! Hace tiempo que no te vemos por {negocio}. {enlace}\n\nSi no querés recibir más mensajes, respondé NO.";

/** "Contactado hoy" vive en este navegador: es una ayuda para no repetir. */
const CLAVE_CONTACTADOS = "bamar.crm.contactados";
function leerContactados(): Record<string, number> {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_CONTACTADOS) ?? "{}") as Record<string, number>;
    const hace14 = Date.now() - 14 * 86_400_000;
    return Object.fromEntries(Object.entries(d).filter(([, t]) => t > hace14));
  } catch {
    return {};
  }
}

export default function Retencion() {
  const { negocio, usuario } = useAuth();
  const puedeExportar = tienePermiso(usuario, "cliente.exportar");
  const puedeEditar = tienePermiso(usuario, "cliente.marketing");
  // Compartir una promo pide listarlas, y `GET /promociones` exige
  // `promociones.gestionar` además de la feature: sin el permiso era un 403
  // en cada carga y un selector que nunca llenaba (QA R1 W-08).
  const conPromos = !!negocio?.features?.includes("promociones") && tienePermiso(usuario, "promociones.gestionar");
  const [modo, setModo] = useState<"RECURRENCIA" | "FIJO">("RECURRENCIA");
  const [dias, setDias] = useState(60);
  const [segmento, setSegmento] = useState<Segmento | "NO_VUELVEN">("NO_VUELVEN");
  const [q, setQ] = useState("");
  const [plantilla, setPlantilla] = useState(PLANTILLA);
  const [promoId, setPromoId] = useState<number | null>(null);
  const [enlace, setEnlace] = useState("");
  const [contactados, setContactados] = useState(leerContactados);
  const [ficha, setFicha] = useState<number | null>(null);
  const [aviso, setAviso] = useState("");
  const [error, setError] = useState("");

  const lista = useApi(
    () =>
      segmento === "NO_VUELVEN"
        ? apiCrm.noVuelven({ dias, modo })
        : apiCrm.clientes({ dias, modo, segmento }),
    [segmento, dias, modo],
  );
  const promos = useApi(
    () => (conPromos ? apiPromociones.listar().catch(() => []) : Promise.resolve([])),
    [conPromos],
  );
  const compartibles = (promos.datos ?? []).filter((p) => p.publica && p.estadoVisible === "ACTIVA");

  useEffect(() => {
    if (promoId == null) {
      setEnlace("");
      return;
    }
    apiPromociones
      .enlace(promoId, "WHATSAPP")
      .then((e) => setEnlace(e.url))
      .catch((e: Error) => setError(e.message));
  }, [promoId]);

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (lista.datos?.clientes ?? []).filter((c) => !t || c.nombre.toLowerCase().includes(t));
  }, [lista.datos, q]);
  const contactables = filas.filter((c) => c.contactable).length;

  const escribir = (c: FilaCliente) => {
    if (!c.whatsapp) return;
    const texto = rellenar(plantilla, {
      nombre: primerNombre(c.nombre),
      negocio: negocio?.nombre ?? "el negocio",
      enlace,
    }).replace(/\s+\n/g, "\n");
    window.open(enlaceWhatsapp(c.whatsapp, texto), "_blank", "noopener");
    const nuevos = { ...contactados, [c.id]: Date.now() };
    setContactados(nuevos);
    try {
      localStorage.setItem(CLAVE_CONTACTADOS, JSON.stringify(nuevos));
    } catch {
      /* sin storage: sólo se pierde la marca */
    }
  };

  const exportar = async () => {
    setError("");
    try {
      await apiCrm.exportar({
        lista: segmento === "NO_VUELVEN" ? "NO_VUELVEN" : "SEGMENTO",
        dias,
        modo,
        ...(segmento !== "NO_VUELVEN" ? { segmento } : {}),
      });
      setAviso("Se descargó la lista. Quedó registrado en la bitácora del negocio.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar");
    }
  };

  const resumen = lista.datos?.resumen;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-texto">Clientes que no vuelven</h1>
          <p className="text-sm text-texto-3">
            Según cada cuánto viene cada uno. Escribiles por WhatsApp desde tu número.
          </p>
        </div>
        {puedeExportar && (
          <Boton variante="ghost" icono="download" onClick={() => void exportar()}>
            Exportar CSV
          </Boton>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist">
        <TabSegmento
          activo={segmento === "NO_VUELVEN"}
          onClick={() => setSegmento("NO_VUELVEN")}
          texto="No vuelven"
          cantidad={resumen ? resumen.EN_RIESGO + resumen.PERDIDO : undefined}
        />
        {SEGMENTOS.map((s) => (
          <TabSegmento
            key={s.valor}
            activo={segmento === s.valor}
            onClick={() => setSegmento(s.valor)}
            texto={s.texto}
            cantidad={resumen?.[s.valor]}
          />
        ))}
      </div>

      <div className="grid gap-3 rounded-2xl border border-borde bg-white p-4 md:grid-cols-[1fr_1fr_2fr]">
        <label className="block text-[13px] font-semibold text-texto-2">
          Cuándo deja de volver
          <Select value={modo} onChange={(e) => setModo(e.target.value as "RECURRENCIA" | "FIJO")}>
            <option value="RECURRENCIA">Según su frecuencia</option>
            <option value="FIJO">Días fijos para todos</option>
          </Select>
        </label>
        <label className="block text-[13px] font-semibold text-texto-2">
          {modo === "FIJO" ? "Días sin venir" : "Días (si vino una sola vez)"}
          <Input
            type="number"
            value={String(dias)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 7 && n <= 730) setDias(n);
            }}
          />
        </label>
        {conPromos && (
          <label className="block text-[13px] font-semibold text-texto-2">
            Promoción para el mensaje
            <Select
              value={promoId == null ? "" : String(promoId)}
              onChange={(e) => setPromoId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Sin promoción</option>
              {compartibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="block text-[13px] font-semibold text-texto-2 md:col-span-3">
          Mensaje ({"{nombre}"}, {"{negocio}"}, {"{enlace}"})
          <textarea
            value={plantilla}
            onChange={(e) => setPlantilla(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm font-normal text-texto outline-none focus:border-primary"
          />
        </label>
      </div>

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="w-full max-w-xs">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar cliente" />
        </div>
        <p className="text-xs text-texto-3">
          {filas.length} clientes · {contactables} aceptaron promociones
        </p>
      </div>

      {lista.cargando ? (
        <Cargando texto="Calculando…" />
      ) : lista.error ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : filas.length === 0 ? (
        <div className="rounded-2xl border border-borde bg-white">
          <Vacio
            icono="users"
            titulo="Nadie en esta lista"
            texto="Los clientes aparecen cuando se los asocia a una venta, a un fiado o a una cita."
          />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-borde bg-white">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-texto-3">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Última visita</th>
                <th className="px-3 py-2 text-right">Visitas</th>
                <th className="px-3 py-2 text-right">Gastó</th>
                <th className="px-3 py-2">Suele venir</th>
                <th className="px-3 py-2">Segmento</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde-soft">
              {filas.map((c) => {
                const seg = SEGMENTOS.find((s) => s.valor === c.segmento);
                const yaHoy = contactados[c.id] != null;
                return (
                  <tr key={c.id} className={c.contactable ? "" : "text-texto-3"}>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => setFicha(c.id)} className="font-semibold hover:underline">
                        {c.nombre}
                      </button>
                      {c.telefono && <div className="text-xs text-texto-3">{c.telefono}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {haceDias(c.diasSinVenir)}
                    </td>
                    <td className="px-3 py-2 text-right">{c.visitas}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(c.gastoTotal)}</td>
                    <td className="px-3 py-2">
                      {c.frecuenciaDias != null ? `cada ${c.frecuenciaDias} días` : "una vez"}
                    </td>
                    <td className="px-3 py-2">{seg && <Badge tono={seg.tono}>{seg.texto}</Badge>}</td>
                    <td className="px-3 py-2 text-right">
                      {c.contactable ? (
                        <Boton
                          variante={yaHoy ? "ghost" : "soft"}
                          icono="phone"
                          className="px-3 py-1.5"
                          onClick={() => escribir(c)}
                        >
                          {yaHoy ? "Contactado" : "WhatsApp"}
                        </Boton>
                      ) : (
                        <span className="text-xs">Sin permiso para contactar</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {ficha != null && (
        <FichaAmpliada
          clienteId={ficha}
          puedeEditar={puedeEditar}
          onCerrar={() => setFicha(null)}
          onCambio={lista.recargar}
        />
      )}
    </div>
  );
}

function TabSegmento({
  activo,
  onClick,
  texto,
  cantidad,
}: {
  activo: boolean;
  onClick: () => void;
  texto: string;
  cantidad?: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activo}
      onClick={onClick}
      className={`rounded-xl border px-3 py-1.5 text-sm font-semibold ${
        activo ? "border-primary bg-primary-50 text-primary-700" : "border-borde bg-white text-texto-3"
      }`}
    >
      {texto}
      {cantidad != null && <span className="ml-1.5 text-xs font-normal">{cantidad}</span>}
    </button>
  );
}

/** La ficha ampliada (§3.3): valor del cliente, compras, promociones y consentimiento. */
export function FichaAmpliada({
  clienteId,
  puedeEditar,
  onCerrar,
  onCambio,
}: {
  clienteId: number;
  puedeEditar: boolean;
  onCerrar: () => void;
  onCambio?: () => void;
}) {
  const r = useApi<ResumenCliente>(() => apiCrm.resumen(clienteId), [clienteId]);
  const [error, setError] = useState("");
  const d = r.datos;
  const marcar = async (acepta: boolean) => {
    setError("");
    try {
      await apiCrm.marketing(clienteId, acepta);
      r.recargar();
      onCambio?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    }
  };
  return (
    <Modal abierto titulo={d?.nombre ?? "Cliente"} onClose={onCerrar} ancho="max-w-xl">
      {r.cargando ? (
        <Cargando />
      ) : r.error ? (
        <ErrorMsg>{r.error}</ErrorMsg>
      ) : (
        d && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Dato titulo="Gastó en total" valor={fmtMoney(d.metricas.gastoTotal)} />
              <Dato titulo="Ticket medio" valor={d.metricas.ticketMedio != null ? fmtMoney(d.metricas.ticketMedio) : "—"} />
              <Dato titulo="Visitas" valor={String(d.metricas.visitas)} />
              <Dato
                titulo="Última visita"
                valor={haceDias(d.metricas.diasSinVenir)}
              />
              <Dato
                titulo="Suele venir"
                valor={d.metricas.frecuenciaDias != null ? `cada ${d.metricas.frecuenciaDias} días` : "—"}
              />
              <Dato titulo="Debe (fiado)" valor={fmtMoney(d.metricas.deudaFiado)} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <Icon name={d.marketing.acepta ? "check" : "info"} size={15} />
                {d.marketing.acepta
                  ? `Acepta promociones${d.marketing.en ? ` (desde ${fmtFecha(d.marketing.en)})` : ""}`
                  : d.marketing.acepta === false
                    ? "No quiere recibir promociones"
                    : "No se le preguntó si acepta promociones"}
              </span>
              {puedeEditar && (
                <span className="flex gap-1.5">
                  {d.marketing.acepta !== true && (
                    <Boton variante="soft" className="px-3 py-1" onClick={() => void marcar(true)}>
                      Aceptó
                    </Boton>
                  )}
                  {d.marketing.acepta !== false && (
                    <Boton variante="ghost" className="px-3 py-1" onClick={() => void marcar(false)}>
                      Dar de baja
                    </Boton>
                  )}
                </span>
              )}
            </div>
            <ErrorMsg>{error}</ErrorMsg>

            <div>
              <h3 className="mb-1 text-[13px] font-semibold text-texto-2">Compras</h3>
              {d.compras.length === 0 ? (
                <p className="text-sm text-texto-3">Sin compras asociadas.</p>
              ) : (
                <ul className="divide-y divide-borde-soft text-sm">
                  {d.compras.map((c) => (
                    <li key={`${c.tipo}-${c.ventaId}`} className="flex justify-between py-1.5">
                      <span>
                        {fmtFecha(c.fecha)} · {c.comprobante ?? c.tipo}
                        {c.tipo === "FIADO" && <span className="ml-1 text-xs text-texto-3">(fiado)</span>}
                      </span>
                      <span className={c.estado === "ANULADO" ? "line-through text-texto-3" : ""}>
                        {fmtMoney(c.total)}
                        {c.descuento > 0 && <span className="ml-1 text-xs text-primary-700">−{fmtMoney(c.descuento)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {d.promociones.length > 0 && (
              <div>
                <h3 className="mb-1 text-[13px] font-semibold text-texto-2">Promociones que usó</h3>
                <ul className="text-sm text-texto-2">
                  {d.promociones.map((p, i) => (
                    <li key={i}>
                      {p.promocion}
                      {p.codigo ? ` (${p.codigo})` : ""} · {fmtMoney(p.monto)}
                      {p.estado === "REVERTIDO" ? " · anulada" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      )}
    </Modal>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-borde-soft px-3 py-2">
      <p className="text-xs text-texto-3">{titulo}</p>
      <p className="text-[15px] font-bold text-texto">{valor}</p>
    </div>
  );
}
