# OpenSIM Interoperability Guide

This document describes how the IA3 SimWorld simulation world and map are fully compatible and interoperable with **OpenSimulator (OpenSIM)** virtual world servers.

---

## 1. Architectural Overview

OpenSimulator (OpenSIM) is an open-source 3D multi-user virtual world server compatible with the Linden Lab protocol. A standard OpenSIM simulation region is exactly **256 meters x 256 meters** in size.

To establish complete compatibility with OpenSIM, our 2D grid simulation exposes standard endpoints on the API Gateway to translate our procedural terrain and live agent state into standard OpenSIM-compatible formats:

1. **Grayscale Heightmap Export (PNG):** Converts our infinite continuous noise terrain into a seamless 256x256 8-bit heightmap image where brightness (0-255) represents altitude in meters.
2. **Dynamic LSL Synchronization (JSON):** Provides a lightweight JSON payload of live agent positions and world objects scaled perfectly to OpenSIM region coordinates, optimized for LSL (Linden Scripting Language) scripts.

---

## 2. Terrain Heightmap Integration

To load the SimWorld terrain into an OpenSIM region:

### Endpoint:
- **URL:** `http://localhost:18080/api/state/opensim/png`
- **Output:** Standard `image/png` (8-bit Grayscale, 256x256 pixels)

### How to Load into OpenSIM:

1. **Via Server Console:**
   Download the heightmap image from the gateway, place it in your OpenSIM binary folder, and execute the following console command:
   ```bash
   terrain load opensim_terrain_256.png
   ```

2. **Via Viewer (e.g. Firestorm):**
   - Log into your OpenSIM region as an administrator.
   - Open the **World > Region / Estate** menu.
   - Go to the **Terrain** tab.
   - Click **Upload RAW Terrain** and select the downloaded PNG heightmap.
   - The region will immediately morph in 3D to match the mountains, hills, plains, and lake beds of our SimWorld simulation!

---

## 3. Dynamic LSL Object and NPC Replication

To bring the live simulation to life in the 3D OpenSIM world, in-world LSL scripts can query the gateway using HTTP and dynamically position/animate custom entities.

### Endpoint:
- **URL:** `http://localhost:18080/api/state/opensim/json`
- **Format:** `application/json`

### JSON Structure Example:
```json
{
  "tick": 420,
  "running": true,
  "simWorldWidth": 96,
  "simWorldHeight": 96,
  "openSimSize": 256,
  "waterHeight": 20.0,
  "agents": [
    {
      "id": "agent-1",
      "name": "Aster",
      "role": "Scout",
      "status": "Exploring",
      "mood": "adventurous",
      "opensimX": 8.0,
      "opensimY": 5.33,
      "opensimZ": 21.0
    }
  ],
  "objects": [
    {
      "type": "homestead",
      "amount": 100,
      "opensimX": 18.6,
      "opensimY": 12.0,
      "opensimZ": 24.5
    }
  ],
  "discoveredSectors": ["(0, 0)", "(1, 0)"]
}
```

### Linden Scripting Language (LSL) Example Script:
Place this script in an OpenSIM "SimWorld Controller" prim to periodically fetch positions and rez structures:

```lsl
string GATEWAY_URL = "http://localhost:18080/api/state/opensim/json";
key httpQueryId;

default {
    state_entry() {
        llSetTimerEvent(5.0); // Poll every 5 seconds
    }

    timer() {
        httpQueryId = llHTTPRequest(GATEWAY_URL, [HTTP_METHOD, "GET"], "");
    }

    http_response(key id, integer status, list metadata, string body) {
        if (id == httpQueryId && status == 200) {
            llOwnerSay("Fetched live state from SimWorld API!");
            // Parse agent positions and rez/reposition custom NPCs/avatars
            // using standard LSL functions like llJsonGetValue or llSetLinkPrimitiveParamsFast
        }
    }
}
```
