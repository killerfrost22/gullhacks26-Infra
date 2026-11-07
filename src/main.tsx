import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/700.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { App } from './App';
import { TechPage } from './TechPage';

// Two pages, both full page loads. The server's SPA fallback returns index.html for /tech.
const Page = window.location.pathname.replace(/\/+$/, '') === '/tech' ? TechPage : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Page /></React.StrictMode>,
);
