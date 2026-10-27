import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { StarterApplication } from './core/StarterApplication';
import './index.css';

const element = document.getElementById('root');
if (!element) throw new Error('Root container is missing.');
const application = new StarterApplication();
application.attachInput(window);
void application.load('2d');
createRoot(element).render(<StrictMode><App application={application} /></StrictMode>);
if (import.meta.hot) import.meta.hot.dispose(() => application.dispose());
