import { useState } from "react";
import { Link } from "react-router-dom";
import { capitalizar, duracionTexto, fechaLarga, fechaNegocio } from "../lib/agenda/horaAgenda";
import { apiReserva, type CitaPublica, type NegocioPublico } from "./apiReserva";
import {
  Aviso,
  BotonPrincipal,
  Cabecera,
  Circulo,
  IconoCalendario,
  IconoCheck,
  IconoEnlace,
  IconoMapa,
  IconoReloj,
  Marco
} from "./piezas";
import { useEscritorio } from "./useEscritorio";
import { enlaceMapa, horaCorta, rutaPublica } from "./util";

/**
 * P6 (lienzo ReservaConfirmada): "Reserva enviada" en modo manual o "Reserva
 * confirmada" en automático, con el código, el enlace de gestión (que hay
 * que guardar: es la única forma de volver a la reserva), el .ics, cómo
 * llegar y el teléfono del negocio.
 *
 * En la computadora la tarjeta de la cita pasa a la columna izquierda, donde
 * venía el resumen de la reserva: lo elegido queda en el mismo lugar, ahora
 * con su código.
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
  const escritorio = useEscritorio();
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

  const detalle = (
    <section
      aria-label="Tu cita"
      className={`flex flex-col gap-2.5 ${escritorio ? "" : "rounded-2xl border border-[#E5E7EB] p-4"}`}
    >
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
            ? // No hay mensajes salientes (§9): nadie le va a avisar, lo ve en su enlace (B18).
              "Con quien esté libre (lo vas a ver en tu enlace cuando la confirmen)"
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
  );

  return (
    <Marco
      datos={datos}
      titulo={manual ? "Reserva enviada" : "Reserva confirmada"}
      cabecera={
        escritorio ? (
          <Cabecera arriba="Tu reserva en" titulo={datos.negocio.nombre} abajo={cita.sucursal.nombre} />
        ) : undefined
      }
      lateral={escritorio ? detalle : undefined}
      etiquetaLateral="Tu reserva"
    >
      <div className="flex flex-1 flex-col gap-[18px] px-5 pb-5 pt-10 lg:gap-6 lg:px-10 lg:pb-10 lg:pt-14">
        <div className="flex flex-col items-center gap-3 text-center">
          <Circulo>{manual ? <IconoReloj /> : <IconoCheck size={30} />}</Circulo>
          <h1 className="text-[22px] font-bold lg:text-[26px]">{manual ? "Reserva enviada" : "Reserva confirmada"}</h1>
          <p className="max-w-[300px] text-sm text-[#4B5563] lg:max-w-md lg:text-[15px]">
            {manual
              ? `${datos.negocio.nombre} la confirma en un rato. Guardá este enlace: ahí vas a ver si la aprobaron.`
              : "Te esperamos. Guardá este enlace: con él podés confirmar, cambiar o cancelar."}
          </p>
        </div>

        {!escritorio && detalle}

        {/* Botones de 700 px de ancho parecen barras: en la computadora, al centro. */}
        <div className="flex flex-col gap-2.5 lg:mx-auto lg:w-full lg:max-w-md">
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
