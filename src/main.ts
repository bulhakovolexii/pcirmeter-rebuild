import { mount } from 'svelte'
import App from './ui/App.svelte'
import { registerServiceWorker } from './ui/pwa'
import './ui/app.css'

const target = document.getElementById('app')
if (!target) throw new Error('#app not found')

export default mount(App, { target })

// Офлайн-робота й оновлення — лише у збірці (у dev-сервері SW заважав би гарячому перезавантаженню)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  registerServiceWorker(navigator.serviceWorker, () => location.reload()).catch((e: unknown) =>
    console.warn('Service worker:', e),
  )
}
