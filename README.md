# Micro Economics

Monorepo with an Angular front end and a Node/Express API.

| Path  | Stack                                      | Dev URL               |
| ----- | ------------------------------------------ | --------------------- |
| `ui/`  | Angular 20, standalone components, SCSS    | http://localhost:4200 |
| `api/` | Node 22, Express 5, TypeScript (ESM)       | http://localhost:3000 |

## Getting started

Install dependencies in each package:

```bash
cd api && npm install
cd ../ui && npm install
```

Copy the API environment template:

```bash
cp api/.env.example api/.env
```

Run both apps in separate terminals:

```bash
cd api && npm run dev   # tsx watch, http://localhost:3000
cd ui  && npm start     # ng serve, http://localhost:4200
```

`ng serve` proxies `/api/*` to the API (see `ui/proxy.conf.json`), so the browser
only ever talks to port 4200 in development.

## Scripts

**api/**

| Script             | Description                       |
| ------------------ | --------------------------------- |
| `npm run dev`      | Watch mode via `tsx`              |
| `npm run build`    | Compile TypeScript to `dist/`     |
| `npm start`        | Run the compiled server           |
| `npm run typecheck`| Type check without emitting       |

**ui/**

| Script          | Description                    |
| --------------- | ------------------------------ |
| `npm start`     | Dev server with API proxy      |
| `npm run build` | Production bundle to `dist/ui` |
| `npm test`      | Karma unit tests               |

## Endpoints

| Method | Path          | Description         |
| ------ | ------------- | ------------------- |
| GET    | `/api/health` | Status and uptime   |
