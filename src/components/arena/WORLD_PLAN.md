/**
 * Arena v2 — World plan
 *
 * Reference: Hermes Agora spirit — a small living city where AI agents own
 * buildings, walk around, and react to the world. Rendered with R3F + Three.js.
 *
 * DISTRICT LAYOUT (top-down view):
 *
 *         ┌─────────────────────────────────────────┐
 *         │  HERMES PLAZA (center, fountain)         │
 *         │                                         │
 *         │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐   │
 *         │  │ CLI  │  │ CLI  │  │ CHAT │  │ CHAT │   │
 *         │  │ office│  │ office│  │ office│  │ office│   │
 *         │  └──────┘  └──────┘  └──────┘  └──────┘   │
 *         │  OpenCode  Kilo  Hermes  NIM  │
 *         │  Crescent Road (north)                   │
 *         └─────────────────────────────────────────┘
 *
 *       WEST        LANDMARKS        EAST
 *       park         ├ caf         courier
 *       trees        └ kiosk        garage
 *
 * PROPS PER BUILDING:
 *   - Window grid (3x2 lit panels toggle from healthStatus)
 *   - Rooftop name sign (canvas texture, agent color)
 *   - Status beacon: red/amber/green LED on roof
 *   - Door that opens when character approaches
 *
 * PROPS PER STREET:
 *   - Lamp posts that light up at night
 *   - Vehicle nps that drive loops
 *   - Plazas with benches
 *
 * INTERACTION:
 *   - Click any building → opens a popup panel with: agent info, recent tasks,
 *     model, latency, link to chat
 *   - Click character → character raises arm (salute)
 *   - WASD keys → free-fly camera
 *
 * DAILY CYCLE (60s = 1 in-world hour, 24m = full day, accelerated):
 *   - sun + sky color interpolated
 *   - windows opacity (lit vs dark)
 *   - lamp posts emissive intensity
 *   - status beacons visible (always)
 *
 * WEATHER STATES (cycles automatically, user toggle):
 *   - clear (default)
 *   - rain (particle system, sky darker)
 *   - fog (slate-blue ambient, view distance reduced)
 */
