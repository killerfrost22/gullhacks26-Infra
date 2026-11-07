import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { Layout } from "./components/Layout.tsx";
import "./index.css";
import "./lib/leaflet.ts";
import { MapPage } from "./pages/MapPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { ReportDetailPage } from "./pages/ReportDetailPage.tsx";
import { ReportPage } from "./pages/ReportPage.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ReportPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="reports/:id" element={<ReportDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
