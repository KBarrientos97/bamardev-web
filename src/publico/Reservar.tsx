import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { capitalizar, duracionTexto, fechaLarga, fechaNegocio } from "../lib/agenda/horaAgenda";
import {
  apiReserva,
  huecosDelConflicto,
  type CitaPublica,
  type NegocioPublico,
  type SucursalPublica,
} from "./apiReserva";
import Confirmada from "./Confirmada";
import { Aviso, BotonPrincipal, Cabecera, CargandoPublico, IconoVolver, Marco, NoDisponible, Pasos } from "./piezas";
import { horaCorta, precioTexto, rutaPublica, ultimaReserva, useNegocioPublico } from "./util";
import SelectorHorario from "./SelectorHorario";

/**
 * P2 a P6 (PLAN-AGENDA-BELLEZA §8.2): servicios → con quién, día y hora, y
 * tus datos → reserva enviada o confirmada. Sin cuenta ni app.
 *
 * Todo vive en una sola ruta: lo elegido está en el estado, y el paso en la
 * URL (`?paso=horario`), así el "Atrás" del celular vuelve a los servicios
 * con la selección en vez de salir de la reserva (B16). Un 409 (el horario
 * se ocupó mientras llenaba los datos) no borra nada: recalcula y avisa.
 */
export default function Reservar() {
  const { sub, datos, cargando, noDisponible, error } = useNegocioPublico();
  const { sucursal: slugPedido } = useParams();

  if (cargando) return <CargandoPublico />;
  if (!datos) {
    return (
      <Marco datos={null} titulo="Reservar">
        {noDisponible ? <NoDisponible /> : <Aviso>{error}</Aviso>}
      </Marco>
    );
  }
  const sucursal = slugPedido
    ? datos.sucursales.find((s) => s.slug === slugPedido)
    : datos.sucursales.length === 1
      ? datos.sucursales[0]
      : undefined;
  if (slugPedido && !sucursal) {
    return (
      <Marco datos={datos} titulo="Reservar">
        <NoDisponible nombre={datos.negocio.nombre} telefono={datos.negocio.telefono} />
      </Marco>
    );
  }
  if (!sucursal) return <ElegirSucursal datos={datos} sub={sub} />;
  return <Asistente key={sucursal.slug} datos={datos} sucursal={sucursal} sub={sub} />;
}

/** Con varias sucursales que publican, primero se elige dónde (P1). */
function ElegirSucursal({ datos, sub }: { datos: NegocioPublico; sub: string }) {
  return (
    <Marco datos={datos} titulo="Elegí la sucursal">
      <Cabecera arriba="Reservá tu cita" titulo={datos.negocio.nombre} />
      <div className="flex flex-col gap-3 px-5 py-5">
        <h1 className="text-xl font-bold">¿En qué sucursal?</h1>
        {datos.sucursales.map((s) => (
          <Link
            key={s.slug}
            to={rutaPublica(sub, `/reservar/${s.slug}`)}
            className="flex min-h-16 flex-col justify-center gap-0.5 rounded-[14px] border border-[#E5E7EB] px-4 py-3 hover:bg-[#F9FAFB]"
          >
            <strong className="text-[15px]">{s.nombre}</strong>
            {s.direccion && <span className="text-[13px] text-[#6B7280]">{s.direccion}</span>}
          </Link>
        ))}
      </div>
    </Marco>
  );
}

function Asistente({ datos, sucursal, sub }: { datos: NegocioPublico; sucursal: SucursalPublica; sub: string }) {
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [elegidos, setElegidos] = useState<number[]>([]);
  const [profesional, setProfesional] = useState<number | null>(null);
  const [inicio, setInicio] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [nota, setNota] = useState("");
  const [aceptaCancelacion, setAceptaCancelacion] = useState(false);
  const [aceptaPrivacidad, setAceptaPrivacidad] = useState(false);
  const [trampa, setTrampa] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [hecha, setHecha] = useState<{ token: string; cita: CitaPublica } | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // Sin servicios elegidos (recargó estando en el horario) se vuelve a P2.
  const paso = params.get("paso") === "horario" && elegidos.length ? "horario" : "servicios";

  // El error del pie queda debajo de la barra fija: se lo lleva a la vista
  // para que no parezca que el botón no hace nada (B17).
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [error]);

  const irAlHorario = () => {
    setParams({ paso: "horario" }, { state: { desdeServicios: true } });
    window.scrollTo?.(0, 0);
  };
  const volverAServicios = () => {
    // Si llegó desde P2, es el mismo "Atrás" del celular; si no, se reemplaza.
    if ((ubicacion.state as { desdeServicios?: boolean } | null)?.desdeServicios) navegar(-1);
    else setParams({}, { replace: true });
  };

  const servicios = useMemo(
    () => sucursal.servicios.filter((s) => elegidos.includes(s.id)),
    [sucursal.servicios, elegidos],
  );
  const duracion = servicios.reduce((t, s) => t + s.duracionMin, 0);
  const total = servicios.reduce((t, s) => t + (s.precio ?? 0), 0);
  // P3: sólo los publicados que hacen TODOS los servicios elegidos.
  const quienes = sucursal.profesionales.filter((p) => elegidos.every((id) => p.servicioIds.includes(id)));
  const categorias = agrupar(sucursal);
  const ventana = sucursal.reglas.ventanaCancelacionHoras;

  if (hecha) {
    return (
      <Confirmada
        datos={datos}
        sub={sub}
        token={hecha.token}
        cita={hecha.cita}
      />
    );
  }

  const alternar = (id: number) => {
    setElegidos((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
    setInicio(null);
    if (profesional != null && !sucursal.profesionales.find((p) => p.id === profesional)?.servicioIds.includes(id)) {
      setProfesional(null);
    }
  };

  const faltan: string[] = [];
  if (!inicio) faltan.push("elegí un horario");
  if (nombre.trim().length < 2) faltan.push("escribí tu nombre");
  if (telefono.replace(/\D/g, "").length < 7) faltan.push("escribí tu teléfono");
  if (!aceptaCancelacion || !aceptaPrivacidad) faltan.push("marcá las dos casillas");

  async function reservar() {
    if (!inicio || faltan.length) {
      setError(`Para reservar, ${faltan.join(", ")}.`);
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const r = await apiReserva.reservar(sub, {
        sucursal: sucursal.slug,
        servicioIds: elegidos,
        profesionalId: profesional,
        inicio,
        nombre: nombre.trim(),
        telefono: telefono.trim(),
        nota: nota.trim() || undefined,
        aceptaPrivacidad,
        privacidadVersion: datos.privacidadVersion,
        sitioWeb: trampa || undefined,
      });
      ultimaReserva.guardar(sub, r.token);
      setHecha(r);
      window.scrollTo?.(0, 0);
    } catch (e) {
      const huecos = huecosDelConflicto(e);
      if (huecos) {
        // Otro lo tomó mientras tanto: se recalculan las horas y se avisa,
        // sin perder nombre, teléfono ni servicios.
        setInicio(null);
        setVersion((v) => v + 1);
      }
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const resumen = servicios.map((s) => s.nombre).join(" + ");

  if (paso === "servicios") {
    return (
      <Marco datos={datos} titulo="Reservar">
        <Cabecera
          arriba="Reservá tu cita"
          titulo={datos.negocio.nombre}
          abajo={[sucursal.nombre, sucursal.direccion].filter(Boolean).join(" · ")}
        />
        <Pasos hechos={1} total={2} />
        <div className="flex flex-1 flex-col gap-3.5 px-5 pb-5 pt-2">
          <div>
            <h1 className="text-xl font-bold">¿Qué te hacés?</h1>
            <p className="text-[13px] text-[#6B7280]">Podés elegir más de uno: se hacen uno después del otro.</p>
          </div>
          {categorias.map(([cat, lista]) => (
            <section key={cat} className="flex flex-col gap-2" aria-label={cat}>
              <h2 className="text-[13px] tracking-[0.06em] text-[#6B7280]">{cat.toUpperCase()}</h2>
              {lista.map((s) => {
                const elegido = elegidos.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-[14px] px-3.5 py-3 ${
                      elegido ? "border-2 border-primary bg-primary-50" : "border border-[#E5E7EB] bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={elegido}
                      onChange={() => alternar(s.id)}
                      className="h-5 w-5 shrink-0 accent-[var(--color-primary-boton)]"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <strong className="text-[15px]">{s.nombre}</strong>
                      <span className="text-[13px] text-[#6B7280]">{duracionTexto(s.duracionMin)}</span>
                    </span>
                    {s.precio != null && <span className="text-sm font-medium">{precioTexto(s.precio)}</span>}
                  </label>
                );
              })}
            </section>
          ))}
        </div>
        <footer className="sticky bottom-0 flex items-center gap-3 border-t border-[#F0F1F4] bg-white px-5 pb-5 pt-3.5">
          <div className="flex min-w-0 flex-1 flex-col">
            <strong className="text-[15px]">
              {elegidos.length
                ? `${elegidos.length === 1 ? "1 servicio" : `${elegidos.length} servicios`} · ${duracionTexto(duracion)}`
                : "Elegí un servicio"}
            </strong>
            <span className="text-[13px] text-[#6B7280]">
              {sucursal.reglas.mostrarPrecios && elegidos.length ? `${precioTexto(total)} · ` : ""}Se paga en el local
            </span>
          </div>
          <BotonPrincipal
            className="!w-auto"
            disabled={!elegidos.length}
            onClick={irAlHorario}
          >
            Siguiente
          </BotonPrincipal>
        </footer>
      </Marco>
    );
  }

  return (
    <Marco datos={datos} titulo="Elegí día y hora">
      <header className="flex items-center gap-2 px-3 pb-1 pt-3">
        <button
          type="button"
          aria-label="Volver a los servicios"
          onClick={volverAServicios}
          className="flex h-11 w-11 items-center justify-center rounded-[10px] text-[#374151]"
        >
          <IconoVolver />
        </button>
        <div className="flex min-w-0 flex-col">
          <strong className="text-[15px]">{datos.negocio.nombre}</strong>
          <span className="truncate text-xs text-[#6B7280]">
            {resumen} · {duracionTexto(duracion)}
          </span>
        </div>
      </header>
      <Pasos hechos={2} total={2} />
      <div className="flex flex-1 flex-col gap-[18px] px-5 pb-5 pt-2">
        <SelectorHorario
          sub={sub}
          sucursal={sucursal.slug}
          servicioIds={elegidos}
          profesionales={quienes}
          profesional={profesional}
          onProfesional={(id) => {
            setProfesional(id);
            setInicio(null);
          }}
          inicio={inicio}
          onInicio={setInicio}
          primeraFecha={sucursal.reglas.primeraFecha}
          ultimaFecha={sucursal.reglas.ultimaFecha}
          version={version}
        />

        <section className="flex flex-col gap-3 border-t border-[#F0F1F4] pt-4" aria-label="Tus datos">
          <h2 className="text-lg font-bold">Tus datos</h2>
          <CampoTexto etiqueta="Nombre" valor={nombre} onCambio={setNombre} autoComplete="name" maxLength={80} />
          <CampoTexto
            etiqueta="Teléfono"
            valor={telefono}
            onCambio={setTelefono}
            autoComplete="tel"
            inputMode="tel"
            tipo="tel"
            placeholder="7 000 0000"
            maxLength={30}
          />
          <label className="flex flex-col gap-1.5 text-[13px] text-[#374151]">
            Nota para el negocio (opcional)
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={300}
              rows={2}
              className="rounded-xl border border-[#E5E7EB] px-3.5 py-2.5 text-[15px] outline-none focus:border-primary"
            />
            <span className="text-xs text-[#6B7280]">
              No escribas datos de salud (alergias, tratamientos): contalos en el local.
            </span>
          </label>

          {/* Campo trampa: invisible y fuera del Tab. Una persona no lo ve; un
              bot que llena todo, sí. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
            <label>
              Sitio web
              <input
                type="text"
                name="sitioWeb"
                tabIndex={-1}
                autoComplete="off"
                value={trampa}
                onChange={(e) => setTrampa(e.target.value)}
              />
            </label>
          </div>

          <Casilla checked={aceptaCancelacion} onChange={setAceptaCancelacion}>
            {ventana > 0
              ? `Si no puedo ir, cancelo con el enlace hasta ${ventana} horas antes.`
              : "Si no puedo ir, cancelo con el enlace antes de la hora."}
          </Casilla>
          <Casilla checked={aceptaPrivacidad} onChange={setAceptaPrivacidad}>
            Acepto la{" "}
            <Link to={rutaPublica(sub, "/privacidad")} target="_blank" className="underline">
              política de privacidad
            </Link>{" "}
            de {datos.negocio.nombre}: usan mi nombre y teléfono sólo para gestionar mis citas.
          </Casilla>
          <div ref={errorRef} className="scroll-mb-28">
            <Aviso>{error}</Aviso>
          </div>
        </section>
      </div>
      <footer className="sticky bottom-0 border-t border-[#F0F1F4] bg-white px-5 pb-5 pt-3.5">
        <BotonPrincipal onClick={reservar} disabled={enviando}>
          {enviando
            ? "Reservando…"
            : inicio
              ? `Reservar ${capitalizar(fechaLarga(fechaNegocio(inicio)).split(" ").slice(0, 2).join(" "))} · ${horaCorta(inicio)}`
              : "Elegí un horario"}
        </BotonPrincipal>
      </footer>
    </Marco>
  );
}

function CampoTexto({
  etiqueta,
  valor,
  onCambio,
  tipo = "text",
  ...resto
}: {
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  tipo?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] text-[#374151]">
      {etiqueta}
      <input
        {...resto}
        type={tipo}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        className="h-12 rounded-xl border border-[#E5E7EB] px-3.5 text-[15px] outline-none focus:border-primary"
      />
    </label>
  );
}

function Casilla({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-[#374151]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary-boton)]"
      />
      <span>{children}</span>
    </label>
  );
}

/** Servicios por categoría, en el orden en que aparecen. */
function agrupar(s: SucursalPublica): [string, SucursalPublica["servicios"]][] {
  const mapa = new Map<string, SucursalPublica["servicios"]>();
  for (const sv of s.servicios) {
    const cat = sv.categoria ?? "Servicios";
    mapa.set(cat, [...(mapa.get(cat) ?? []), sv]);
  }
  return [...mapa.entries()];
}
