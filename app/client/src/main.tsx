import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
// One stylesheet per parallel UI track, so six implementers never edit the
// same file. Imported after styles.css on purpose: a track rule wins a
// specificity tie with the base sheet. Order among the six is alphabetical and
// carries no meaning - the tracks are file-disjoint in markup too.
import './styles/content.css';
import './styles/course.css';
import './styles/graph.css';
import './styles/lists.css';
import './styles/nav.css';
import './styles/reports.css';

const container = document.getElementById('root');
if (!container) throw new Error('missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
