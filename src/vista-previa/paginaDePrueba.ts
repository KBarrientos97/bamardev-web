/**
 * Una página pública de ejemplo (la forma de `GET /publico/pagina/:sub`), para
 * los tests de la vista previa y del HTML para buscadores. Sólo la importan
 * los tests: las Functions no la empaquetan.
 */
export function paginaDePrueba(host = "https://link-qa.bamardev.com", cambios: Record<string, unknown> = {}) {
  return {
    subdominio: "bellavista",
    nombre: "Salón Bella Vista",
    rubro: "Peluquería",
    rubroClave: "PELUQUERIA",
    iniciales: "BV",
    descripcion: "Cortes, color y peinados en el centro de Cochabamba desde 2015.",
    color: { clave: "ROSA", hex: "#DA2372" },
    estilo: "CLASICO",
    logoUrl: "/publico/pagina/bellavista/imagen/LOGO?v=1",
    portadaUrl: "/publico/pagina/bellavista/imagen/PORTADA?v=9",
    reservar: true,
    redes: [{ id: 1, tipo: "INSTAGRAM", etiqueta: "Instagram", url: "https://instagram.com/bellavista", icono: null }],
    botones: [{ id: 2, tipo: "WHATSAPP", etiqueta: "WhatsApp", url: "https://wa.me/59170000000", icono: null }],
    sucursales: [
      {
        nombre: "Centro",
        reservaSlug: "centro",
        direccion: "Av. Heroínas 123, Cochabamba",
        telefono: "4 4123456",
        horario: null,
        horarioSemanal: [
          { dia: 1, desde: "09:00", hasta: "13:00" },
          { dia: 1, desde: "15:00", hasta: "21:00" },
          { dia: 6, desde: "09:00", hasta: "24:00" },
        ],
        mapaUrl: null,
        ubicacion: { lat: -17.3935123, lng: -66.1570456 },
        whatsappUrl: null,
      },
      {
        nombre: "Norte",
        reservaSlug: null,
        direccion: "Calle Beni 45",
        telefono: null,
        horario: "Lun a Sáb 10 a 20",
        horarioSemanal: null,
        mapaUrl: null,
        ubicacion: null,
        whatsappUrl: null,
      },
    ],
    catalogo: {
      titulo: "Servicios",
      items: [
        { id: 1, titulo: "Corte de dama", descripcion: "Con lavado", precio: 60, precioDesde: false, fotoUrl: null },
        { id: 2, titulo: "Color", descripcion: null, precio: 150.5, precioDesde: true, fotoUrl: "/publico/pagina/bellavista/catalogo/2/foto?v=3" },
        { id: 3, titulo: "Peinado", descripcion: null, precio: null, precioDesde: false, fotoUrl: null },
      ],
    },
    og: {
      titulo: "Salón Bella Vista",
      descripcion: "Peluquería · Reservas",
      imagen: "/publico/pagina/bellavista/imagen/PORTADA?v=9",
      url: `${host}/bellavista`,
    },
    ...cambios,
  };
}
