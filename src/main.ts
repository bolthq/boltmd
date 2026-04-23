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

async function bootstrap() {
  // 1. 加载配置（i18n 依赖 language 设置）
  await initConfig()

  // 2. 初始化 i18n
  const i18n = setupI18n()

  // 3. 挂载应用
  createApp(App).use(i18n).mount('#app')
}

bootstrap()
