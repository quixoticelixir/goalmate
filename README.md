# Goal Decomposer Prototype

Prototype full-stack app: user enters a goal on the frontend, backend returns a list of sub-goals (currently heuristic, later can be powered by a neural model).

## Stack

- Frontend: static HTML + vanilla JS (`public/index.html`, `public/main.js`)
- Backend: Node.js + Express (`src/server.js`, `src/services/goalDecomposer.js`)

## How to run locally

From the project root:

```bash
npm install
npm run dev
```

Then open:

- `http://localhost:3000` – frontend
- `POST http://localhost:3000/api/goals/decompose` – API (JSON body: `{ "goal": "your goal" }`)

## Where to plug a neural model

The function `decomposeGoal` in `src/services/goalDecomposer.js` is the place to integrate a real model:

- Call an external API (e.g. OpenAI, other provider)
- Call a local model server via HTTP
- Call a separate Python service

For now it uses a simple heuristic (`fakeHeuristicBreakdown`) so the prototype works end-to-end without external services.
