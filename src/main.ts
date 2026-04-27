import { createApp } from 'vue'
import App from './App.vue'
import './tailwind.css'
import './styles/themes/variables.css'
import './styles/themes/light.css'
import './styles/themes/dark.css'
import './styles/base.css'
import './styles/editor.css'
import './styles/source.css'
import { initConfig } from './core/services/ConfigService'
import { setupI18n } from './i18n'

// Catch unhandled promise rejections globally so they are always logged.
window.addEventListener('unhandledrejection', (event) => {
  console.error('[App] Unhandled promise rejection:', event.reason)
})

async function bootstrap() {
  // 1. Load config (i18n depends on language setting)
  await initConfig()

  // 2. Initialize i18n
  const i18n = setupI18n()

  // 3. Mount app with Vue-level error handler
  const app = createApp(App)
  app.config.errorHandler = (err, _instance, info) => {
    console.error(`[Vue] Error in ${info}:`, err)
  }
  app.use(i18n).mount('#app')
}

bootstrap()
