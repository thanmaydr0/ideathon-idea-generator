/**
 * IDEAForge Simulation Engine — Root Application Component
 *
 * ARCH: The app renders the SimulationDashboard directly.
 * In production, this would include a router (react-router),
 * global providers (TanStack Query, auth), and error boundaries.
 * For now, the single-page dashboard is the entire app.
 */
import SimulationDashboard from "@/pages/SimulationDashboard";

function App() {
  return <SimulationDashboard />;
}

export default App;
