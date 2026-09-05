import React from 'react';
import ReactDOM from 'react-dom/client';

import { Providers } from '@/app/providers';
import { Root } from '@/app/Root';
import '@/styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('the application root element is missing from index.html');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <Providers>
      <Root />
    </Providers>
  </React.StrictMode>,
);
