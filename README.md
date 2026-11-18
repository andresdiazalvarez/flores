# Flores

Flores guarda recorridos cinematográficos y fotografías de visitas. Puedes encontrarlas por lugar, fecha y nombre de la flor. Los proyectos, las imágenes y las fichas se guardan en la base local `flores-personales` del navegador. El mapa y el buscador geográfico requieren conexión. El buscador envía los términos de búsqueda a Photon.

## Ejecutar en local

Con Node.js 24 y pnpm instalados, abre una terminal en la carpeta de Flores.

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Abre `http://localhost:5173/` o la dirección que indique Vite. Usa el mismo navegador, perfil y dirección para recuperar los datos guardados. En un móvil, «Mi ubicación» requiere un contexto seguro, como el sitio publicado por HTTPS.

## Usar Flores

- En **MAPA**, pulsa dos veces en un espacio vacío para crear una visita. Guarda la fecha y el lugar y selecciona **Preparar recorrido**. También puedes abrir el editor más tarde desde el marcador.
- Carga JPG, PNG o WebP de hasta 25 MB por archivo. Al cargar cuatro fotos en un proyecto nuevo, Flores propone 20 segundos en total y coloca la cuarta en la parte superior izquierda de la tercera. Arrastra las fotos para ordenarlas o usa las flechas. Edita su duración, velocidad, zoom y enfoque. Para encadenar acercamientos, activa **Insertar la siguiente foto dentro de esta** en cada foto que deba contener a la siguiente.
- Reproduce la vista previa y pulsa **Guardar recorrido** para poder editarlo desde el mismo marcador. Al llegar al final, aparece **Añadir foto al final del recorrido**. Ahí puedes guardar y clasificar las fotos de la visita.
- En **FLOR**, filtra por nombre, fecha y lugar. Al abrir un resultado, el botón blanco vuelve al final de su recorrido y luego a la lista.
- **Exportar MP4** descarga el recorrido sin sonido en 1920 × 1080 o 1080 × 1920, a 30 fotogramas por segundo. Usa Edge o Chrome actualizado en un equipo con codificación H.264 disponible.

La exportación incorpora [Mediabunny 1.66.0](https://www.npmjs.com/package/mediabunny/v/1.66.0), distribuido bajo [Mozilla Public License 2.0](https://mozilla.org/MPL/2.0/). Su código fuente está disponible en el [paquete de esa versión](https://registry.npmjs.org/mediabunny/-/mediabunny-1.66.0.tgz).

## Comprobar y compilar

```sh
pnpm run test
pnpm run build --outDir docs
```

La compilación genera rutas relativas para servir la aplicación bajo `/flores/`.

## Publicar en GitHub Pages

1. Crea un repositorio propio llamado `flores` en GitHub.
2. Descomprime la entrega y sube sus archivos, incluida la carpeta `docs`, a la rama `main` del repositorio.
3. En la configuración del repositorio, abre **Pages**. Elige el despliegue desde una rama, selecciona `main` y la carpeta `/docs`, y guarda.
4. Cuando termine el despliegue, abre `https://TU-USUARIO.github.io/flores/`.

GitHub Pages aloja la aplicación. Las fotos que seleccionas durante el uso permanecen en el almacenamiento de ese navegador. La dirección publicada tendrá su propio almacenamiento, separado del de la dirección local.
