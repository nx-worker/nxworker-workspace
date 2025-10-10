export interface MoveFileGeneratorSchema {
  file: string;
  project: string;
  projectDirectory?: string;
  deriveProjectDirectory?: boolean;
  skipExport?: boolean;
  skipFormat?: boolean;
  allowUnicode?: boolean;
  removeEmptyProject?: boolean;
  experimentalThreads?: boolean;
}
