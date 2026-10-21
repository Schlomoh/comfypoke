import { Component, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/** A crash shows what broke and a way back, not a black screen. Stored data is untouched by a reload. */
class Crash extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-[max(3rem,env(safe-area-inset-top))]">
        <h1 className="font-mono text-xs font-semibold tracking-[0.2em]">STUDIO</h1>
        <p role="alert" className="font-mono text-xs text-bad">Something broke: {this.state.error.message}</p>
        <p className="text-xs text-faint">Your renders and characters are stored on this device and are not affected.</p>
        <button onClick={() => location.reload()} className="h-11 border border-line bg-panel px-3 font-medium hover:border-edge">
          Reload
        </button>
      </main>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Crash>
      <App />
    </Crash>
  </StrictMode>,
);
