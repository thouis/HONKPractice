import { initApp } from './app'
import { isAuthenticated, showAuthGate } from './auth'
import './style.css'

const root = document.getElementById('app')!

if (!isAuthenticated()) {
  await showAuthGate()
}
initApp(root)
