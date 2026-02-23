/**
 * IDEAForge Simulation Engine — Root Application Component
 *
 * This is the entry point for the React application. It will eventually
 * contain the router, global providers (TanStack Query, Zustand), and
 * the main simulation dashboard layout.
 */
function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">
            🔥 IDEAForge Simulation Engine
          </h1>
          <p className="text-muted-foreground text-lg">
            Adversarial Multi-Agent Idea Refinement System
          </p>
          <div className="text-sm text-muted-foreground">
            Ready for development
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
