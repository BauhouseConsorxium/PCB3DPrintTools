import * as THREE from "three";
import {
  isCopper,
  isSilkscreen,
  isEnclosure,
  isJumper,
  isComponent,
} from "./viewer-predicates.js";

export const previewMat = new THREE.MeshPhongMaterial({
  color: 0xd4d4d4,
  specular: 0x888888,
  shininess: 60,
  side: THREE.DoubleSide,
});

export const subtractCutterMat = new THREE.MeshPhongMaterial({
  color: 0xff6b35,
  specular: 0x884422,
  shininess: 80,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

export const subtractBoardMat = new THREE.MeshPhongMaterial({
  color: 0x27ae60,
  specular: 0x5dade2,
  shininess: 40,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
});

export const previewSubtractBoardMat = new THREE.MeshPhongMaterial({
  color: 0xd4d4d4,
  specular: 0x888888,
  shininess: 60,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.72,
  depthWrite: false,
});

export function makeMaterial(name) {
  if (isCopper(name)) {
    return new THREE.MeshPhongMaterial({
      color: 0xf5c842,
      specular: 0xffffff,
      shininess: 120,
      side: THREE.DoubleSide,
    });
  }
  if (isSilkscreen(name)) {
    return new THREE.MeshPhongMaterial({
      color: 0xf0f0f0,
      specular: 0x444444,
      shininess: 30,
      side: THREE.DoubleSide,
    });
  }
  if (isEnclosure(name)) {
    return new THREE.MeshPhongMaterial({
      color: 0x5a8fa8,
      specular: 0x334455,
      shininess: 20,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
  }
  if (isJumper(name)) {
    const hexMatch = name.match(/_([0-9a-fA-F]{6})$/);
    const color = hexMatch ? parseInt(hexMatch[1], 16) : 0x67e8f9;
    return new THREE.MeshPhongMaterial({
      color,
      specular: 0xffffff,
      shininess: 100,
      side: THREE.DoubleSide,
    });
  }
  if (isComponent(name)) {
    return new THREE.MeshPhongMaterial({
      color: 0xe0609a,
      specular: 0xffaad4,
      shininess: 80,
      side: THREE.DoubleSide,
    });
  }
  return new THREE.MeshPhongMaterial({
    color: 0x27ae60,
    specular: 0x5dade2,
    shininess: 40,
    side: THREE.DoubleSide,
  });
}
