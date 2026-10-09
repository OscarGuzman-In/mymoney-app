# mymoney-app

Plataforma inteligente de gestión y educación financiera personal.

Aplicación full-stack:

- **Backend**: NestJS 11 + Prisma 7 + PostgreSQL (`backend/`)
- **Frontend**: Angular 22 (zoneless, standalone, signals) (`frontend/`)

## Requisitos

- Node.js 22+
- pnpm 11+
- PostgreSQL en `localhost:5432`

En Windows/PowerShell usa `pnpm.cmd` en lugar de `pnpm`.

## Puesta en marcha

### 1. Base de datos

```powershell
# Crea la base de datos (ej. mymoney_bd) y configura backend\.env a partir de .env.example
cd backend
pnpm.cmd exec prisma migrate deploy   # aplica migraciones
pnpm.cmd run prisma:generate
pnpm.cmd run prisma:seed              # monedas iniciales (idempotente)
```

### 2. Backend

```powershell
cd backend
pnpm.cmd run start:dev    # http://localhost:3000/api  (Swagger en /api/docs)
```

### 3. Frontend

```powershell
cd frontend
pnpm.cmd start            # http://localhost:4200
```

`frontend/src/environments/environment.ts` apunta a `http://localhost:3000/api`.

## Verificación

### Backend

```powershell
cd backend
pnpm.cmd run build
pnpm.cmd run test          # pruebas unitarias
pnpm.cmd run test:e2e      # pruebas end-to-end (Prisma en memoria)
pnpm.cmd run test:integration   # Pruebas contra PostgreSQL real (ver abajo)
```

Pruebas de integración reales (requieren una base de datos aislada):

```powershell
# Crea mymoney_bd_test y aplica migraciones + seed con DATABASE_URL apuntando a ella,
# luego dentro de backend:
$env:RUN_DB_INTEGRATION = "1"; pnpm.cmd run test:integration
```

Las pruebas de integración se niegan a ejecutarse si la base de datos de destino no
termina en `_test`.

### Frontend

```powershell
cd frontend
pnpm.cmd build
pnpm.cmd exec ng test --watch=false
```

## Funcionalidad

- Autenticación real (registro, login, restauración de sesión, refresh, logout).
- Panel con resumen por moneda, gastos por categoría, tendencia mensual y movimientos recientes.
- CRUD de cuentas, categorías, movimientos (ingresos, gastos y transferencias), presupuestos, metas de ahorro (con aportes) y deudas (con pagos).
- Perfil: edición de datos y cambio de contraseña (invalida las demás sesiones).

La información monetaria se mantiene **separada por moneda**: nunca se suman importes de
monedas distintas. Los importes se transportan como cadenas decimales y se formatean en el cliente.
