import React from 'react'
import { createRoot } from 'react-dom/client'
import Login from './Login'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Login />
  </React.StrictMode>
)