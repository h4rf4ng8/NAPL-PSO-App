import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ApolloProvider } from '@apollo/client/react';
import { client } from './api/client';
import './index.css';
import { applyTheme,getSavedTheme } from './theme/theme';

applyTheme(getSavedTheme());

ReactDOM.createRoot(document.querySelector('#root')!).render(
  <React.StrictMode>
    <ApolloProvider client={client}><App /></ApolloProvider>
  </React.StrictMode>
);
