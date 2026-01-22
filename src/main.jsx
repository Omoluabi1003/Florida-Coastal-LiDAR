import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        // eslint-disable-next-line no-console
        console.log("Service worker registered", registration.scope);
      })
      .catch((error) => {
        // eslint-disable-next-line no-console
        console.error("Service worker registration failed", error);
      });
  });
}
