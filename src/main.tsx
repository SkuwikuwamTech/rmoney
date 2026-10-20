import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Adjust Tauri window size to fit the app content on initial load
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

(async () => {
  const win = await getCurrentWindow();
  const width = document.documentElement.scrollWidth;
  const height = document.documentElement.scrollHeight;
  await win.setSize(new LogicalSize(width, height));
})();
