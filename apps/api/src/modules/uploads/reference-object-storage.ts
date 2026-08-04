export const REFERENCE_OBJECT_STORAGE = Symbol("REFERENCE_OBJECT_STORAGE");

export interface ReferenceObjectStorage {
  put(objectKey: string, data: Buffer): Promise<void>;
  get(objectKey: string): Promise<Buffer>;
  delete(objectKey: string): Promise<void>;
}
