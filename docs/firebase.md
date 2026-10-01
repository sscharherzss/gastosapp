# Firebase: Gastos personales

## Crear el proyecto

1. Crea o selecciona un proyecto Firebase y habilita **Firestore Database** en modo producción.
2. La configuración pública de la aplicación web `gastosapp-1d97f` ya está integrada en el cliente. Los valores de `.env.firebase.example` solo permiten reemplazarla en compilaciones futuras.
3. Publica `firestore.rules` desde Firebase CLI o la consola. Estas reglas no exigen autenticación y permiten leer y escribir la colección `gastosapp_profiles`.
4. En GitHub crea los secretos `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` y `FIREBASE_SERVICE_ACCOUNT`.
5. Ejecuta el flujo **Publicar Gastos en Firebase**. Publica la aplicación bajo `/gastos`.

## Dominio

`www.lamayoristapp.com` ya pertenece al sitio de inventario `motora-produccion-74b58`; no debe moverse a este proyecto. En Firebase Hosting conecta `gastos.lamayoristapp.com` como dominio personalizado. Firebase mostrará los registros DNS que debes añadir en el proveedor del dominio. Cuando la verificación termine, la aplicación estará en `https://gastos.lamayoristapp.com/` y también responderá en `/gastos`.

## Datos

La app conserva una copia local y sincroniza el perfil activo con Firestore. Sin Firebase configurado, sigue funcionando solo en el navegador. Al no haber autenticación, cualquier persona que encuentre la URL puede leer o modificar datos; esta configuración es únicamente temporal para el uso personal solicitado.
