import React from 'react';
import ReactDOM from 'react-dom/client';
import { MainView } from './MainView';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <MainView />
    </React.StrictMode>,
  );
} else {
  console.error('Failed to find the root element to mount the React app.');
}
