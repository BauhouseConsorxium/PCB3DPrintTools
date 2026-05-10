import * as THREE from "three";

export function clearDrcGroup(drcGroup) {
  while (drcGroup.children.length) {
    const m = drcGroup.children[0];
    drcGroup.remove(m);
    m.geometry.dispose();
    m.material.dispose();
  }
}

export function addDrcTube(drcGroup, pcbWorldCenter, wy, x1, y1, x2, y2, color) {
  const wx1 = x1 - pcbWorldCenter.x,
    wz1 = -y1 - pcbWorldCenter.z;
  const wx2 = x2 - pcbWorldCenter.x,
    wz2 = -y2 - pcbWorldCenter.z;
  const p1 = new THREE.Vector3(wx1, wy, wz1);
  const p2 = new THREE.Vector3(wx2, wy, wz2);
  const len = p1.distanceTo(p2);

  let mesh;
  if (len < 0.8) {
    const geo = new THREE.SphereGeometry(0.8, 8, 6);
    mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    mesh.position.set((wx1 + wx2) / 2, wy, (wz1 + wz2) / 2);
  } else {
    const geo = new THREE.CylinderGeometry(0.35, 0.35, len, 8, 1);
    mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    mesh.position.set((wx1 + wx2) / 2, wy, (wz1 + wz2) / 2);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      p2.clone().sub(p1).normalize(),
    );
  }
  drcGroup.add(mesh);
}
