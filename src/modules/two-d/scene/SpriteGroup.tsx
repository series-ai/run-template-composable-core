/**
 * Declarative 2D SpriteGroup component for transform hierarchy.
 */

import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { SpriteScene } from './SpriteScene';
import type { ProfileId, SceneNode } from './types';

export const SpriteGroupContext = createContext<string | null>(null);

export interface SpriteGroupProps {
  id: string;
  scene: SpriteScene;
  profileId: ProfileId;
  parentId?: string | null;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  visible?: boolean;
  children?: React.ReactNode;
}

export interface SpriteGroupHandle {
  setPosition(x: number, y: number): void;
  setScale(x: number, y: number): void;
  setRotation(radians: number): void;
  setVisible(visible: boolean): void;
  getNode(): SceneNode | undefined;
}

export const SpriteGroup = forwardRef<SpriteGroupHandle, SpriteGroupProps>(function SpriteGroup(
  props,
  ref,
) {
  const {
    id,
    scene,
    parentId: propParentId,
    x,
    y,
    scaleX,
    scaleY,
    rotation,
    visible,
    profileId: _profileId,
    children,
  } = props;

  const contextParentId = useContext(SpriteGroupContext);
  const effectiveParentId = propParentId !== undefined ? propParentId : contextParentId;
  const [registration, setRegistration] = useState<{ id: string; scene: SpriteScene; parentId: string | null } | null>(null);

  const optionsRef = useRef(props);
  optionsRef.current = props;

  // Mount once into SpriteScene
  useEffect(() => {
    const p = optionsRef.current;
    scene.registerGroup(id, {
      profileId: p.profileId,
      parentId: effectiveParentId,
      x: p.x,
      y: p.y,
      scaleX: p.scaleX,
      scaleY: p.scaleY,
      rotation: p.rotation,
      visible: p.visible,
    });
    setRegistration({ id, scene, parentId: effectiveParentId });

    return () => {
      scene.removeNode(id);
    };
  }, [id, scene, effectiveParentId]);

  // Update transform when declarative props change
  useEffect(() => {
    scene.updateNode(id, {
      x,
      y,
      scaleX,
      scaleY,
      rotation,
      visible,
    });
  }, [id, scene, x, y, scaleX, scaleY, rotation, visible]);

  useImperativeHandle(
    ref,
    (): SpriteGroupHandle => ({
      setPosition(newX: number, newY: number): void {
        scene.updateNode(id, { x: newX, y: newY });
      },
      setScale(newSx: number, newSy: number): void {
        scene.updateNode(id, { scaleX: newSx, scaleY: newSy });
      },
      setRotation(radians: number): void {
        scene.updateNode(id, { rotation: radians });
      },
      setVisible(v: boolean): void {
        scene.updateNode(id, { visible: v });
      },
      getNode(): SceneNode | undefined {
        return scene.getNode(id);
      },
    }),
    [id, scene],
  );

  const ready = registration?.id === id && registration.scene === scene && registration.parentId === effectiveParentId;
  return <SpriteGroupContext.Provider value={id}>{ready ? children : null}</SpriteGroupContext.Provider>;
});

export default SpriteGroup;
