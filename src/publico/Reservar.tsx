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
import Captcha from "./Captcha";
import Confirmada from "./Confirmada";
import { siteKeyTurnstile } from "../lib/turnstile";
import {
  Aviso,
  BotonPrincipal,
  Cabecera,
  CargandoPublico,
  FilaResumen,
  IconoVolver,
  Marco,
  NoDisponible,
  Pasos
} from "./piezas";
import { useEscritorio } from "./useEscritorio";
import { cuentaReserva, horaCorta, precioTexto, rutaPublica, ultimaReserva, useNegocioPublico } from "./util";
import SelectorHorario from "./SelectorHorario";

/**
 * P2 a P6 (PLAN-AGENDA-BELLEZA §8.2): servicios → con quién, día y hora, y
 * tus datos → reserva enviada o confirmada. Sin cuenta ni app.
 *
 * Todo vive en una sola ruta: lo elegido está en el estado, y el paso en la
 * URL (`?paso=horario`), así el "Atrás" del celular vuelve a los servicios
 * con la selección en vez de salir de la reserva (B16). Un 409 (el horario
 * se ocupó mientras llenaba los datos) no borra nada: recalcula y avisa.
 *
 * En la computadora el negocio y el resumen de lo elegido van a la izquierda
 * (`Marco` con `lateral`) y el paso a la derecha; el flujo es el mismo.
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
    <Marco
      datos={datos}
      titulo="Elegí la sucursal"
      cabecera={<Cabecera arriba="Reservá tu cita" titulo={datos.negocio.nombre} />}
      lateral={
        <p className="text-sm text-[#4B5563]">
          Elegí dónde te vas a atender. Después elegís el servicio, el día y la hora.
        </p>
      }
      etiquetaLateral="El negocio"
    >
      <div className="flex flex-col gap-3 px-5 py-5 lg:px-8 lg:py-8">
        <h1 className="text-xl font-bold">¿En qué sucursal?</h1>
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2">
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
      </div>
    </Marco>
  );
}

function Asistente({ datos, sucursal, sub }: { datos: NegocioPublico; sucursal: SucursalPublica; sub: string }) {
  const [params, setParams] = useSearchParams();
  const escritorio = useEscritorio();
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
  // Turnstile, sólo si el build trae la site key. `vueltaCaptcha` remonta el
  // widget para pedir otro token: el backend gasta el anterior en cada intento.
  const siteKey = siteKeyTurnstile();
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [vueltaCaptcha, setVueltaCaptcha] = useState(0);
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
  // Precio y duración del profesional elegido (o el rango con "cualquiera"):
  // lo mismo con que se crea la cita y se cobra en el local (QA N2-06).
  const cuenta = cuentaReserva(
    servicios,
    profesional != null ? sucursal.profesionales.find((p) => p.id === profesional) : null,
  );
  const duracion = cuenta.duracion;
  const total = cuenta.precio;
  const desde = cuenta.desde ? "desde " : "";
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
  if (siteKey && !captcha) faltan.push("completá la verificación anti-robots");

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
        ...(siteKey && captcha ? { captcha } : {}),
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
      if (siteKey) {
        // El token ya se gastó (con un 400 CAPTCHA o con cualquier otro
        // error): el próximo intento necesita uno nuevo.
        setCaptcha(null);
        setVueltaCaptcha((v) => v + 1);
      }
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const resumen = servicios.map((s) => s.nombre).join(" + ");
  const cabecera = (
    <Cabecera
      arriba="Reservá tu cita"
      titulo={datos.negocio.nombre}
      abajo={[sucursal.nombre, sucursal.direccion].filter(Boolean).join(" · ")}
    />
  );
  const lateral = (
    <ResumenReserva
      servicios={servicios}
      profesional={
        paso === "servicios"
          ? null
          : (sucursal.profesionales.find((p) => p.id === profesional)?.nombre ?? "Cualquiera")
      }
      inicio={paso === "servicios" ? null : inicio}
      duracion={duracion}
      precio={sucursal.reglas.mostrarPrecios ? total : null}
      desde={desde}
    />
  );

  if (paso === "servicios") {
    return (
      <Marco datos={datos} titulo="Reservar" cabecera={cabecera} lateral={lateral} etiquetaLateral="Tu reserva">
        <Pasos hechos={1} total={2} />
        <div className="flex flex-1 flex-col gap-3.5 px-5 pb-5 pt-2 lg:gap-5 lg:px-8 lg:pb-8 lg:pt-4">
          <div>
            <h1 className="text-xl font-bold">¿Qué te hacés?</h1>
            <p className="text-[13px] text-[#6B7280]">Podés elegir más de uno: se hacen uno después del otro.</p>
          </div>
          {categorias.map(([cat, lista]) => (
            <section key={cat} className="flex flex-col gap-2" aria-label={cat}>
              <h2 className="text-[13px] tracking-[0.06em] text-[#6B7280]">{cat.toUpperCase()}</h2>
              {/* En la computadora, de a dos por fila: una lista de 700 px de
                  ancho con el precio en la otra punta se lee mal. */}
              <div className="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
                {lista.map((s) => {
                  const elegido = elegidos.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-[14px] px-3.5 py-3 ${
                        elegido
                          ? "border-2 border-primary bg-primary-50"
                          : "border border-[#E5E7EB] bg-white lg:hover:bg-[#F9FAFB]"
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
                        <span className="text-[13px] text-[#6B7280]">{duracionTexto(s.duracionDesde ?? s.duracionMin)}</span>
                      </span>
                      {s.precio != null && (
                        <span className="text-sm font-medium">
                          {s.precioDesde != null && s.precioHasta != null && s.precioDesde !== s.precioHasta
                            ? `desde ${precioTexto(s.precioDesde)}`
                            : precioTexto(s.precioDesde ?? s.precio)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <footer className="sticky bottom-0 flex items-center gap-3 border-t border-[#F0F1F4] bg-white px-5 pb-5 pt-3.5 lg:px-8 lg:py-4">
          <div className="flex min-w-0 flex-1 flex-col">
            <strong className="text-[15px]">
              {elegidos.length
                ? `${elegidos.length === 1 ? "1 servicio" : `${elegidos.length} servicios`} · ${desde}${duracionTexto(duracion)}`
                : "Elegí un servicio"}
            </strong>
            <span className="text-[13px] text-[#6B7280]">
              {sucursal.reglas.mostrarPrecios && elegidos.length ? `${desde}${precioTexto(total)} · ` : ""}Se paga en el local
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
    <Marco
      datos={datos}
      titulo="Elegí día y hora"
      cabecera={escritorio ? cabecera : undefined}
      lateral={lateral}
      etiquetaLateral="Tu reserva"
    >
      {/* La pantalla no tenía título: para quien navega por encabezados. */}
      <h1 className="sr-only">Elegí día y hora</h1>
      {escritorio ? (
        // El nombre y el resumen ya están a la izquierda: arriba sólo queda volver.
        <div className="px-8 pt-6">
          <button
            type="button"
            onClick={volverAServicios}
            className="inline-flex h-10 items-center gap-1 rounded-[10px] border border-[#E5E7EB] pl-2 pr-3.5 text-sm text-[#374151] hover:bg-[#F9FAFB]"
          >
            <IconoVolver />
            Volver a los servicios
          </button>
        </div>
      ) : (
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
              {resumen} · {desde}
              {duracionTexto(duracion)}
              {sucursal.reglas.mostrarPrecios ? ` · ${precioTexto(total)}` : ""}
            </span>
          </div>
        </header>
      )}
      <Pasos hechos={2} total={2} />
      <div className="flex flex-1 flex-col gap-[18px] px-5 pb-5 pt-2 lg:gap-6 lg:px-8 lg:pb-8 lg:pt-4">
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

        <section className="flex flex-col gap-3 border-t border-[#F0F1F4] pt-4 lg:pt-6" aria-label="Tus datos">
          <h2 className="text-lg font-bold">Tus datos</h2>
          {/* Nombre y teléfono lado a lado en la computadora. */}
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
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
          </div>
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
          {siteKey && <Captcha key={vueltaCaptcha} siteKey={siteKey} onToken={setCaptcha} />}
          <div ref={errorRef} className="scroll-mb-28">
            <Aviso>{error}</Aviso>
          </div>
        </section>
      </div>
      <footer className="sticky bottom-0 border-t border-[#F0F1F4] bg-white px-5 pb-5 pt-3.5 lg:flex lg:justify-end lg:px-8 lg:py-4">
        <BotonPrincipal onClick={reservar} disabled={enviando} className="lg:w-auto lg:min-w-[320px]">
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

/**
 * Lo elegido hasta ahora, en la columna izquierda de la computadora. En el
 * celular este resumen ya va en la barra de abajo (servicios) o en la
 * cabecera (horario), así que no se repite.
 */
function ResumenReserva({
  servicios,
  profesional,
  inicio,
  duracion,
  precio,
  desde,
}: {
  servicios: SucursalPublica["servicios"];
  /** null mientras se eligen los servicios: se elige en el paso siguiente. */
  profesional: string | null;
  inicio: string | null;
  duracion: number;
  /** null si el negocio no muestra precios online. */
  precio: number | null;
  desde: string;
}) {
  return (
    <section aria-labelledby="titulo-resumen" className="flex flex-col gap-4">
      <h2 id="titulo-resumen" className="text-[13px] tracking-[0.06em] text-[#6B7280]">
        TU RESERVA
      </h2>
      {servicios.length ? (
        <FilaResumen etiqueta={servicios.length === 1 ? "Servicio" : "Servicios"}>
          <ul className="flex flex-col gap-0.5">
            {servicios.map((s) => (
              <li key={s.id} className="font-medium">
                {s.nombre}
              </li>
            ))}
          </ul>
        </FilaResumen>
      ) : (
        <p className="text-sm text-[#6B7280]">Todavía no elegiste ningún servicio.</p>
      )}
      <FilaResumen etiqueta="Con quién">{profesional ?? "Lo elegís en el paso siguiente"}</FilaResumen>
      <FilaResumen etiqueta="Día y hora">
        {inicio ? `${capitalizar(fechaLarga(fechaNegocio(inicio)))} · ${horaCorta(inicio)}` : "Sin elegir todavía"}
      </FilaResumen>
      {servicios.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-[#F0F1F4] pt-4">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-[#4B5563]">Duración</span>
            <strong>
              {desde}
              {duracionTexto(duracion)}
            </strong>
          </div>
          {precio != null && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-[#4B5563]">Total</span>
              <strong className="text-lg">
                {desde}
                {precioTexto(precio)}
              </strong>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-[#6B7280]">Se paga en el local. Sin registrarte ni bajar nada.</p>
    </section>
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
