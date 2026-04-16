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
