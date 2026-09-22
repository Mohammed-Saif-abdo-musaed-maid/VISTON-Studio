export interface Vec { x: number; y: number; }
export function vec(x: number, y: number): Vec { return { x, y }; }
export function addVec(a: Vec, b: Vec): Vec { return { x: a.x + b.x, y: a.y + b.y }; }
export function subVec(a: Vec, b: Vec): Vec { return { x: a.x - b.x, y: a.y - b.y }; }
export function distVec(a: Vec, b: Vec): number { return Math.hypot(a.x - b.x, a.y - b.y); }