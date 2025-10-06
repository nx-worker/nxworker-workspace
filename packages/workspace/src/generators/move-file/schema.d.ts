export interface MoveFileGeneratorSchema {
  file: string;
  project: string;
  projectDirectory?: string;
  skipExport?: boolean;
  skipFormat?: boolean;
  allowUnicode?: boolean;
}
