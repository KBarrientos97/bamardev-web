import { useState } from "react";
import { Link } from "react-router-dom";
import { EncabezadoPagina } from "../../components/filtros";
import CampoUbicacion from "../../components/CampoUbicacion";
import { AvisoOk, Badge, Boton, Campo, Cargando, ErrorMsg, Input, useAviso } from "../../components/ui";
import type { Ubicacion } from "../../lib/mapa";
import { apiPagina } from "../../lib/pagina/apiPagina";
import { paleta } from "../../lib/pagina/aspecto";
import { mismoHorario } from "../../lib/pagina/horario";
import type { FichaSucursal, Tramo } from "../../lib/pagina/tipos";
import { tieneFeature } from "../../lib/permisos";
import { termino } from "../../lib/rubro";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import EditorHorario from "../pagina/EditorHorario";

// El editor de horario pide un color: el verde de la app (la ficha no es de
// la página, que tiene el suyo).
const COLOR = paleta("#0C7A55");

const ubicacionDe = (f: FichaSucursal): Ubicacion | null =>
  f.latitud != null && f.longitud != null ? { lat: f.latitud, lng: f.longitud } : null;

/**
 * Configuración › Sucursales: la ficha única de cada sucursal (decisión del
 * dueño, 02-nov). Dirección, teléfono, ubicación en el mapa y horario por
 * día, en un solo lugar y para todos los rubros: antes el horario y el mapa
 * se cargaban en Mi página, y belleza no llegaba a Inventario › Almacenes.
 * Mi página ahora sólo decide si se muestran.
 *
 * Es el dato de la sucursal: cada una se guarda con su botón y la página lo
 * ve enseguida (no pasa por el borrador de Mi página).
 */
export default function FichasSucursales() {
  const { rubro, vocabulario, negocio } = useAuth();
  const carga = useApi(() => apiPagina.fichasSucursal(), []);
  const [aviso, setAviso] = useAviso();
  const palabra = termino(rubro, "sucursales", vocabulario);
  const conPagina = tieneFeature(negocio?.features, "pagina_publica");

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo={`Datos de las ${palabra}`}
        subtitulo="Dirección, ubicación en el mapa y horario de atención de cada una."
      />
      <AvisoOk>{aviso}</AvisoOk>
      {carga.error ? (
        <ErrorMsg onReintentar={carga.recargar}>{carga.error}</ErrorMsg>
      ) : !carga.datos ? (
        <Cargando />
      ) : carga.datos.length === 0 ? (
        <p className="card p-4 text-sm text-texto-3">Todavía no hay {palabra} activas.</p>
      ) : (
        carga.datos.map((f) => (
          <TarjetaFicha
            key={f.id}
            ficha={f}
            onGuardada={(nueva) => {
              carga.setDatos((carga.datos ?? []).map((x) => (x.id === nueva.id ? nueva : x)));
              setAviso(`${nueva.nombre}: guardada`);
            }}
          />
        ))
      )}
      {conPagina && (
        <p className="text-[13px] text-texto-3">
          Qué se muestra en tu página (el horario, el mapa) se elige en{" "}
          <Link to="/mi-pagina" className="font-semibold text-primary-700">
            Mi página
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function TarjetaFicha({ ficha, onGuardada }: { ficha: FichaSucursal; onGuardada: (f: FichaSucursal) => void }) {
  const [direccion, setDireccion] = useState(ficha.direccion ?? "");
  const [telefono, setTelefono] = useState(ficha.telefono ?? "");
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(ubicacionDe(ficha));
  const [horario, setHorario] = useState<Tramo[] | null>(ficha.horarioSemanal);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const antes = ubicacionDe(ficha);
  // Sólo lo que cambió: un PATCH que no menciona algo no lo toca.
  const cambios: Parameters<typeof apiPagina.guardarFichaSucursal>[1] = {};
  if (direccion.trim() !== (ficha.direccion ?? "")) cambios.direccion = direccion.trim() || null;
  if (telefono.trim() !== (ficha.telefono ?? "")) cambios.telefono = telefono.trim() || null;
  if (ubicacion?.lat !== antes?.lat || ubicacion?.lng !== antes?.lng) {
    cambios.latitud = ubicacion?.lat ?? null;
    cambios.longitud = ubicacion?.lng ?? null;
  }
  if (!mismoHorario(horario, ficha.horarioSemanal)) cambios.horarioSemanal = horario;
  const sucio = Object.keys(cambios).length > 0;

  const guardar = async () => {
    setGuardando(true);
    setError("");
    try {
      onGuardada(await apiPagina.guardarFichaSucursal(ficha.id, cambios));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="card space-y-4 p-4 sm:p-5" aria-label={`Ficha de ${ficha.nombre}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-texto">{ficha.nombre}</h2>
        {ficha.esPrincipal && <Badge tono="verde">Principal</Badge>}
      </div>
      <ErrorMsg>{error}</ErrorMsg>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Dirección" hint="Cómo la diría un cliente: calle, número, zona.">
          <Input
            aria-label={`Dirección de ${ficha.nombre}`}
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            maxLength={200}
          />
        </Campo>
        <Campo label="Teléfono" hint="Opcional.">
          <Input
            aria-label={`Teléfono de ${ficha.nombre}`}
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            inputMode="tel"
            maxLength={40}
          />
        </Campo>
      </div>
      <CampoUbicacion
        nombre={ficha.nombre}
        valor={ubicacion}
        onCambio={setUbicacion}
        hint="El pin en el mapa de tu página y el destino de «Cómo llegar»."
      />
      <div>
        <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">Horario de atención</span>
        <EditorHorario nombre={ficha.nombre} valor={horario} c={COLOR} onCambio={setHorario} />
      </div>
      <div className="flex justify-end">
        <Boton disabled={!sucio || guardando} onClick={() => void guardar()}>
          {guardando ? "Guardando…" : "Guardar"}
        </Boton>
      </div>
    </section>
  );
}
