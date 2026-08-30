/**
 * Integration beispiel: Polling mit Config
 * 
 * Zeigt wie man die loadUIConfig() in pages/index.tsx integriert
 */

import { loadUIConfig } from "../lib/config";

export default function Home() {
  // ... existing code ...
  
  useEffect(() => {
    // Load config at component startup
    const uiConfig = loadUIConfig();
    
    // Now use config instead of hardcoded values
    const fallbackPoll = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        void refresh();
      }
    }, uiConfig.polling.compact_interval_ms);  // ← From config!
    
    return () => clearInterval(fallbackPoll);
  }, []);
  
  // More examples:
  // uiConfig.polling.full_state_interval_ms  → 5000ms
  // uiConfig.map.max_agents_display          → 100
  // uiConfig.map.default_zoom                → 2
  // uiConfig.components.admin_board.max_events_display → 50
}
