export interface MoveFileGeneratorSchema {
  from: string;
  to: string;
  skipExport?: boolean;
  skipFormat?: boolean;
  allowUnicode?: boolean;
}
