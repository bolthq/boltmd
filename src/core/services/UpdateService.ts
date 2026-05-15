import { ref, readonly } from 'vue'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { ask, message } from '@tauri-apps/plugin-dialog'
import { t } from '../../i18n'
import { configService } from './ConfigService'

class UpdateServiceImpl {
  private _checking = ref(false)
  private _updateAvailable = ref(false)
  private _updateVersion = ref('')
  private _pendingUpdate: Update | null = null

  /** Reactive flag: true while an update check is in progress. */
  readonly checking = readonly(this._checking)

  /** Reactive flag: true when a newer version has been detected silently. */
  readonly updateAvailable = readonly(this._updateAvailable)

  /** The version string of the available update (e.g. "0.5.1"). */
  readonly updateVersion = readonly(this._updateVersion)

  /**
   * Silent background check — called on startup after a delay.
   * Never shows any dialog. Only sets reactive state so the StatusBar
   * can display a non-intrusive indicator.
   */
  async silentCheck(): Promise<void> {
    if (!configService.get('autoCheckUpdate')) return
    if (this._checking.value) return
    this._checking.value = true

    try {
      const update = await check()
      if (update) {
        // Release any previously held Update resource.
        await this._pendingUpdate?.close().catch(() => {})
        this._pendingUpdate = update
        this._updateAvailable.value = true
        this._updateVersion.value = update.version
      }
    } catch (e) {
      // Silent — do not bother the user.
      console.warn('[UpdateService] Silent check failed:', e)
    } finally {
      this._checking.value = false
    }
  }

  /**
   * Install a previously detected pending update.
   * Called when the user clicks the status bar update indicator.
   */
  async installPendingUpdate(): Promise<void> {
    const update = this._pendingUpdate
    if (!update) return

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

    try {
      await update.downloadAndInstall()
      await relaunch()
    } catch (e) {
      await message(t('updater.failedMessage', { error: String(e) }), {
        title: t('updater.failed'),
        kind: 'error',
      })
    }
  }

  /** Manual check triggered from Help menu. Shows dialogs for all outcomes. */
  async checkForUpdates(): Promise<void> {
    if (this._checking.value) return
    this._checking.value = true

    try {
      const update = await check()

      if (!update) {
        await message(t('updater.upToDateMessage'), {
          title: t('updater.upToDate'),
          kind: 'info',
        })
        return
      }

      // Also populate the silent-check state so the indicator appears
      // even if the user dismisses the dialog.
      await this._pendingUpdate?.close().catch(() => {})
      this._pendingUpdate = update
      this._updateAvailable.value = true
      this._updateVersion.value = update.version

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

      await update.downloadAndInstall()
      await relaunch()
    } catch (e) {
      await message(t('updater.failedMessage', { error: String(e) }), {
        title: t('updater.failed'),
        kind: 'error',
      })
    } finally {
      this._checking.value = false
    }
  }
}

export const updateService = new UpdateServiceImpl()
