# Migración de Railway a Supabase

La base de datos ya vive en el proyecto Supabase `Pos Pagofa`. La migración
reemplaza gradualmente el backend Express de Railway por la Edge Function `api`,
sin cambiar inicialmente el contrato HTTP usado por el frontend.

## Estado

- Desplegado en Supabase: autenticación, negocios, catálogo, productos, ajustes
  de stock, ventas, compras, usuarios, reportes y portal de pelucheras.
- URL de la API:
  `https://yhsuecqviskttzrvoxjv.supabase.co/functions/v1/api`.
- Migraciones de seguridad e inventario, ventas, compras y pelucheras aplicadas
  en producción.
- Frontend publicado en `https://pos-pagofa.vercel.app`, con
  `VITE_API_BASE_URL` configurada directamente contra Supabase.
- Validado en producción con un usuario real: autenticación, persistencia tras
  recargar, cuatro negocios y navegación por inventario, caja, compras, ventas,
  empleados, reportes y pelucheras.
- Railway ya no forma parte del flujo publicado y puede conservarse apagado o
  eliminarse cuando ya no se necesite como rollback temporal.

## Secretos de la Edge Function

Configurar estos valores en Supabase antes del primer despliegue:

```powershell
npx supabase secrets set `
  LEGACY_JWT_SECRET="el-mismo-JWT_SECRET-que-usa-Railway" `
  JWT_EXPIRES_IN="7d" `
  FRONTEND_URLS="https://URL-REAL-DEL-FRONTEND"
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son provistos automáticamente a la
función desplegada. La clave `service_role` nunca debe incorporarse al frontend.

## Desarrollo local

Supabase local requiere Docker:

```powershell
npx supabase start
npx supabase functions serve api --env-file supabase/.env.local
```

El archivo local, que no se versiona, debe contener:

```dotenv
LEGACY_JWT_SECRET=...
JWT_EXPIRES_IN=7d
FRONTEND_URLS=http://localhost:5173
```

Después configurar el frontend con el valor documentado en
`frontend/.env.example`.

## Seguridad

La primera migración habilitó RLS y revocó el acceso de `anon` y `authenticated`
a las 17 tablas actuales. Esto corrige la exposición señalada por Advisor sin
interrumpir la conexión privilegiada de Prisma/Railway. Las políticas de acceso
por negocio se agregarán cuando migremos de los JWT actuales a Supabase Auth.

El corte se completó el 5 de agosto de 2026. Antes de cada despliegue futuro,
ejecutar las pruebas del frontend y comprobar `/functions/v1/api/health`.
