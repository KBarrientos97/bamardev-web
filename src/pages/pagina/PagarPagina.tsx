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
import { MarcaBamarDev } from "./VistaPagina";

const bs = (n: number) => `Bs ${n.toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/** "591…" listo para wa.me, o null. */
function waDe(telefono: string | null): string | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (d.length < 7) return null;
  return `https://wa.me/${d.length === 8 ? `591${d}` : d}`;
}

/**
 * P6 · Pagar (ronda 2, D10): el enlace personal que la recepción manda por
 * WhatsApp (`/p/<sub>/pagar/<token>`). El estudiante ve lo próximo que tiene
 * que pagar, su estado de cuenta y cómo pagar: el QR fijo del instituto si lo
 * tiene (escanea, paga y muestra el comprobante) o "pagá en el instituto".
 * El QR del banco por monto exacto, que se acredita solo, llega con BISA.
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
  const [copiado, setCopiado] = useState(false);

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
  }, [sub, token]);

  useEffect(() => {
    if (d) document.title = `Estado de cuenta · ${d.instituto.nombre}`;
  }, [d]);

  if (error) return <NoDisponible mensaje={error} />;
  if (!d) return <div style={{ minHeight: "100dvh", background: "#F6F7F9" }} aria-busy="true" />;

  const color = pagina ? paleta(pagina.color.hex).oscuro : "#111827";
  const logo = urlDeImagen(d.instituto.logoUrl);
  const wa = waDe(d.instituto.telefono);
  // El QR fijo llega como data URL (cambio #25); una ruta del API, por las dudas.
  const qr = d.qr ? (/^(data:|https?:)/.test(d.qr.imagenUrl) ? d.qr.imagenUrl : urlDeImagen(d.qr.imagenUrl)) : null;
  const p = d.proxima;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
    } catch {
      /* sin portapapeles, el enlace queda en la barra del navegador */
    }
  }

  return (
    <div style={{ minHeight: "100dvh", background: "#F6F7F9", fontFamily: "Roboto, system-ui, sans-serif" }}>
      <div className="mx-auto w-full max-w-[480px] space-y-4 px-4 py-6">
        <header className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt="" className="h-9 w-9 rounded-xl object-cover" />
          ) : (
            <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: color }}>
              {d.instituto.nombre.charAt(0)}
            </span>
          )}
          <span className="text-[15px] font-bold text-[#111827]">{d.instituto.nombre}</span>
        </header>

        <section aria-labelledby="t-hola" className="space-y-1 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
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
          ) : (
            <p className="mt-3 flex items-center gap-2 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-4 text-sm font-semibold text-[#047857]">
              <Icon name="checkCirculo" size={18} />
              Estás al día: no debés nada.
            </p>
          )}
        </section>

        {p && (
          <section aria-label="Cómo pagar" className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
            {qr ? (
              <>
                <img src={qr} alt={`QR de ${d.instituto.nombre} para pagar`} className="mx-auto w-full max-w-[240px] rounded-xl border border-[#E5E7EB]" />
                <p className="text-center text-sm font-semibold text-[#111827]">Escaneá el QR con la app de tu banco</p>
                <p className="text-center text-[13px] text-[#4B5563]">
                  Pagá {bs(p.saldo)} (o una parte: lo que falte queda de saldo) y mandá el comprobante al instituto para que lo registren.
                </p>
                <a
                  href={qr}
                  download
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl py-2.5 text-center text-sm font-semibold text-white"
                  style={{ background: color, boxShadow: "0 2px 6px rgba(15, 23, 42, 0.18)" }}
                >
                  <Icon name="download" size={16} />
                  Descargar el QR
                </a>
                <p className="text-center text-[12px] text-[#6B7280]">Si pagás desde este mismo celular, descargalo y subilo en tu app del banco.</p>
              </>
            ) : (
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F3F4F6] text-[#374151]"
                >
                  <Icon name="home" size={18} />
                </span>
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold text-[#111827]">Pagá en el instituto</p>
                  <p className="text-[13px] text-[#4B5563]">En la sede {d.grupo.sede}, en efectivo o con QR. Llevá tu carnet.</p>
                </div>
              </div>
            )}
          </section>
        )}

        <section aria-labelledby="t-cuenta" className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
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
                  <span className={`shrink-0 text-sm tabular-nums ${urgente ? "font-semibold text-[#B91C1C]" : "text-[#374151]"}`}>{bs(c.monto)}</span>
                </li>
              );
            })}
          </ul>
          <p className="flex justify-between border-t border-[#E5E7EB] bg-[#F9FAFB] px-5 py-3.5 text-sm font-bold text-[#111827]">
            <span>Saldo del curso</span>
            <span className="tabular-nums">{bs(d.saldoTotal)}</span>
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-5 text-center shadow-sm">
          <p className="text-[13px] text-[#4B5563]">Guardá este enlace: siempre muestra tu estado de cuenta.</p>
          <button
            type="button"
            onClick={() => void copiar()}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border bg-white text-sm font-semibold hover:bg-[#F9FAFB]"
            style={{ color, borderColor: color }}
          >
            <Icon name={copiado ? "check" : "compartir"} size={16} />
            {copiado ? "Enlace copiado" : "Copiar enlace"}
          </button>
        </section>

        <footer className="space-y-3 text-center text-[12px] text-[#6B7280]">
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
    </div>
  );
}
