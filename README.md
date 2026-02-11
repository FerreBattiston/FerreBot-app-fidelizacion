# FerreBot App - Programa de Fidelización y Marketplace de Oficios

Este repositorio contiene la aplicación de fidelización (puntos + premios) y el marketplace de oficios estilo “Uber” para Ferretería Battiston.

- **Backend/API:** Node.js + Express
- **Base de datos:** PostgreSQL
- **Frontend (PWA):** React (Vite)
- **Contenedorización:** Docker Compose

## Levantar el proyecto (Docker)

Requisitos: Docker + Docker Compose.

> Nota: en este servidor usamos `docker-compose` (clásico). En otras máquinas puede ser `docker compose`.

```bash
cd FerreBot-app-fidelizacion
cp .env.example .env  # opcional
sudo docker-compose up -d --build
```

URLs:
- Frontend (web): http://localhost:5173
- Backend (api): http://localhost:3001

Base de datos:
- Postgres corre **solo dentro** del compose (no expone 5432 al host).

### Probar rápido (API)
Ejemplo de registro (dev):

```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo","roles":["cliente"]}'
```

## Endpoints actuales
- `GET /api/v1/health`
- `POST /api/v1/auth/register` → crea usuario + roles y devuelve JWT
- `POST /api/v1/auth/login` → devuelve JWT
- `GET /api/v1/me` → protegido (Bearer token)

## Estructura del repo

```
FerreBot-app-fidelizacion/
├── backend/
│   ├── src/
│   └── db/
├── frontend/
│   ├── src/
│   └── vite.config.js
└── docker-compose.yml
```

## Roadmap (MVP)

### 1) Roles
- Cliente
- Profesional (albañil / electricista / plomero)
- Admin

### 2) Flujo tipo Uber (MVP simple)

**Cliente publica trabajo**
- rubro
- descripción
- zona
- franja horaria

**Matching / asignación**
- MVP: feed o notificación a profesionales

**Estados**
Publicado → Asignado → Finalizado → Calificado

**Calificaciones**
- 1–5 estrellas + comentario

### 3) Puntos y premios
- puntos por compras
- canje de premios
- historial (ledger)

## Próximos pasos (prioridad)
1. Migrations reales (en vez de recrear volumen).
2. Jobs/oficios + matching.
3. Puntos + recompensas.
4. Panel admin / inbox WhatsApp.
