import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app/app";
import { Crash } from "@/app/crash";

import "@/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");
createRoot(root).render(
  <StrictMode>
    <Crash>
      <App />
    </Crash>
  </StrictMode>,
);
