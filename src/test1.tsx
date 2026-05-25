import { useStore } from '@xyflow/react';
export function Test() {
  const c = useStore(s => Array.from(s.nodeLookup.values()).filter((n: any) => n.selected).length);
  return c;
}
