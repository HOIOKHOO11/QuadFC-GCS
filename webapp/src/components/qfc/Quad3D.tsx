'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useGS } from '@/lib/qfc/store';

// 3D quadcopter attitude visualization (three.js), driven by the live store
export function Quad3D() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0c);
    scene.fog = new THREE.Fog(0x0a0a0c, 14, 30);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(3.6, 2.6, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0.6, 0);

    // lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dl = new THREE.DirectionalLight(0xffffff, 1.5);
    dl.position.set(4, 8, 3);
    scene.add(dl);
    const dl2 = new THREE.DirectionalLight(0x67e8f9, 0.4);
    dl2.position.set(-5, 3, -4);
    scene.add(dl2);

    // ground grid + axis triad
    const grid = new THREE.GridHelper(16, 16, 0x3f3f46, 0x18181b);
    scene.add(grid);
    const axes = new THREE.AxesHelper(1.4);
    axes.position.y = 0.02;
    scene.add(axes);

    // quad model
    const quad = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x27272a, metalness: 0.4, roughness: 0.5 });
    const armMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.3, roughness: 0.6 });
    const motorMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.6, roughness: 0.4 });
    const propMat = new THREE.MeshStandardMaterial({ color: 0x10b981, transparent: true, opacity: 0.55 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 1.5), bodyMat);
    quad.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.7), new THREE.MeshStandardMaterial({ color: 0x0e7490 }));
    top.position.y = 0.22;
    quad.add(top);

    const arms: THREE.Mesh[] = [];
    const props: THREE.Group[] = [];
    const dirs = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    dirs.forEach(([sx, sz], i) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.7, 10), armMat);
      arm.position.set(sx * 0.75, 0, sz * 0.75);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = -sx * sz * Math.PI / 4;
      arms.push(arm);
      quad.add(arm);
      const mx = sx * 1.18, mz = sz * 1.18;
      const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.26, 14), motorMat);
      motor.position.set(mx, 0.16, mz);
      quad.add(motor);
      const prop = new THREE.Group();
      for (let b = 0; b < 2; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.025, 0.1), propMat);
        blade.rotation.y = b * Math.PI / 2;
        prop.add(blade);
      }
      prop.position.set(mx, 0.32, mz);
      props.push(prop);
      quad.add(prop);
    });

    // nose indicator (front = -Z)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0xf43f5e }));
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0.05, -0.95);
    quad.add(nose);
    quad.position.y = 0.6;
    scene.add(quad);

    // landing legs
    for (const [lx, lz] of [[0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), armMat);
      leg.position.set(lx, -0.4, lz);
      quad.add(leg);
    }

    let raf = 0;
    let spin = 0;
    const resize = () => {
      const w = mount.clientWidth || 480;
      const h = mount.clientHeight || 360;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const { roll, pitch, yaw } = useGS.getState().att;
      const dRoll = THREE.MathUtils.degToRad(roll);
      const dPitch = THREE.MathUtils.degToRad(pitch);
      quad.rotation.set(dPitch, THREE.MathUtils.degToRad(-(yaw ?? 0)), dRoll, 'YXZ');
      const dataFlowing = Date.now() - useGS.getState().conn.lastRxAt < 1500;
      spin += dataFlowing ? 0.35 : 0.02;
      props.forEach((p, i) => { p.rotation.y = spin * (i % 2 === 0 ? 1 : -1); });
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="w-full h-[380px] rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950" dir="ltr" />;
}
