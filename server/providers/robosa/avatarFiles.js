import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

function ownerFileName(ownerId) {
  return `${createHash('sha256').update(String(ownerId)).digest('hex')}.glb`;
}

export function createAvatarFileStore({
  directory = path.join(
    process.env.ROBOSA_DATA_DIR || path.resolve('.robosa-data'),
    'avatars',
  ),
} = {}) {
  async function write(ownerId, model) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filePath = path.join(directory, ownerFileName(ownerId));
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, model, { mode: 0o600 });
    await rename(temporaryPath, filePath);
    return {
      sha256: createHash('sha256').update(model).digest('hex'),
      size: model.length,
    };
  }

  function read(ownerId) {
    return readFile(path.join(directory, ownerFileName(ownerId)));
  }

  return { directory, read, write };
}
