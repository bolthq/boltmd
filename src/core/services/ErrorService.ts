export enum ErrorLevel {
  Info = 'info',
  Warning = 'warning',
  Error = 'error',
}

export interface AppError {
  level: ErrorLevel
  message: string
  detail?: string
  source?: string
}

export interface IErrorService {
  report(error: AppError): void
  onError(handler: (error: AppError) => void): void
}

class ErrorServiceImpl implements IErrorService {
  private handlers: Array<(error: AppError) => void> = []

  report(error: AppError): void {
    // 控制台输出
    const prefix = `[BoltMD:${error.source ?? 'app'}]`
    if (error.level === ErrorLevel.Error) {
      console.error(prefix, error.message, error.detail ?? '')
    } else if (error.level === ErrorLevel.Warning) {
      console.warn(prefix, error.message, error.detail ?? '')
    } else {
      console.info(prefix, error.message, error.detail ?? '')
    }

    // 通知所有监听者（UI 层负责展示 toast 等）
    this.handlers.forEach((fn) => fn(error))
  }

  onError(handler: (error: AppError) => void): void {
    this.handlers.push(handler)
  }
}

export const errorService = new ErrorServiceImpl()
