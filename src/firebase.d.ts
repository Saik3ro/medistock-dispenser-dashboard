import type { Database, DatabaseReference, DataSnapshot } from "firebase/database";

export const db: Database;
export function ref(db: Database, path: string): DatabaseReference;
export function set(reference: DatabaseReference, value: unknown): Promise<void>;
export function get(reference: DatabaseReference): Promise<DataSnapshot>;
export function child(parentRef: DatabaseReference, path: string): DatabaseReference;
export function update(reference: DatabaseReference, values: Record<string, unknown>): Promise<void>;
export function remove(reference: DatabaseReference): Promise<void>;
export function onValue(
  reference: DatabaseReference,
  callback: (snapshot: DataSnapshot) => void,
): () => void;
export function push(reference: DatabaseReference, value?: unknown): Promise<DatabaseReference>;
