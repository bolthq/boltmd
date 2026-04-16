export interface IImageService {
  handlePasteImage(blob: Blob, currentFilePath: string): Promise<string>
  handleDropImage(file: File, currentFilePath: string): Promise<string>
}
