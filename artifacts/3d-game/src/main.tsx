// This import must stay FIRST - above ./App and anything else that reaches a
// Zustand store.
//
// The stores rehydrate, and the running game writes a default save back, the
// moment they are evaluated. Cloud restore depends on knowing what was on
// disk BEFORE that happened. localSaveSnapshot takes that reading in its own
// module body, and ES modules are evaluated in import order, so the ordering
// of these lines is what makes the reading correct.
//
// The explicit call below is belt-and-braces only: imports are hoisted, so it
// runs after every module above has already been evaluated. It is idempotent
// and cannot overwrite the boot reading. Reordering the IMPORT is what would
// re-introduce the bug - not moving the call.
import { captureBootSnapshot } from './game/localSaveSnapshot';

import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

captureBootSnapshot();

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
