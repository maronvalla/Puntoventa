# Actualización multi-negocio

1. Crear un respaldo de PostgreSQL.
2. Configurar `DATABASE_URL`.
3. Ejecutar `npm run db:migrate:deploy` desde `backend`.
4. Ejecutar `npm run db:seed` solamente si todavía no existe el dueño.
5. Desplegar el backend y luego el frontend.

La migración crea **Negocio principal** y asigna allí los usuarios, productos, stock, ventas y compras existentes. El administrador anterior pasa a ser el dueño global.
