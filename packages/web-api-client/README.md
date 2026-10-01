# Cliente web de Mis Finanzas

El cliente usa la cookie de Cloudflare Access con `credentials: 'include'`. La PWA lo activa al definir `VITE_GASTOS_API_URL`; sin esa variable funciona localmente y sin conexión.

```js
import { createMisFinanzasApi } from './index.js';
const api = createMisFinanzasApi('https://api.example.com');
await api.invoke('agregar_gasto', { descripcion: 'Mercado', monto: 85000, categoria: 'Alimentación' });
```
