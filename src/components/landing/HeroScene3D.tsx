// Lightweight R3F hero scene: a distorted icosahedron core with orbiting
// crystals and a subtle starfield. Renders client-only to avoid SSR cost.
import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Icosahedron, MeshDistortMaterial, Stars, Environment } from "@react-three/drei";
import type { Mesh } from "three";

function Core() {
  const ref = useRef<Mesh>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.x += dt * 0.15;
    ref.current.rotation.y += dt * 0.2;
  });
  return (
    <Float speed={1.2} rotationIntensity={0.4} floatIntensity={1.2}>
      <Icosahedron ref={ref} args={[1.4, 4]}>
        <MeshDistortMaterial
          color="#f59e0b"
          emissive="#7c3aed"
          emissiveIntensity={0.35}
          roughness={0.15}
          metalness={0.85}
          distort={0.42}
          speed={1.6}
        />
      </Icosahedron>
    </Float>
  );
}

function Shard({ position, color, scale }: { position: [number, number, number]; color: string; scale: number }) {
  return (
    <Float speed={2} rotationIntensity={1.2} floatIntensity={2}>
      <mesh position={position} scale={scale}>
        <octahedronGeometry args={[0.4, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.2} metalness={0.9} />
      </mesh>
    </Float>
  );
}

export default function HeroScene3D() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 50 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={1.2} color="#f59e0b" />
        <pointLight position={[-5, -3, -2]} intensity={1} color="#7c3aed" />
        <pointLight position={[0, 4, -4]} intensity={0.6} color="#22d3ee" />
        <Core />
        <Shard position={[-2.4, 1.2, -1]} color="#7c3aed" scale={0.9} />
        <Shard position={[2.2, -0.8, -0.5]} color="#22d3ee" scale={0.7} />
        <Shard position={[1.6, 1.6, -1.5]} color="#f59e0b" scale={0.5} />
        <Shard position={[-1.8, -1.4, -2]} color="#f472b6" scale={0.6} />
        <Stars radius={40} depth={30} count={1200} factor={3} fade speed={0.5} />
        <Environment preset="city" />
      </Suspense>
    </Canvas>
  );
}
