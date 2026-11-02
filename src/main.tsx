import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import './styles.css'
import './improvements.css'
import './auth.css'
import './redesign.css'
import './palette.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthProvider><App /></AuthProvider></React.StrictMode>)
