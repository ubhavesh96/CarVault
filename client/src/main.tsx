import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './platform.css';

// Layout direction preview: ?dir=rtl renders the whole app right-to-left (strings are still English).
const dir = new URLSearchParams(location.search).get('dir');
if (dir === 'rtl' || dir === 'ltr') document.documentElement.dir = dir;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
