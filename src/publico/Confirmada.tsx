import { useState } from "react";
import { Link } from "react-router-dom";
import { capitalizar, duracionTexto, fechaLarga, fechaNegocio } from "../lib/agenda/horaAgenda";
import { apiReserva, type CitaPublica, type NegocioPublico } from "./apiReserva";
import { Aviso, BotonPrincipal, Circulo, IconoCalendario, IconoCheck, IconoEnlace, IconoMapa, IconoReloj, Marco } from "./piezas";
import { enlaceMapa, horaCorta, rutaPublica } from "./util";

/**
 * P6 (lienzo ReservaConfirmada): "Reserva enviada" en modo manual o "Reserva
 * confirmada" en automático, con el código, el enlace de gestión (que hay
 * que guardar: es la única forma de volver a la reserva), el .ics, cómo
 * llegar y el teléfono del negocio.
 */
export default function Confirmada({
  datos,
  sub,
  token,
  cita,
}: {
  datos: NegocioPublico;
  sub: string;
  token: string;
  cita: CitaPublica;
}) {
  const [aviso, setAviso] = useState("");
  const manual = cita.estado === "SOLICITADA";
  const enlace = `${window.location.origin}${rutaPublica(sub, `/c/${token}`)}`;
  const mapa = enlaceMapa(datos.negocio.nombre, cita.sucursal.direccion);
  const telefono = cita.sucursal.telefono ?? cita.negocio.telefono;
  const duracion = cita.servicios.reduce((t, s) => t + s.duracionMin, 0);

  async function guardarEnlace() {
    const texto = `Mi reserva en ${datos.negocio.nombre}: ${enlace}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `Reserva en ${datos.negocio.nombre}`, text: texto, url: enlace });
        return;
      }
      await navigator.clipboard.writeText(enlace);
      setAviso("Enlace copiado. Guardalo en tus notas o mandátelo por WhatsApp.");
    } catch {
      setAviso(`Tu enlace: ${enlace}`);
    }
  }

  return (
    <Marco datos={datos} titulo={manual ? "Reserva enviada" : "Reserva confirmada"}>
      <div className="flex flex-1 flex-col gap-[18px] px-5 pb-5 pt-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <Circulo>{manual ? <IconoReloj /> : <IconoCheck size={30} />}</Circulo>
          <h1 className="text-[22px] font-bold">{manual ? "Reserva enviada" : "Reserva confirmada"}</h1>
          <p className="max-w-[300px] text-sm text-[#4B5563]">
            {manual
              ? `${datos.negocio.nombre} la confirma en un rato. Guardá este enlace: ahí vas a ver si la aprobaron.`
              : "Te esperamos. Guardá este enlace: con él podés confirmar, cambiar o cancelar."}
          </p>
        </div>

        <section className="flex flex-col gap-2.5 rounded-2xl border border-[#E5E7EB] p-4">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-[15px]">
              {capitalizar(fechaLarga(fechaNegocio(cita.inicio)))} · {horaCorta(cita.inicio)}
            </strong>
            <span
              className={`shrink-0 rounded-lg px-2 py-[3px] text-[11px] font-bold ${
                manual ? "bg-[#F3F4F6] text-[#374151]" : "bg-primary-50 text-primary-700"
              }`}
            >
              {manual ? "POR CONFIRMAR" : "CONFIRMADA"}
            </span>
          </div>
          {cita.servicios.length > 0 && (
            <span className="text-sm text-[#374151]">
              {cita.servicios.map((s) => s.nombre).join(" + ")} · {duracionTexto(duracion)}
            </span>
          )}
          <span className="text-sm text-[#374151]">
            {cita.profesional
              ? `Con ${cita.profesional.nombre}`
              : manual
                ? "Con quien esté libre (te avisan al confirmar)"
                : "Con quien esté libre"}
          </span>
          <span className="text-sm text-[#374151]">
            {[datos.negocio.nombre, cita.sucursal.nombre, cita.sucursal.direccion].filter(Boolean).join(" · ")}
          </span>
          <span className="text-[13px] text-[#6B7280]">
            Código de reserva:{" "}
            <strong className="tracking-[0.08em] text-[#1F2937]">{cita.codigo}</strong>
          </span>
        </section>

        <div className="flex flex-col gap-2.5">
          <BotonPrincipal onClick={guardarEnlace}>
            <IconoEnlace />
            Guardar mi enlace
          </BotonPrincipal>
          <Aviso tono="info">{aviso}</Aviso>
          <Link
            to={rutaPublica(sub, `/c/${token}`)}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] text-[15px] text-[#374151]"
          >
            Ver mi reserva
          </Link>
          <a
            href={apiReserva.urlIcs(sub, token)}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] text-[15px] text-[#374151]"
          >
            <IconoCalendario />
            Agregar a mi calendario
          </a>
          {mapa && (
            <a
              href={mapa}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] text-[15px] text-[#374151]"
            >
              <IconoMapa />
              Cómo llegar
            </a>
          )}
        </div>

        {telefono && (
          <p className="text-center text-[13px] text-[#6B7280]">
            ¿Dudas? Llamá al negocio:{" "}
            <a href={`tel:${telefono}`} className="underline">
              {telefono}
            </a>
          </p>
        )}
      </div>
    </Marco>
  );
}
