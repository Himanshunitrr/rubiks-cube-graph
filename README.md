# Cube Theory Lab

An interactive 3D Rubik’s Cube paired with a live Cayley-graph visualization.
Each face turn applies a group generator, changes the cube, and traces the
corresponding walk through state space.

## Features

- draggable Three.js Rubik’s Cube with clickable faces
- clockwise and prime turns for all six faces
- synchronized state graph, move word, state ID, and path length
- scramble, undo, reset, and inverse-path solve controls
- keyboard controls and responsive mobile layout
- production configuration for Render

## Local development

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Build and run the production server:

```bash
npm run build
npm run start -- --host 0.0.0.0 --port 3000
```

## Controls

Use the on-screen generator controls, click a cube face, or press `R`, `U`,
`F`, `L`, `D`, or `B`. Hold Shift for a prime turn and press Backspace to undo.
