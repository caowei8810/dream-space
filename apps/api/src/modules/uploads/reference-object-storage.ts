import type { ObjectStorage } from "@dream-space/storage";

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");
export const REFERENCE_OBJECT_STORAGE = OBJECT_STORAGE;
export type ReferenceObjectStorage = ObjectStorage;
