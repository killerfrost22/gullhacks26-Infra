import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Variable fonts: one file per family covers every weight. Browsers fetch only the subsets
// whose unicode-range the page uses (Latin here), so first load is two font files.
import '@fontsource-variable/public-sans/wght.css';
import '@fontsource-variable/big-shoulders/opsz.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/flow.css';
import './styles/result.css';
import './styles/pages.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
