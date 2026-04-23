import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { ask, message } from '@tauri-apps/plugin-dialog'
import { t } from '../../i18n'

class UpdateServiceImpl {
  private checking = false

  /** 手动检查更新（菜单触发） */
  async checkForUpdates(): Promise<void> {
    if (this.checking) return
    this.checking = true

    try {
      const update = await check()

      if (!update) {
        // 已是最新版本
        await message(t('updater.upToDateMessage'), {
          title: t('updater.upToDate'),
          kind: 'info',
        })
        return
      }

      // 发现新版本，询问是否安装
      const confirmed = await ask(
        t('updater.availableMessage', { version: update.version }),
        {
          title: t('updater.available'),
          kind: 'info',
          okLabel: t('updater.install'),
          cancelLabel: t('updater.later'),
        },
      )

      if (!confirmed) return

      // 下载并安装
      await update.downloadAndInstall()
      // 重启应用
      await relaunch()
    } catch (e) {
      await message(t('updater.failedMessage', { error: String(e) }), {
        title: t('updater.failed'),
        kind: 'error',
      })
    } finally {
      this.checking = false
    }
  }
}

export const updateService = new UpdateServiceImpl()
