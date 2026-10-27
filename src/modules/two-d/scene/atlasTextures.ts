import * as THREE from 'three';

export type AtlasSampling = 'nearest' | 'linear';
export interface AtlasTextureLease {
  readonly texture: THREE.Texture;
  release(): void;
}

interface Entry {
  readonly source: TexImageSource;
  readonly texture: THREE.Texture;
  readonly bytes: number;
  references: number;
}

/** Own one texture for each asset and sampling policy. */
export class AtlasTextures {
  private readonly entries = new Map<string, Entry>();
  private bytes = 0;
  private disposed = false;

  constructor(private readonly maxBytes = 64 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 4) throw new RangeError('Invalid atlas byte limit.');
  }

  acquire(assetId: string, source: TexImageSource, width: number, height: number,
    sampling: AtlasSampling): AtlasTextureLease {
    if (this.disposed) throw new Error('Atlas textures are disposed.');
    if (!assetId || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      (sampling !== 'nearest' && sampling !== 'linear')) throw new TypeError('Invalid atlas texture.');
    const key = `${assetId.length}:${assetId}:${sampling}:flat-2d`;
    let entry = this.entries.get(key);
    if (entry && (entry.source !== source || entry.bytes !== width * height * 4)) {
      throw new Error('An atlas asset ID must refer to the same image.');
    }
    if (!entry) {
      const bytes = width * height * 4;
      if (!Number.isSafeInteger(bytes) || this.bytes + bytes > this.maxBytes) throw new RangeError('Atlas texture byte limit exceeded.');
      const texture = new THREE.Texture(source);
      texture.flipY = false;
      texture.colorSpace = THREE.NoColorSpace;
      texture.premultiplyAlpha = true;
      texture.generateMipmaps = false;
      texture.minFilter = texture.magFilter = sampling === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
      texture.needsUpdate = true;
      entry = { source, texture, bytes, references: 0 };
      this.entries.set(key, entry);
      this.bytes += bytes;
    }
    entry.references++;
    let released = false;
    return { texture: entry.texture, release: () => {
      if (released) return;
      released = true;
      if (this.disposed || this.entries.get(key) !== entry) return;
      if (--entry.references === 0) {
        entry.texture.dispose();
        this.entries.delete(key);
        this.bytes -= entry.bytes;
      }
    } };
  }

  getStats(): Readonly<{ textures: number; bytes: number }> {
    return { textures: this.entries.size, bytes: this.bytes };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) entry.texture.dispose();
    this.entries.clear();
    this.bytes = 0;
  }
}
