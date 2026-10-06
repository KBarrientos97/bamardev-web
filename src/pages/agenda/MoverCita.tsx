import { useEffect, useMemo, useState } from "react";
import { Boton, Campo, ErrorMsg, Input, Modal, Select } from "../../components/ui";
import { apiAgenda, huecosDelConflicto, mensajeDe } from "../../lib/agenda/apiAgenda";
import { fechaNegocio } from "../../lib/agenda/horaAgenda";
import { lineasDePropuesta } from "../../lib/agenda/lineasCita";
import type { Cita, Propuesta } from "../../lib/agenda/tiposAgenda";
import { useApi } from "../../lib/useApi";
import { SelectorHuecos } from "./SelectorHuecos";

/**
 * Mover una cita con formulario: otra fecha, otra hora u otro profesional. Es
 * el camino del celular (no hay arrastre) y el de quien prefiere teclear. Los
 * horarios los propone el backend con las mismas reglas que al crear; si en el
 * medio otro ocupa el elegido, 409 y la lista se recalcula sin perder nada.
 */
export default function MoverCita({
  cita,
  onClose,
  onMovida,
}: {
  cita: Cita;
  onClose: () => void;
  onMovida: (cita: Cita) => void;
}) {
  const recursos = useApi(() => apiAgenda.recursos(), []);
  const [fecha, setFecha] = useState(cita.inicio ? fechaNegocio(cita.inicio) : fechaNegocio());
  const [elegidos, setElegidos] = useState<(number | null)[]>(() => cita.lineas.map((l) => l.recursoId));
  const [huecos, setHuecos] = useState<Propuesta[] | null>(null);
  const [elegida, setElegida] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [conflicto, setConflicto] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const deLaSucursal = useMemo(
    () =>
      (recursos.datos ?? []).filter(
        (r) => r.activo !== false && (r.sucursalIds.length === 0 || r.sucursalIds.includes(cita.sucursalId)),
      ),
    [recursos.datos, cita.sucursalId],
  );
  const nombreRecurso = (id: number) =>
    deLaSucursal.find((r) => r.id === id)?.nombre ?? cita.lineas.find((l) => l.recursoId === id)?.recurso ?? "Profesional";
  const nombreServicio = (id: number) => cita.lineas.find((l) => l.servicioId === id)?.servicio ?? "Servicio";

  const pedido = JSON.stringify({
    fecha,
    sucursalId: cita.sucursalId,
    lineas: cita.lineas.map((l, i) => ({ servicioId: l.servicioId, recursoId: elegidos[i] ?? null })),
  });

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    apiAgenda
      .huecos(JSON.parse(pedido))
      .then((r) => {
        if (!vivo) return;
        setHuecos(r.huecos);
        setElegida(0);
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setHuecos([]);
        setError(mensajeDe(e, "No se pudieron buscar los horarios"));
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [pedido]);

  async function guardar() {
    const p = huecos?.[elegida];
    if (!p) return setError("Elegí un horario de la lista.");
    setError("");
    setEnviando(true);
    try {
      onMovida(await apiAgenda.moverCita(cita.id, { lineas: lineasDePropuesta(p) }));
    } catch (e) {
      const nuevos = huecosDelConflicto(e);
      if (nuevos) {
        setHuecos(nuevos);
        setElegida(0);
        setConflicto("Ese horario se acaba de ocupar. Elegí otro de la lista.");
      } else {
        setError(mensajeDe(e, "No se pudo mover la cita"));
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Mover cita"
      subtitulo={cita.cliente.nombre}
      onClose={onClose}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={enviando || cargando}>
            {enviando ? "Moviendo…" : "Mover"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo label="Fecha">
          <Input type="date" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        </Campo>
        {cita.lineas.map((l, i) => (
          <Campo key={l.id} label={`${l.servicio} con`}>
            <Select
              value={elegidos[i] ?? ""}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                setElegidos((xs) => xs.map((x, j) => (j === i ? v : x)));
              }}
            >
              <option value="">Cualquiera</option>
              {(deLaSucursal.length ? deLaSucursal : [{ id: l.recursoId, nombre: l.recurso }]).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        ))}
        <SelectorHuecos
          huecos={huecos}
          elegida={elegida}
          onElegir={setElegida}
          cargando={cargando}
          nombreServicio={nombreServicio}
          nombreRecurso={nombreRecurso}
        />
        {conflicto && (
          <p role="alert" className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm font-semibold text-warning-text">
            {conflicto}
          </p>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
