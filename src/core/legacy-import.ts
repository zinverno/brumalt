import type { DataAdapter } from 'obsidian';
import { parseData } from './storage';
import type { SavedData } from './types';

interface ImportPort {
  adapter: Pick<DataAdapter, 'exists' | 'read'>;
  configDir: string;
  readCurrent: () => Promise<unknown>;
  writeCurrent: (data: SavedData) => Promise<void>;
}

/** Import only into an absent file. Existing files, including broken ones, win. */
export async function loadWithLegacy(port: ImportPort): Promise<{ data: unknown; imported: boolean }> {
  const current = `${port.configDir}/plugins/brumalt/data.json`;
  const legacy = `${port.configDir}/plugins/casual-memory-games/data.json`;
  const readCurrent = async () => {
    const data = await port.readCurrent();
    if (data === null || data === undefined) throw new Error('Existing data file is empty or unreadable');
    return { data, imported: false };
  };
  if (await port.adapter.exists(current)) return readCurrent();
  if (!await port.adapter.exists(legacy)) return { data: null, imported: false };
  const raw: unknown = JSON.parse(await port.adapter.read(legacy));
  if (raw === null) throw new Error('Legacy data is empty');
  const data = parseData(raw);
  // Recheck after reading/validating; never merge with a newly appeared destination.
  if (await port.adapter.exists(current)) return readCurrent();
  await port.writeCurrent(data);
  const persisted = parseData((await readCurrent()).data);
  if (JSON.stringify(persisted) !== JSON.stringify(data)) throw new Error('Imported data did not round-trip');
  return { data: persisted, imported: true };
}
