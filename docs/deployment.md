# Despliegue de la PWA personal

## GitHub Pages

1. Sube estos cambios a la rama `main` del repositorio.
2. En GitHub abre **Settings → Pages** y selecciona **GitHub Actions** como origen.
3. El flujo `Publicar PWA` compila la aplicación y publica `dist/` automáticamente.
4. Abre `https://USUARIO.github.io/REPOSITORIO/` en el teléfono e instálala desde el navegador.

No hay variables de entorno, API, credenciales ni servicios Cloudflare para el uso local. Los datos se mantienen en el almacenamiento del navegador del dispositivo. Exporta el CSV mensual antes de borrar los datos del navegador.

## Desarrollo local

```sh
npm install
npm run dev
npm run build
```

La carpeta `services/rust-api` es opcional y está reservada para una futura sincronización entre dispositivos. No se despliega ni se ejecuta para esta versión personal.
