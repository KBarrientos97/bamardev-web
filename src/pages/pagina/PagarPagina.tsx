import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiAcademiaPublica, ErrorPublico } from "../../lib/academia/apiPublica";
import { fechaCorta } from "../../lib/academia/formato";
import type { EstadoCuentaPublico } from "../../lib/academia/tipos";
import { paleta } from "../../lib/pagina/aspecto";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import { usePaginaPublica } from "../../lib/pagina/usePaginaPublica";
import { Icon } from "../../components/Icon";
import { Chip } from "../academia/piezas";
import { NoDisponible } from "./PaginaPublica";
import { useComprobantePago } from "./ComprobantePago";
import PagoEnLineaPublico from "./PagoEnLineaPublico";
import { MarcaBamarDev } from "./VistaPagina";

/** Para llamar al hook antes de tener el estado: sin pagos, no arma nada. */
const SIN_ESTADO = { instituto: { nombre: "", logoUrl: null, telefono: null }, alumno: { nombres: "" }, curso: "", grupo: { nombre: "", sede: "" }, cuotas: [], proxima: null, saldoTotal: 0, qr: null } as unknown as EstadoCuentaPublico;

const bs = (n: number) => `Bs ${n.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** "591…" listo para wa.me, o null. */
function waDe(telefono: string | null): string | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (d.length < 7) return null;
  return `https://wa.me/${d.length === 8 ? `591${d}` : d}`;
}

/**
 * P6 · Pagar (ronda 2, D10): el enlace personal que la recepción manda por
 * WhatsApp (`/p/<sub>/pagar/<token>`) o al que se llega entrando con el carnet
 * (`mi-cuenta`, M5). El estudiante ve lo próximo que
 * tiene que pagar, su estado de cuenta y cómo pagar: con el QR fijo del
 * instituto elige qué paga (completo, primer mes o la próxima cuota), escanea y
 * sube el comprobante, que la recepción aprueba; sin QR, "pagá en la academia".
 * El QR del banco por monto exacto, que se acredita solo, llega con BISA
 * (`pago.modo === "AUTOMATIZADO"`, todavía no se ofrece).
 *
 * También sirve a una preinscripción (todavía sin cuotas): ahí es donde paga
 * para asegurar el cupo.
 *
 * Nunca muestra el carnet, el teléfono ni los apellidos completos: lo manda
 * así el backend, y un token que no existe da "no disponible".
 */
export default function PagarPagina() {
  const { subdominio = "", token = "" } = useParams();
  const sub = subdominio.toLowerCase();
  const { pagina } = usePaginaPublica(sub);
  const [d, setD] = useState<EstadoCuentaPublico | null>(null);
  const [error, setError] = useState("");
  /** Sube cada vez que hay que pedir el estado de nuevo (subió un comprobante). */
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    let vivo = true;
    apiAcademiaPublica
      .estadoCuenta(sub, token)
      .then((r) => vivo && setD(r))
      .catch((e: unknown) => {
        if (!vivo) return;
        setError(e instanceof ErrorPublico && e.status === 404 ? "Este enlace no existe o ya no está activo" : e instanceof Error ? e.message : "No se pudo cargar");
      });
    return () => {
      vivo = false;
    };
  }, [sub, token, vuelta]);

  // Antes de los retornos tempranos: es un hook. El comprobante se arma sólo al bajarlo.
  const comprobante = useComprobantePago(d ?? SIN_ESTADO);

  useEffect(() => {
    if (d) document.title = `Estado de cuenta · ${d.instituto.nombre}`;
  }, [d]);

  if (error) return <NoDisponible mensaje={error} />;
  if (!d) return <div style={{ minHeight: "100dvh", background: "#F6F7F9" }} aria-busy="true" />;

  const color = pagina ? paleta(pagina.color.hex).oscuro : "#111827";
  const logo = urlDeImagen(d.instituto.logoUrl);
  const wa = waDe(d.instituto.telefono);
  const p = d.proxima;
  const preinscrita = d.pago.estado === "PREINSCRITA";
  // Lo mismo que decide si `PagoEnLineaPublico` dibuja algo: sin pago que
  // mostrar, la compu no parte la pantalla en dos.
  const hayPago = !!d.pago.enRevision || preinscrita || d.pago.opciones.length > 0;
  const dos = hayPago ? "lg:col-start-1" : "";

  return (
    <div style={{ minHeight: "100dvh", background: "#F6F7F9", fontFamily: "Roboto, system-ui, sans-serif" }}>
      {/* En el celular, una columna (saludo, pago, cuotas). En la compu, el pago
          pasa a la derecha y queda a la vista mientras se recorren las cuotas. */}
      <div
        className={`mx-auto flex w-full max-w-[480px] flex-col gap-4 px-4 py-6 lg:py-10 ${
          hayPago ? "lg:grid lg:max-w-[1080px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start lg:gap-x-6" : "lg:max-w-[640px]"
        }`}
      >
        <header className="flex items-center gap-3 lg:col-span-2">
          {logo ? (
            <img src={logo} alt="" className="h-9 w-9 rounded-xl object-cover" />
          ) : (
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: color }}>
              {d.instituto.nombre.charAt(0)}
            </span>
          )}
          <span className="text-[15px] font-bold text-[#111827]">{d.instituto.nombre}</span>
        </header>

        <section aria-labelledby="t-hola" className={`space-y-1 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm ${dos}`}>
          <h1 id="t-hola" className="text-xl font-bold text-[#111827]">
            Hola, {d.alumno.nombres.split(" ")[0]}
          </h1>
          <p className="text-[13px] text-[#6B7280]">
            {d.curso} · {d.grupo.nombre} · Sede {d.grupo.sede}
          </p>
          {p ? (
            // Lo que tiene que pagar, en su recuadro: el monto es lo primero que se busca.
            <div
              className={`mt-3 rounded-xl border p-4 ${p.vencida ? "border-[#FECACA] bg-[#FEF2F2]" : "border-[#E5E7EB] bg-[#F9FAFB]"}`}
            >
              <p className="text-[13px] font-semibold text-[#4B5563]">{p.concepto}</p>
              <p className="mt-0.5 text-3xl font-bold tabular-nums text-[#111827]">{bs(p.saldo)}</p>
              <p
                className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${
                  p.vencida ? "bg-[#FEE2E2] text-[#B91C1C]" : "bg-white text-[#4B5563] ring-1 ring-inset ring-[#E5E7EB]"
                }`}
              >
                {p.vencida ? `Venció el ${fechaCorta(p.vence)}` : `Vence el ${fechaCorta(p.vence)}`}
              </p>
            </div>
          ) : preinscrita ? (
            <p className="mt-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-4 text-sm text-[#374151]">
              <strong className="text-[#111827]">Estás preinscrito.</strong> Tu inscripción se confirma con tu primer pago.
            </p>
          ) : (
            <p className="mt-3 flex items-center gap-2 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-4 text-sm font-semibold text-[#047857]">
              <Icon name="checkCirculo" size={18} />
              Estás al día: no debés nada.
            </p>
          )}
        </section>

        {hayPago && (
          <div className="lg:sticky lg:top-6 lg:col-start-2 lg:row-span-4 lg:row-start-2">
            <PagoEnLineaPublico d={d} sub={sub} token={token} color={color} whatsapp={wa} onCambio={() => setVuelta((v) => v + 1)} />
          </div>
        )}

        {d.cuotas.length > 0 && (
        <section aria-labelledby="t-cuenta" className={`overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm ${dos}`}>
          <h2 id="t-cuenta" className="border-b border-[#E5E7EB] px-5 py-3.5 text-sm font-bold text-[#111827]">
            Tu estado de cuenta
          </h2>
          <ul className="divide-y divide-[#F1F5F9] px-5">
            {d.cuotas.map((c, i) => {
              const urgente = c.vencida && c.saldo > 0;
              // El estado en chip de color: verde pagado, ámbar abonado, rojo vencido.
              const tono = c.estado === "PAGADA" ? "verde" : c.estado === "ANULADA" ? "gris" : c.pagado > 0 ? "ambar" : c.vencida ? "rojo" : null;
              const estado =
                c.estado === "PAGADA"
                  ? "Pagado"
                  : c.estado === "ANULADA"
                    ? "Anulada"
                    : c.pagado > 0
                      ? `Abonaste ${bs(c.pagado)} · faltan ${bs(c.saldo)}`
                      : c.vencida
                        ? `Por pagar · venció el ${fechaCorta(c.vence)}`
                        : `Vence el ${fechaCorta(c.vence)}`;
              return (
                <li key={`${c.concepto}-${i}`} className="flex items-start justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#111827]">{c.concepto}</span>
                    {tono ? (
                      <Chip tono={tono} className="mt-1 !whitespace-normal">
                        {estado}
                      </Chip>
                    ) : (
                      <span className="mt-0.5 block text-[12px] text-[#6B7280]">{estado}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {/* El comprobante de lo pagado: sólo el ícono, sin sección aparte (dueño, 24-nov). */}
                    {(c.pagos ?? []).map((k) => {
                      const hecho = d.pagosHechos?.[k];
                      if (!hecho) return null;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => comprobante.bajar(hecho)}
                          disabled={comprobante.bajando != null}
                          title={`Descargar comprobante ${hecho.comprobante}`}
                          aria-label={`Descargar comprobante ${hecho.comprobante}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border bg-white hover:bg-[#F9FAFB] disabled:opacity-50"
                          style={{ color, borderColor: color }}
                        >
                          <Icon name="fileText" size={16} />
                        </button>
                      );
                    })}
                    <span className={`text-sm tabular-nums ${urgente ? "font-semibold text-[#B91C1C]" : "text-[#374151]"}`}>{bs(c.monto)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="flex justify-between border-t border-[#E5E7EB] bg-[#F9FAFB] px-5 py-3.5 text-sm font-bold text-[#111827]">
            <span>Saldo del curso</span>
            <span className="tabular-nums">{bs(d.saldoTotal)}</span>
          </p>
          {comprobante.fallo && (
            <p role="alert" className="border-t border-[#FECACA] bg-[#FEF2F2] px-5 py-2.5 text-[13px] text-[#B91C1C]">
              {comprobante.fallo}
            </p>
          )}
        </section>
        )}

        <footer className={`space-y-3 text-center text-[12px] text-[#6B7280] ${dos}`}>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white text-sm font-semibold shadow-sm hover:bg-[#F9FAFB]"
              style={{ color }}
            >
              <Icon name="phone" size={16} />
              ¿Dudas? Escribile al instituto por WhatsApp
            </a>
          )}
          <a href="https://bamardev.com" className="flex items-center justify-center gap-1.5">
            <MarcaBamarDev />
            Este enlace es personal · Powered by BamarDev
          </a>
        </footer>
      </div>
      {comprobante.oculto}
    </div>
  );
}
