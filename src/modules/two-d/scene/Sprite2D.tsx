/**
 * Declarative 2D Sprite component.
 * Mounts once into SpriteScene.
 * Numeric updates execute through refs or scene calls.
 */

import { forwardRef, useContext, useEffect, useImperativeHandle, useRef } from 'react';
import { SpriteGroupContext } from './SpriteGroup';
import type { SpriteScene } from './SpriteScene';
import type { BlendMode, ColorRgba, ProfileId, RectPx, SceneNode } from './types';

export interface Sprite2DProps {
  id: string;
  scene: SpriteScene;
  profileId: ProfileId;
  parentId?: string | null;
  atlasId?: string;
  frameId?: string;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  pivotX?: number;
  pivotY?: number;
  anchorOffsetXMeters?: number;
  anchorOffsetYMeters?: number;
  visible?: boolean;
  opacity?: number;
  tint?: ColorRgba;
  layer?: string;
  layerRank?: number;
  subBand?: number;
  explicitOrder?: number;
  sortY?: boolean;
  flipX?: boolean;
  flipY?: boolean;
  width?: number;
  height?: number;
  blendMode?: BlendMode;
  clipRect?: RectPx;
  maskId?: string;
}

export interface Sprite2DHandle {
  setPosition(x: number, y: number): void;
  setScale(x: number, y: number): void;
  setRotation(radians: number): void;
  setPivot(x: number, y: number): void;
  setFrame(frameId: string, atlasId?: string): void;
  setVisible(visible: boolean): void;
  setOpacity(opacity: number): void;
  setTint(r: number, g: number, b: number, a?: number): void;
  setAnchorOffset(xMeters: number, yMeters: number): void;
  getNode(): SceneNode | undefined;
}

export const Sprite2D = forwardRef<Sprite2DHandle, Sprite2DProps>(function Sprite2D(props, ref) {
  const {
    id,
    scene,
    parentId: _parentId,
    atlasId,
    frameId,
    x,
    y,
    scaleX,
    scaleY,
    rotation,
    pivotX,
    pivotY,
    anchorOffsetXMeters,
    anchorOffsetYMeters,
    visible,
    opacity,
    tint,
    layer,
    layerRank,
    subBand,
    explicitOrder,
    sortY,
    flipX,
    flipY,
    width,
    height,
    blendMode,
    clipRect,
    maskId,
    profileId: _profileId,
  } = props;

  const optionsRef = useRef(props);
  optionsRef.current = props;
  const contextParentId = useContext(SpriteGroupContext);
  const effectiveParentId = props.parentId !== undefined ? props.parentId : contextParentId;

  // Mount once into SpriteScene
  useEffect(() => {
    const p = optionsRef.current;
    scene.registerSprite(id, {
      profileId: p.profileId,
      parentId: effectiveParentId,
      atlasId: p.atlasId,
      frameId: p.frameId,
      x: p.x,
      y: p.y,
      scaleX: p.scaleX,
      scaleY: p.scaleY,
      rotation: p.rotation,
      pivotX: p.pivotX,
      pivotY: p.pivotY,
      anchorOffsetXMeters: p.anchorOffsetXMeters,
      anchorOffsetYMeters: p.anchorOffsetYMeters,
      visible: p.visible,
      opacity: p.opacity,
      tint: p.tint,
      layer: p.layer,
      layerRank: p.layerRank,
      subBand: p.subBand,
      explicitOrder: p.explicitOrder,
      sortY: p.sortY,
      flipX: p.flipX,
      flipY: p.flipY,
      width: p.width,
      height: p.height,
      blendMode: p.blendMode,
      clipRect: p.clipRect,
      maskId: p.maskId,
    });

    return () => {
      scene.removeNode(id);
    };
  }, [id, scene, effectiveParentId]);

  // Update node when declarative props change
  useEffect(() => {
    scene.updateNode(id, {
      x,
      y,
      scaleX,
      scaleY,
      rotation,
      pivotX,
      pivotY,
      anchorOffsetXMeters,
      anchorOffsetYMeters,
      visible,
      opacity,
      tint,
      layer,
      layerRank,
      subBand,
      explicitOrder,
      sortY,
      flipX,
      flipY,
      width,
      height,
      atlasId,
      frameId,
      blendMode,
      clipRect,
      maskId,
    });
  }, [
    id,
    scene,
    x,
    y,
    scaleX,
    scaleY,
    rotation,
    pivotX,
    pivotY,
    anchorOffsetXMeters,
    anchorOffsetYMeters,
    visible,
    opacity,
    tint,
    layer,
    layerRank,
    subBand,
    explicitOrder,
    sortY,
    flipX,
    flipY,
    width,
    height,
    atlasId,
    frameId,
    blendMode,
    clipRect,
    maskId,
  ]);

  // Expose imperative handle for zero-overhead numeric frame updates
  useImperativeHandle(
    ref,
    (): Sprite2DHandle => ({
      setPosition(newX: number, newY: number): void {
        scene.updateNode(id, { x: newX, y: newY });
      },
      setScale(newSx: number, newSy: number): void {
        scene.updateNode(id, { scaleX: newSx, scaleY: newSy });
      },
      setRotation(radians: number): void {
        scene.updateNode(id, { rotation: radians });
      },
      setPivot(newPx: number, newPy: number): void {
        scene.updateNode(id, { pivotX: newPx, pivotY: newPy });
      },
      setFrame(newFrameId: string, newAtlasId?: string): void {
        if (newAtlasId) {
          scene.updateNode(id, { frameId: newFrameId, atlasId: newAtlasId });
        } else {
          scene.updateNode(id, { frameId: newFrameId });
        }
      },
      setVisible(v: boolean): void {
        scene.updateNode(id, { visible: v });
      },
      setOpacity(o: number): void {
        scene.updateNode(id, { opacity: o });
      },
      setTint(r: number, g: number, b: number, a = 1.0): void {
        scene.updateNode(id, { tint: [r, g, b, a] });
      },
      setAnchorOffset(xMeters: number, yMeters: number): void {
        scene.updateNode(id, {
          anchorOffsetXMeters: xMeters,
          anchorOffsetYMeters: yMeters,
        });
      },
      getNode(): SceneNode | undefined {
        return scene.getNode(id);
      },
    }),
    [id, scene],
  );

  return null;
});

export default Sprite2D;
