export function isCopper(name) {
  const n = name.toLowerCase();
  return n.includes("copper") || n.includes(".cu") || n.includes("_cu");
}

export function isPcbBoard(name) {
  const n = name.toLowerCase();
  return !isCopper(name) && (n.includes("_pcb") || n.endsWith("pcb"));
}

export function isSilkscreen(name) {
  const n = name.toLowerCase();
  return n.includes("silks");
}

export function isCopperText(name) {
  return name.endsWith("_text") && isCopper(name);
}

export function isEnclosure(name) {
  return name.toLowerCase() === "enclosure";
}

export function isComponent(name) {
  return (
    !isCopper(name) &&
    !isPcbBoard(name) &&
    !isEnclosure(name) &&
    !isSilkscreen(name)
  );
}
